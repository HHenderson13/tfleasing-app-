import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  NotACancelledOrdersError,
  cancelledVehicle,
  cleanCustomer,
  creditOrders,
  customerKey,
  execCodeFromName,
  matchCancellations,
  mergeDealbookLines,
  parseCancellationsWorkbook,
  rewriteOrderDaysOf,
  type DealbookLine,
} from "./ten-at-ten-cancellations";
import { detectTenAtTenFile, plateOf } from "./ten-at-ten-orders";

const HEADER = ["Sales Executive", "Order Date", "Customer", "Type", "Model", "Registration Number", "Cancelled Date"];

function workbook(rows: unknown[][], created?: Date): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), "ag-grid");
  if (created) wb.Props = { CreatedDate: created };
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const wall = (s: string) => Date.parse(`${s}:00Z`); // "2026-10-09T12:07" as wall clock

describe("fields", () => {
  it("drops the account code and the title for matching", () => {
    expect(cleanCustomer("E0795 Mr James Robinson")).toBe("Mr James Robinson");
    expect(cleanCustomer(" ENAFLO INTERIORS LIMITED")).toBe("ENAFLO INTERIORS LIMITED");
    expect(cleanCustomer("G1202 HFS Tarporley LTD")).toBe("HFS Tarporley LTD");
    expect(customerKey(" Mr Steven Braine")).toBe(customerKey("Steven Braine"));
    expect(customerKey("T/A Griffin Joinery")).toBe("tagriffinjoinery");
  });

  it("rebuilds column E as model then derivative, the way the order list writes it", () => {
    expect(cancelledVehicle("Transit Custom Transit Custom 280L1 2.0TDCi 136 EcoBlue Limited")).toBe("Transit Custom 280L1 2.0TDCi 136 EcoBlue Limited");
    expect(cancelledVehicle("Explorer Explorer 210kW 79kWh Style")).toBe("Explorer 210kW 79kWh Style");
    expect(cancelledVehicle("Explorer Van Explorer Van 210kW 79kWh Select Auto RWD")).toBe("Explorer Van 210kW 79kWh Select Auto RWD");
    expect(cancelledVehicle("Transit Custom Double Cab In Transit Custom 320L2 Doublecab Van 2.0TDCi 136 EcoBlue Limited"))
      .toBe("Transit Custom Double Cab In 320L2 Doublecab Van 2.0TDCi 136 EcoBlue Limited");
    expect(cancelledVehicle("Puma ST-Line")).toBe("Puma ST-Line"); // no repeat: left alone
  });

  it("derives Dealerweb's exec code from a full name", () => {
    expect(execCodeFromName("Deniz Durmaz")).toBe("DeDu");
    expect(execCodeFromName("Minny Hope-Lindley")).toBe("MiHo");
    expect(execCodeFromName("Lou Bailey")).toBe("LoBa");
    expect(execCodeFromName("Harry Henderson")).toBe("HaHe");
    expect(execCodeFromName("Cher")).toBe("");
  });

  it("lifts the plate out of Dealerweb's stock decoration", () => {
    expect(plateOf("TACTICALMP26VWA")).toBe("MP26VWA");
    expect(plateOf("MP26VYNTACTICAL")).toBe("MP26VYN");
    expect(plateOf("mp26 vwh")).toBe("MP26VWH");
    expect(plateOf("TACTICAL")).toBeNull();
    expect(plateOf(null)).toBeNull();
  });
});

describe("parse", () => {
  it("reads the export, strips Harry Henderson / Joseph Rustigini, and keeps identical lines apart", () => {
    const buf = workbook([
      ["Deniz Durmaz", "29 September 2026 17:14", " Mr Steven Braine", "Retail", "Transit Custom Double Cab In Transit Custom 320L2 Doublecab Van 2.0TDCi 136 EcoBlue Limited", "MP26VYNTACTICAL", "9 October 2026 16:45"],
      ["Lou Bailey", "2 October 2026 11:48", "ENAFLO INTERIORS LIMITED", "Retail", "Transit Custom Transit Custom 280L1 2.0TDCi 136 EcoBlue Limited", null, "5 October 2026 14:03"],
      ["Lou Bailey", "2 October 2026 11:48", "ENAFLO INTERIORS LIMITED", "Retail", "Transit Custom Transit Custom 280L1 2.0TDCi 136 EcoBlue Limited", null, "5 October 2026 14:03"],
      ["Harry Henderson", "1 October 2026 10:00", "Someone", "Retail", "Puma Puma ST-Line", null, "2 October 2026 10:00"],
      ["Lou Bailey", "not a date", "Someone", "Retail", "Puma Puma ST-Line", null, "2 October 2026 10:00"],
    ], new Date("2026-10-12T12:33:09Z"));
    expect(detectTenAtTenFile(buf)).toBe("cancellations");
    const p = parseCancellationsWorkbook(buf);
    expect(p).toMatchObject({ rowsInFile: 5, skippedExcluded: 1, skippedUnreadable: 1 });
    expect(p.exportedAt).toBe(wall("2026-10-12T13:33")); // BST
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toMatchObject({
      exec: "Deniz Durmaz", customer: "Mr Steven Braine", orderDay: "2026-09-29", cancelledDay: "2026-10-09",
      model: "Transit Custom", segment: "Van", registration: "MP26VYN",
    });
    expect(p.rows[1].id).not.toBe(p.rows[2].id);
    // The same line keys the same on the next upload — notes hang off it.
    expect(parseCancellationsWorkbook(buf).rows.map((r) => r.id)).toEqual(p.rows.map((r) => r.id));
  });

  it("refuses a file with the wrong columns", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Status", "SE", "Customer"]]), "ag-grid");
    expect(() => parseCancellationsWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))).toThrow(NotACancelledOrdersError);
  });
});

