import { describe, expect, it } from "vitest";
import { bonusFor, bonusTypeOf, matchExtract, rateText, ratesText, vehicleSimilarity, type BonusRates, type DealMatchLine, type ExtractMatchLine } from "./ten-at-ten-bonus";
import { NotADealbookExtractError, applyBonuses, isDealbookExtractHeader, parseExtractCsv, type DealbookStored } from "./ten-at-ten-extract";
import { makeDeliveryKey } from "./ten-at-ten-orders";
import { execCodeFromName } from "./sales-leaderboard";

// The user's Q4 2026 (2026-10-20): ICE Car nothing, BEV Car 4.5%, ICE Van
// 2.5%, BEV Van 2.5% and £1,500 more in October only.
const Q4: BonusRates = {};
for (const m of ["2026-10", "2026-11", "2026-12"]) {
  Q4[m] = {
    "ICE Car": { pct: 0, amount: 0 }, "BEV Car": { pct: 4.5, amount: 0 }, "ICE Van": { pct: 2.5, amount: 0 },
    "BEV Van": { pct: 2.5, amount: m === "2026-10" ? 1500 : 0 },
  };
}

describe("bonus type", () => {
  it("splits vans by fuel, plug-in hybrids being ICE", () => {
    expect(bonusTypeOf("Van", "Transit E-Custom", "E-Transit Custom 320L1 71kWh 136 Limited Auto")).toBe("BEV Van");
    expect(bonusTypeOf("Van", "Explorer Van", "Explorer Van 210kW 79kWh Select Auto RWD")).toBe("BEV Van");
    expect(bonusTypeOf("Van", "Ranger", "Ranger Double Cab Pick Up 2.3 EcoBoost Phev Wildtrak Auto")).toBe("ICE Van");
    expect(bonusTypeOf("Van", "Transit Connect", "Transit Connect Flex Cab 240L1 1.5 EcoBoost Trend Phev Auto")).toBe("ICE Van");
    expect(bonusTypeOf("Van", "Transit Custom", "Transit Custom 320L1 2.0TDCi 136 EcoBlue Limited")).toBe("ICE Van");
  });

  it("follows the report's segment for cars", () => {
    expect(bonusTypeOf("BEV Car", "Capri", "Capri 210kW 79kWh Premium")).toBe("BEV Car");
    expect(bonusTypeOf("ICE Car", "Kuga", "Kuga 2.5 Duratec 243 Phev St-Line X Auto")).toBe("ICE Car");
  });
});

describe("bonus for a deal", () => {
  it("is its type's rate in the month it delivers, on its Basic", () => {
    // David Jenkins' Capri, Basic £41,512.50, delivered 8 Oct 2026.
    expect(bonusFor("BEV Car", "2026-10-08", 41512.5, Q4)).toEqual({ bonus: 1868.06, flag: "ok" });
    // Pedro Condez's Transit Custom, Basic £46,300.
    expect(bonusFor("ICE Van", "2026-10-02", 46300, Q4)).toEqual({ bonus: 1157.5, flag: "ok" });
    expect(bonusFor("ICE Car", "2026-10-12", 25000, Q4)).toEqual({ bonus: 0, flag: "ok" });
  });

  it("pays the BEV Van's £1,500 in October only", () => {
    expect(bonusFor("BEV Van", "2026-10-21", 40000, Q4)).toEqual({ bonus: 2500, flag: "ok" });
    expect(bonusFor("BEV Van", "2026-11-27", 40000, Q4)).toEqual({ bonus: 1000, flag: "ok" });
  });

  it("follows the delivery date, not the order date — and says why when it can't be worked out", () => {
    expect(bonusFor("BEV Car", "2027-01-29", 30745.83, Q4)).toEqual({ bonus: 0, flag: "noScheme" });
    expect(bonusFor("BEV Car", null, 30745.83, Q4)).toEqual({ bonus: 0, flag: "noDate" });
    // A percentage due with no Basic held: only the £ part counts.
    expect(bonusFor("BEV Van", "2026-10-30", null, Q4)).toEqual({ bonus: 1500, flag: "noBasic" });
    expect(bonusFor("BEV Car", "2026-10-30", null, Q4)).toEqual({ bonus: 0, flag: "noBasic" });
    // Nothing due: no Basic needed.
    expect(bonusFor("ICE Car", "2026-10-30", null, Q4)).toEqual({ bonus: 0, flag: "ok" });
  });
});

