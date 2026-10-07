import { describe, it, expect } from "vitest";
import {
  buildSlots,
  competitorTable,
  dedupeListings,
  distinctNumeric,
  segmentOf,
  summarise,
  vehicleTable,
  type Listing,
} from "./market-slots";

// A Transit Custom PHEV at 48 months / 5k miles / 3 upfront — the slot that
// showed TrustFord Transit Centre four times on the live site.
const base: Listing = {
  id: 0,
  segment: "van",
  range: "Transit Custom",
  model: "Transit Custom 320 L1 Fwd",
  derivative: "2.5 PHEV 232ps H1 Van Trend Auto",
  contractLengthMonths: 48,
  annualMileage: 5000,
  depositMonths: 3,
  financeType: "Business",
  monthlyPriceGbp: 489.71,
  brokerDealerName: "TrustFord Transit Centre",
  dealIdentifier: "L0104690000001528294",
};

let nextId = 1;
const row = (over: Partial<Listing>): Listing => ({ ...base, id: nextId++, ...over });

describe("dedupeListings", () => {
  it("drops the same deal returned by two search URLs", () => {
    // leasing.com lists PHEV vans under fuel=Petrol AND fuel=Plugin+Hybrid.
    const a = row({});
    const b = row({});
    const { rows, removed } = dedupeListings([a, b]);
    expect(rows).toEqual([a]);
    expect(removed).toBe(1);
  });

  it("keeps the same deal id on a different profile", () => {
    const a = row({});
    const b = row({ annualMileage: 6000 });
    const c = row({ contractLengthMonths: 36 });
    expect(dedupeListings([a, b, c]).removed).toBe(0);
  });

  it("never merges rows that have no deal id", () => {
    const a = row({ dealIdentifier: null });
    const b = row({ dealIdentifier: "" });
    expect(dedupeListings([a, b]).removed).toBe(0);
  });
});

describe("buildSlots", () => {
  it("shows a broker once in a slot, however many times it was scraped", () => {
    const slots = buildSlots(dedupeListings([row({}), row({})]).rows);
    expect(slots).toHaveLength(1);
    expect(slots[0].offers).toHaveLength(1);
  });

  it("keeps different van models apart even when the derivative text matches", () => {
    // The original fault: an L1 and an L2 shared one slot because only the
    // derivative was in the key.
    const l1 = row({ model: "Transit Custom 320 L1 Fwd", monthlyPriceGbp: 489.71 });
    const l2 = row({ model: "Transit Custom 320 L2 Fwd", monthlyPriceGbp: 502.66, dealIdentifier: "L2" });
    const slots = buildSlots([l1, l2]);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.tf?.monthly).sort()).toEqual([489.71, 502.66]);
  });

  it("separates every part of the payment profile", () => {
    const slots = buildSlots([
      row({}),
      row({ contractLengthMonths: 36 }),
      row({ annualMileage: 10000 }),
      row({ depositMonths: 6 }),
      row({ financeType: "Personal" }),
    ]);
    expect(slots).toHaveLength(5);
  });

  it("keeps a broker's cheapest listing and counts the others", () => {
    // Rivervale posts two prices per profile; nothing scraped says why.
    const slots = buildSlots([
      row({ brokerDealerName: "Rivervale", monthlyPriceGbp: 460, dealIdentifier: "R1" }),
      row({ brokerDealerName: "Rivervale", monthlyPriceGbp: 437.2, dealIdentifier: "R2" }),
      row({ brokerDealerName: "Rivervale", monthlyPriceGbp: 470, dealIdentifier: "R3" }),
    ]);
    expect(slots[0].offers).toHaveLength(1);
    expect(slots[0].offers[0].monthly).toBe(437.2);
    expect(slots[0].offers[0].listings).toBe(3);
  });

  it("prices TF against the cheapest competitor and ranks among sellers", () => {
    const [s] = buildSlots([
      row({ monthlyPriceGbp: 480 }),
      row({ brokerDealerName: "Select", monthlyPriceGbp: 470, dealIdentifier: "S" }),
      row({ brokerDealerName: "Leasey", monthlyPriceGbp: 475, dealIdentifier: "L" }),
      row({ brokerDealerName: "VEHICLEFLEX", monthlyPriceGbp: 520, dealIdentifier: "V" }),
    ]);
    expect(s.best?.broker).toBe("Select");
    expect(s.gap).toBeCloseTo(10);
    expect(s.rank).toBe(3);
    expect(s.sellers).toBe(4);
    expect(s.offers.map((o) => o.monthly)).toEqual([470, 475, 480, 520]);
  });

  it("does not count a tie against TF", () => {
    const [s] = buildSlots([
      row({ monthlyPriceGbp: 470 }),
      row({ brokerDealerName: "Select", monthlyPriceGbp: 470, dealIdentifier: "S" }),
    ]);
    expect(s.rank).toBe(1);
    expect(s.gap).toBe(0);
  });

  it("leaves gap and rank empty where only one side is listed", () => {
    const [mktOnly] = buildSlots([row({ brokerDealerName: "Select" })]);
    expect(mktOnly.tf).toBeNull();
    expect(mktOnly.gap).toBeNull();
    expect(mktOnly.rank).toBeNull();
    const [tfOnly] = buildSlots([row({})]);
    expect(tfOnly.best).toBeNull();
    expect(tfOnly.gap).toBeNull();
    expect(tfOnly.rank).toBe(1);
  });

  it("ignores rows with no usable price", () => {
    expect(buildSlots([row({ monthlyPriceGbp: null }), row({ monthlyPriceGbp: 0 })])).toEqual([]);
  });
});