// The 12 Oct 2026 Cancelled Orders export against the order lists of 5 Oct
// (export 38) and 12 Oct (export 46) — the cases the rules were built on.
describe("Re-Write or cancellation", () => {
  const SEPT_LIST = wall("2026-10-05T20:48");
  const OCT_LIST = wall("2026-10-12T07:58");
  let n = 0;
  const line = (o: Partial<DealbookLine>): DealbookLine => ({
    id: `L${++n}`, source: "orders", orderDay: "2026-10-01", exec: "LoBa", customer: "Someone", model: "Transit Custom",
    vehicleRaw: "Transit Custom 280L1", registration: null, seenAt: OCT_LIST, profit: null, ...o,
  });
  const cancel = (id: string, o: { exec: string; orderDay: string; cancelledAt: string; customer: string; model: string; registration?: string | null }) => ({
    id, exec: o.exec, orderDay: o.orderDay, cancelledAt: wall(o.cancelledAt), cancelledDay: o.cancelledAt.slice(0, 10),
    customer: o.customer, model: o.model, registration: o.registration ?? null,
  });

  it("works through the real October export", () => {
    const lines = [
      // Hallett's order, in the Sept list taken the day before it was cancelled.
      line({ id: "hallett", orderDay: "2026-09-07", exec: "GaSh", customer: "Stephen Hallett", model: "Explorer", seenAt: SEPT_LIST, profit: 450 }),
      // ENAFLO re-ordered 5 Oct on new plates.
      line({ id: "enaflo-1", orderDay: "2026-10-05", customer: "ENAFLO INTERIORS LIMITED", registration: "MW76EHP" }),
      line({ id: "enaflo-2", orderDay: "2026-10-05", customer: "ENAFLO INTERIORS LIMITED", registration: "MW76EHR" }),
      // HFS re-ordered with the spec corrected, before the old order was cancelled.
      line({ id: "hfs", orderDay: "2026-09-25", exec: "MiHo", customer: "HFS Tarporley LTD", seenAt: SEPT_LIST }),
      line({ id: "blacklab", orderDay: "2026-10-09", exec: "MiHo", customer: "Black Lab Group Ltd", model: "Explorer Van" }),
      // Griffin: the original (Sept list) and the re-order; CA Waters had the plate first.
      line({ id: "cawaters", orderDay: "2026-09-28", exec: "GaSh", customer: "CA Waters LTD", registration: "MP26UZC", seenAt: SEPT_LIST }),
      line({ id: "griffin-old", orderDay: "2026-09-30", customer: "T/A Griffin Joinery", registration: "MP26UZC", seenAt: SEPT_LIST, profit: -120 }),
      line({ id: "griffin-new", orderDay: "2026-10-07", customer: "T/A Griffin Joinery", registration: "MP26UZC" }),
      // Omnia: ordered, cancelled and re-ordered the same day.
      line({ id: "omnia", orderDay: "2026-10-09", exec: "DoJa", customer: "Omnia", registration: "MP26VWH" }),
      // Braine's three vans, and their re-order under his company.
      ...["MP26VYN", "MP26VYF", "MP26VYC"].flatMap((reg) => [
        line({ id: `braine-${reg}`, orderDay: "2026-09-29", exec: "DeDu", customer: "Steven Braine", registration: reg, seenAt: SEPT_LIST, profit: -1803 }),
        line({ id: `dea-${reg}`, orderDay: "2026-10-09", exec: "DeDu", customer: "DEA GATE AUTOMATION LTD", registration: reg }),
      ]),
    ];
    const cancels = [
      cancel("robinson", { exec: "Ola Malejczyk", orderDay: "2026-05-27", cancelledAt: "2026-10-02T09:12", customer: "Mr James Robinson", model: "Explorer" }),
      cancel("enaflo-a", { exec: "Lou Bailey", orderDay: "2026-10-02", cancelledAt: "2026-10-05T14:03", customer: "ENAFLO INTERIORS LIMITED", model: "Transit Custom", registration: "MP26VWA" }),
      cancel("enaflo-b", { exec: "Lou Bailey", orderDay: "2026-10-02", cancelledAt: "2026-10-05T14:03", customer: "ENAFLO INTERIORS LIMITED", model: "Transit Custom", registration: "MP26VVJ" }),
      cancel("hallett", { exec: "Deniz Durmaz", orderDay: "2026-09-07", cancelledAt: "2026-10-06T09:20", customer: "Mr Stephen Hallett", model: "Explorer" }),
      cancel("hfs", { exec: "Minny Hope-Lindley", orderDay: "2026-07-08", cancelledAt: "2026-10-06T09:21", customer: "HFS Tarporley LTD", model: "Transit Custom" }),
      cancel("blacklab", { exec: "Minny Hope-Lindley", orderDay: "2026-07-31", cancelledAt: "2026-10-07T13:15", customer: "Black Lab Group Ltd", model: "Explorer Van" }),
      cancel("griffin", { exec: "Lou Bailey", orderDay: "2026-09-30", cancelledAt: "2026-10-07T13:58", customer: "T/A Griffin Joinery", model: "Transit Custom", registration: "MP26UZC" }),
      cancel("omnia", { exec: "Douglas James", orderDay: "2026-10-09", cancelledAt: "2026-10-09T12:07", customer: "Omnia", model: "Transit Custom", registration: "MP26VWH" }),
      ...["MP26VYN", "MP26VYF", "MP26VYC"].map((reg) =>
        cancel(`braine-${reg}`, { exec: "Deniz Durmaz", orderDay: "2026-09-29", cancelledAt: "2026-10-09T16:45", customer: "Mr Steven Braine", model: "Transit Custom", registration: reg })),
    ];
    const { matches, originalIds } = matchCancellations(cancels, lines);
    const status = Object.fromEntries([...matches].map(([id, m]) => [id, m.status]));
    expect(status).toEqual({
      robinson: "proper", hallett: "proper",
      "enaflo-a": "rewrite", "enaflo-b": "rewrite", hfs: "rewrite", blacklab: "rewrite", griffin: "rewrite", omnia: "rewrite",
      "braine-MP26VYN": "rewrite", "braine-MP26VYF": "rewrite", "braine-MP26VYC": "rewrite",
    });
    // Each ENAFLO cancellation took its own re-order.
    expect(new Set([matches.get("enaflo-a")!.reorder!.registration, matches.get("enaflo-b")!.reorder!.registration])).toEqual(new Set(["MW76EHP", "MW76EHR"]));
    // A plate re-ordered under another customer, by the same exec.
    expect(matches.get("braine-MP26VYN")!.reorder).toMatchObject({ customer: "DEA GATE AUTOMATION LTD", on: "registration" });
    expect(matches.get("griffin")!.reorder).toMatchObject({ orderDay: "2026-10-07", on: "registration" });
    // The cancelled orders still held, which Orders leaves out — never CA
    // Waters (another exec's customer on the same plate) nor Omnia's
    // replacement, listed after the cancellation.
    expect(originalIds).toEqual(new Set(["hallett", "griffin-old", "braine-MP26VYN", "braine-MP26VYF", "braine-MP26VYC"]));
    expect(matches.get("hallett")!.originalProfit).toBe(450);

    // Order Take: every Re-Write counts once, on the original order day.
    const days = rewriteOrderDaysOf(cancels, matches, new Map());
    const { lines: credited, moved } = creditOrders(lines, originalIds, days);
    const dayOf = Object.fromEntries(credited.map((l) => [l.id, l.orderDay]));
    // Braine's vans: September orders, not October ones as well.
    expect(["dea-MP26VYN", "dea-MP26VYF", "dea-MP26VYC"].map((id) => dayOf[id])).toEqual(["2026-09-29", "2026-09-29", "2026-09-29"]);
    expect(dayOf["griffin-new"]).toBe("2026-09-30");
    expect(dayOf.blacklab).toBe("2026-07-31");
    expect(dayOf.hfs).toBe("2026-07-08");
    expect([dayOf["enaflo-1"], dayOf["enaflo-2"]]).toEqual(["2026-10-02", "2026-10-02"]);
    expect(dayOf.omnia).toBe("2026-10-09"); // same day: nothing moves
    expect(dayOf.cawaters).toBe("2026-09-28"); // not a re-order: untouched
    expect(credited.some((l) => originalIds.has(l.id))).toBe(false);
    expect(moved).toHaveLength(8);
    // Ordered in October by Order Take: what's left once the Re-Writes go back.
    expect(credited.filter((l) => l.orderDay >= "2026-10-01").map((l) => l.id).sort()).toEqual(["enaflo-1", "enaflo-2", "omnia"]);
  });

  it("follows a manager's call over the matching when crediting Re-Writes", () => {
    const c = cancel("c", { exec: "Lou Bailey", orderDay: "2026-09-20", cancelledAt: "2026-10-03T10:00", customer: "Fleet Co", model: "Transit Custom" });
    const reorder = line({ id: "re", orderDay: "2026-10-04", customer: "Fleet Co" });
    const { matches, originalIds } = matchCancellations([c], [reorder]);
    expect(rewriteOrderDaysOf([c], matches, new Map())).toEqual(new Map([["re", "2026-09-20"]]));
    // "Not a Re-Write": the re-order is a new sale on its own day.
    const notRewrite = rewriteOrderDaysOf([c], matches, new Map([["c", "proper"]]));
    expect(creditOrders([reorder], originalIds, notRewrite).lines[0].orderDay).toBe("2026-10-04");
    // "It's a Re-Write" with no re-order found: nothing to move.
    const { matches: none } = matchCancellations([c], []);
    expect(rewriteOrderDaysOf([c], none, new Map([["c", "rewrite"]])).size).toBe(0);
  });

  it("treats a plate that moved to another exec's customer as reallocated stock, not a Re-Write", () => {
    const { matches } = matchCancellations(
      [cancel("c", { exec: "Lou Bailey", orderDay: "2026-09-01", cancelledAt: "2026-09-10T10:00", customer: "First Customer", model: "Transit Custom", registration: "MP26UZC" })],
      [line({ id: "other", orderDay: "2026-09-12", exec: "GaSh", customer: "Second Customer", registration: "MP26UZC" })],
    );
    expect(matches.get("c")!.status).toBe("proper");
  });

  it("needs the re-order within 30 days of the cancellation", () => {
    const c = cancel("c", { exec: "Lou Bailey", orderDay: "2026-06-01", cancelledAt: "2026-06-10T10:00", customer: "Fleet Co", model: "Transit Custom" });
    expect(matchCancellations([c], [line({ orderDay: "2026-07-10", customer: "Fleet Co" })]).matches.get("c")!.status).toBe("rewrite");
    expect(matchCancellations([c], [line({ orderDay: "2026-07-11", customer: "Fleet Co" })]).matches.get("c")!.status).toBe("proper");
  });

  it("lets one re-order answer for one cancellation only", () => {
    const cs = [1, 2, 3].map((i) => cancel(`c${i}`, { exec: "Lou Bailey", orderDay: "2026-09-01", cancelledAt: `2026-09-10T10:0${i}`, customer: "Fleet Co", model: "Transit Custom" }));
    const { matches } = matchCancellations(cs, [line({ orderDay: "2026-09-12", customer: "Fleet Co" })]);
    expect([...matches.values()].filter((m) => m.status === "rewrite")).toHaveLength(1);
  });

  it("doesn't take a same-day order last seen before the cancellation as its re-order", () => {
    const c = cancel("c", { exec: "Douglas James", orderDay: "2026-10-09", cancelledAt: "2026-10-09T12:07", customer: "Omnia", model: "Transit Custom", registration: "MP26VWH" });
    const early = line({ id: "early", orderDay: "2026-10-09", exec: "DoJa", customer: "Omnia", registration: "MP26VWH", seenAt: wall("2026-10-09T11:50") });
    const { matches, originalIds } = matchCancellations([c], [early]);
    expect(matches.get("c")!.status).toBe("proper");
    expect(originalIds).toEqual(new Set(["early"]));
  });

  it("counts an order held on both Dealbook reports once", () => {
    const o = line({ id: "o", orderDay: "2026-09-12", customer: "Fleet Co", registration: "AB26CDE" });
    const d = { ...o, id: "d", source: "deliveries" as const };
    const extra = line({ id: "x", source: "deliveries", orderDay: "2026-09-14", customer: "Fleet Co" });
    expect(mergeDealbookLines([o], [d, extra]).map((l) => l.id)).toEqual(["o", "x"]);
  });
});