describe("rates in words", () => {
  it("says a rate as briefly as it can", () => {
    expect(rateText({ pct: 4.5, amount: 0 })).toBe("4.5% of Basic");
    expect(rateText({ pct: 2.5, amount: 1500 })).toBe("2.5% of Basic + £1,500");
    expect(rateText({ pct: 0, amount: 500 })).toBe("£500");
    expect(rateText({ pct: 0, amount: 0 })).toBe("nothing");
  });

  it("runs months together where they agree", () => {
    const q4 = ["2026-10", "2026-11", "2026-12"];
    expect(ratesText("BEV Car", q4, Q4)).toBe("4.5% of Basic");
    expect(ratesText("BEV Van", q4, Q4)).toBe("Oct 2.5% of Basic + £1,500 · Nov–Dec 2.5% of Basic");
    expect(ratesText("BEV Car", ["2026-12", "2027-01"], Q4)).toBe("Dec 4.5% of Basic · Jan no scheme set");
  });
});

describe("matching a deal to its Dealbook Extract line", () => {
  const codes = (name: string) => [execCodeFromName(name)];
  const deal = (over: Partial<DealMatchLine>): DealMatchLine =>
    ({ id: "d", orderDay: "2026-04-22", exec: "MiHo", customer: "", vehicle: "", registration: null, profit: null, ...over });
  const line = (over: Partial<ExtractMatchLine>): ExtractMatchLine =>
    ({ id: "e", orderDay: "2026-04-22", execName: "Minny Hope-Lindley", customer: "", vehicle: "", registration: null, profit: null, ...over });

  it("reads the same vehicle through Dealerweb's two ways of writing it", () => {
    expect(vehicleSimilarity("Explorer 210kW 79kWh Style 5 Door 5 Seat MJ76LWL", "Explorer Explorer 210kW 79kWh Style")).toBe(1);
    expect(vehicleSimilarity("Transit Custom Double Cab In 320L1 2.0TDCi 150 EcoBlue Sport 2 Door 3 Seat .",
      "Transit Custom Double Cab In Transit Custom 320L1 Doublecab Van 2.0TDCi 150 EcoBlue Sport")).toBeGreaterThan(0.9);
  });

  it("matches the account to its contact: same day, same vehicle, same exec", () => {
    // 19 Oct delivered list vs 20 Oct extract: the account, and the person.
    const m = matchExtract(
      [deal({ id: "orion", customer: "ORION SCREEN PROCESS LIMITED", vehicle: "Explorer 210kW 79kWh Style 5 Door 5 Seat", profit: -367.73 })],
      [line({ id: "blackburn", customer: "Mr Gary Blackburn", vehicle: "Explorer Explorer 210kW 79kWh Style", registration: "MJ76RTX", profit: -367.73 })],
      codes,
    );
    expect(m.get("orion")).toBe("blackburn");
  });

  it("gives two Explorers ordered the same day by one exec their own lines", () => {
    const m = matchExtract(
      [
        deal({ id: "morgan", orderDay: "2026-04-24", customer: "David Morgan", vehicle: "Explorer 210kW 79kWh Select Driver Assist Pack 5 Door 5 Seat MX76HXS", registration: "MX76HXS" }),
        deal({ id: "hill", orderDay: "2026-04-24", customer: "Andrew Hill", vehicle: "Explorer 210kW 79kWh Style 5 Door 5 Seat" }),
      ],
      [
        line({ id: "byrne", orderDay: "2026-04-24", customer: "Mr Michael Byrne", vehicle: "Explorer Explorer 210kW 79kWh Style" }),
        line({ id: "dmorgan", orderDay: "2026-04-24", customer: "Mr David Morgan", vehicle: "Explorer Explorer 210kW 79kWh Select Driver Assist Pack", registration: "MX76HXS" }),
      ],
      codes,
    );
    expect(m.get("morgan")).toBe("dmorgan");
    expect(m.get("hill")).toBe("byrne");
  });

  it("needs more than the vehicle: a different exec, plate and customer is a different deal", () => {
    const m = matchExtract(
      [deal({ id: "a", exec: "OlMa", customer: "Someone Else Ltd", vehicle: "Explorer 210kW 79kWh Style" })],
      [line({ id: "b", customer: "Mr Gary Blackburn", vehicle: "Explorer Explorer 210kW 79kWh Style" })],
      codes,
    );
    expect(m.size).toBe(0);
    // Nor a different vehicle on the same day by the same exec.
    expect(matchExtract([deal({ id: "a", vehicle: "Transit Custom 320L1 2.0TDCi 136 EcoBlue Limited" })],
      [line({ id: "b", vehicle: "Capri Capri 210kW 79kWh Premium" })], codes).size).toBe(0);
  });
});