describe("segmentOf", () => {
  it("reads the segment from the leasing.com search URL", () => {
    // "Explorer" is a car and a van; the URL is what tells them apart.
    expect(segmentOf("https://leasing.com/van-leasing/search/?range=Explorer", "Van")).toBe("van");
    expect(segmentOf("https://leasing.com/car-leasing/search/?range=Explorer", "SUV")).toBe("car");
    // The URL wins over the body style.
    expect(segmentOf("https://leasing.com/car-leasing/search/", "Van")).toBe("car");
  });

  it("falls back to the body style with no URL", () => {
    for (const body of ["Van", "Crew Bus", "Standard Roof Minibus", "Double Cab Pick-up", "Chassis Cab", "Window Van", "High Volume/High Roof Van"]) {
      expect(segmentOf(null, body), body).toBe("van");
    }
    for (const body of ["SUV", "Hatchback", "Estate", null]) {
      expect(segmentOf("", body), String(body)).toBe("car");
    }
  });
});

describe("summaries", () => {
  const slots = buildSlots([
    // Slot 1: TF 480 vs best 470 → +10, rank 2
    row({ monthlyPriceGbp: 480 }),
    row({ brokerDealerName: "Select", monthlyPriceGbp: 470, dealIdentifier: "S1" }),
    // Slot 2: TF 400 vs best 420 → -20, rank 1
    row({ annualMileage: 6000, monthlyPriceGbp: 400 }),
    row({ annualMileage: 6000, brokerDealerName: "Select", monthlyPriceGbp: 420, dealIdentifier: "S2" }),
    row({ annualMileage: 6000, brokerDealerName: "Leasey", monthlyPriceGbp: 430, dealIdentifier: "L2" }),
    // Slot 3: market only — not compared
    row({ annualMileage: 8000, brokerDealerName: "Leasey", monthlyPriceGbp: 300, dealIdentifier: "L3" }),
  ]);

  it("averages only slots where both sides are priced", () => {
    const s = summarise(slots);
    expect(s.compared).toBe(2);
    expect(s.cheapest).toBe(1);
    expect(s.gap).toBeCloseTo(-5);
    expect(s.tfAvg).toBeCloseTo(440);
    expect(s.mktAvg).toBeCloseTo(445);
  });

  it("is empty, not zero, with nothing to compare", () => {
    expect(summarise([])).toEqual({ compared: 0, cheapest: 0, tfAvg: null, mktAvg: null, gap: null });
  });

  it("counts undercuts per competitor on head-to-head slots only", () => {
    const table = competitorTable(slots);
    const select = table.find((r) => r.broker === "Select")!;
    expect(select).toMatchObject({ headToHead: 2, undercuts: 1 });
    expect(select.avgUndercut).toBeCloseTo(10);
    // Leasey's £300 is on a slot TF doesn't list — not an undercut.
    expect(table.find((r) => r.broker === "Leasey")).toMatchObject({ headToHead: 1, undercuts: 0, avgUndercut: null });
    expect(table[0].broker).toBe("Select");
  });

  it("rolls slots up per vehicle", () => {
    const vs = vehicleTable(slots);
    expect(vs).toHaveLength(1);
    expect(vs[0].tfListed).toBe(true);
    expect(vs[0].summary.compared).toBe(2);
  });

  it("orders terms and mileages numerically", () => {
    const s = buildSlots([
      row({ contractLengthMonths: 48 }),
      row({ contractLengthMonths: 18 }),
      row({ contractLengthMonths: 36 }),
    ]);
    expect(distinctNumeric(s, (x) => x.term)).toEqual(["18", "36", "48"]);
  });
});