describe("bonuses on each order and delivery", () => {
  const held = (over: Partial<DealbookStored>): DealbookStored => ({
    id: "x", orderDay: "2026-10-01", exec: "LoBa", customer: "Customer", model: "Capri", derivative: null, derivativeKey: null,
    segment: "BEV Car", product: "HP", termMonths: 48, funder: "Lex", delivery: "Awaiting delivery", deliveryDay: "2026-10-30",
    vehicleRaw: "Capri 140kW 58kWh Premium Auto 5 Door 5 Seat", registration: null, profit: -1500, seenAt: 1, ...over,
  });
  const extractLine = (over: Partial<ExtractMatchLine & { basic: number | null; deliveryDay: string }>) => ({
    id: "e", orderDay: "2026-10-01", execName: "Lou Bailey", customer: "Mr Customer", vehicle: "Capri Capri 140kW 58kWh Premium Auto",
    registration: null, profit: null, basic: 40000, deliveryDay: "2026-11-27", ...over,
  });

  it("dates an order's bonus by its delivered line when it has one, and borrows that line's Basic", () => {
    // Ordered with column AK saying 30 Oct; the delivered list now says 27 Nov.
    const order = held({ id: "o1" });
    const delivery = held({ id: makeDeliveryKey("o1", "2026-11-27"), delivery: "Due", deliveryDay: "2026-11-27", customer: "Customer T/A Trading" });
    const out = applyBonuses({ orders: [order], deliveries: [delivery], extract: [extractLine({ customer: "Customer T/A Trading" })], rates: Q4, names: new Map() });
    expect(out.deliveries[0]).toMatchObject({ orderDay: "2026-11-27", delivery: "Due", bonus: 1800, bonusFlag: "ok", bonusType: "BEV Car", bonusDay: "2026-11-27" });
    expect(out.orders[0]).toMatchObject({ id: "o1", orderDay: "2026-10-01", bonus: 1800, bonusDay: "2026-11-27" });
  });

  it("falls back to the extract's delivery date, then to the order's own", () => {
    const viaExtract = applyBonuses({ orders: [held({ id: "o2" })], deliveries: [], extract: [extractLine({ deliveryDay: "2026-12-18" })], rates: Q4, names: new Map() });
    expect(viaExtract.orders[0]).toMatchObject({ bonusDay: "2026-12-18", bonus: 1800, bonusFlag: "ok" });
    // No extract line at all: its own date, and no Basic to pay 4.5% on.
    const own = applyBonuses({ orders: [held({ id: "o3", deliveryDay: "2026-10-30" })], deliveries: [], extract: [], rates: Q4, names: new Map() });
    expect(own.orders[0]).toMatchObject({ bonusDay: "2026-10-30", bonus: 0, bonusFlag: "noBasic" });
    // Delivering in 2027, before a scheme is set.
    const later = applyBonuses({ orders: [held({ id: "o4", deliveryDay: "2027-01-29" })], deliveries: [], extract: [], rates: Q4, names: new Map() });
    expect(later.orders[0]).toMatchObject({ bonusFlag: "noScheme", bonus: 0 });
  });
});

// The extract's real header row (Dealbook_Extract_20_10_2026.csv), Basic in BQ.
const HEADER = "Branch,Conf,New/Used,Supp,Stock No.,Reg No,Customer,Model,Order Date,days in Stock,SE,Deliv Date,Deliv Status,ACT Chassis Profit,ACT Add. Bonus,ACT Metal Subsidy,ACT Recon/Other Costs,ACT Oallow /Discount,ACT Accessory Profit,ACT Warranty Cost,ACT Total Vehicle Profit,ACT Finance Income,ACT Finance MB,ACT Tyre Ins. Income,ACT Finance Subsidy,ACT CPI Income,ACT Smart Repair,ACT GAP/RTI Income,ACT Paint Protection,ACT Warranty,ACT Total F & I Income,ACT Total Gross Profit,Confirm Notes,HP Type,CP TYPE,Finance Co,Loan Amount,PCP MFV,Per Month,HP Months,Rate,Base Rate,GAP Premium,GAP Policy No.,Tyre Premium,Tyre Policy No.,Referral,Warranty Premium,Warranty Policy No.,Cosmetic Premium,Cosmetic Policy No.,PCP MPA,PEX Allowance,PEX Settlement,PEX Reg No,PEX Allowance2,PEX Settlement2,PEX Reg No2,ACT Alloy Insurance ,ACT T&A Insurance,T&A Premium,T&A Policy No.,Alloy Premium,Alloy Policy No.,Portal Referral,ACT Key Cover.,Key Cover Premium.,Key Cover Policy No.,Basic,Options,Net Price,Basic Margin,Options Margin,Wholesale,Finance Deposit,Finance Amount,Deposit,ACT Delivery Income,Customer Id,Registered Date,Invoice Date,Sales Type,Sales Sub-Type,OrderDelivDays,Business Manager,House Charge Margin,ACT Other Insurance,Passed Finance,PX Finance Company,PX Agreement Number,Non-Op,Vehicle Type,VIN,Distance Sale?";
const COLS = HEADER.split(",");

function csvLine(values: Record<string, string>): string {
  return COLS.map((c) => {
    const v = values[c.trim()] ?? "";
    return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

describe("the Dealbook Extract", () => {
  const capri = {
    "Reg No": "SEPTEMBERTAX", Customer: "Mr David Jenkins", Model: "Capri Capri 210kW 79kWh Premium Driver Assist Pack Auto", "Order Date": "14/04/2026",
    SE: "Gary Shufflebotham", "Deliv Date": "08/10/2026", "Deliv Status": "Dlv", "ACT Add. Bonus": "0", "ACT Total Gross Profit": "-408.85",
    Basic: "41512.5", Options: "666.67", "Vehicle Type": "Car",
  };
  const van = {
    "Reg No": "ML76AVX", Customer: "Mr Pedro Condez", Model: "Transit Custom Transit Custom 320L1 2.0TDCi EcoBlue Sport Auto AWD", "Order Date": "21/04/2026",
    SE: "Gary Shufflebotham", "Deliv Date": "02/10/2026", "Deliv Status": "Est", "ACT Add. Bonus": "1064.9", "ACT Total Gross Profit": "-32.13",
    Basic: "46300", "Vehicle Type": "LCV",
  };
  const file = (lines: Record<string, string>[], header = HEADER) => Buffer.from(`﻿${header}\n${lines.map(csvLine).join("\n")}\n`, "utf8");

  it("knows its header by Basic in column BQ", () => {
    expect(COLS[68]).toBe("Basic");
    expect(isDealbookExtractHeader(COLS)).toBe(true);
    expect(isDealbookExtractHeader(COLS.slice(1))).toBe(false);
  });

  it("reads UK dates day first, Basic from BQ, and the delivery status", () => {
    const p = parseExtractCsv(file([capri, van]));
    expect(p.rowsInFile).toBe(2);
    expect(p.rows[0]).toMatchObject({
      orderDay: "2026-04-14", deliveryDay: "2026-10-08", deliveryStatus: "Delivered", execName: "Gary Shufflebotham",
      customer: "Mr David Jenkins", basic: 41512.5, options: 666.67, profit: -408.85, addBonus: 0, vehicleType: "Car",
      registration: null, // SEPTEMBERTAX is no plate
    });
    expect(p.rows[1]).toMatchObject({ orderDay: "2026-04-21", deliveryDay: "2026-10-02", deliveryStatus: "Due", registration: "ML76AVX", basic: 46300, addBonus: 1064.9 });
    expect(new Set(p.rows.map((r) => r.id)).size).toBe(2);
  });

  it("keeps identical vehicles on one deal apart, and strips Harry Henderson / Joseph Rustigini", () => {
    const p = parseExtractCsv(file([capri, capri, { ...van, SE: "Harry Henderson" }]));
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].id).not.toBe(p.rows[1].id);
    expect(p.skippedExcluded).toBe(1);
  });

  it("stops if column BQ isn't Basic", () => {
    const moved = COLS.filter((c) => c !== "Wholesale");
    moved.splice(60, 0, "Wholesale");
    expect(() => parseExtractCsv(file([], moved.join(",")))).toThrow(NotADealbookExtractError);
    expect(() => parseExtractCsv(file([], moved.join(",")))).toThrow(/column BQ should be Basic/);
  });
});
