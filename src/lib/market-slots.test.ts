import { describe, it, expect } from "vitest";
import {
  buildHeadlines,
  buildSlots,
  competitorTable,
  dedupeListings,
  distinctNumeric,
  rangeOf,
  segmentOf,
  summarise,
  summariseHeadlines,
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

describe("rangeOf", () => {
  it("names the Explorer van apart from the Explorer car", () => {
    // leasing.com files both under "Explorer".
    expect(rangeOf({ range: "Explorer", model: "Explorer Electric", segment: "van" })).toBe("Explorer Van");
    expect(rangeOf({ range: "Explorer", model: "Explorer Estate", segment: "car" })).toBe("Explorer");
  });

  it("gives electric vans their own range", () => {
    expect(rangeOf({ range: "Transit Custom", model: "E-Transit Custom 320 L1 Electric Awd", segment: "van" })).toBe("E-Transit Custom");
    expect(rangeOf({ range: "Transit Courier", model: "E-Transit Courier", segment: "van" })).toBe("E-Transit Courier");
    expect(rangeOf({ range: "Transit Custom", model: "Transit Custom 320 L1 Fwd", segment: "van" })).toBe("Transit Custom");
  });

  it("leaves commercial ranges alone", () => {
    for (const range of ["Ranger", "Transit Connect", "Transit City", "Transit Courier"]) {
      expect(rangeOf({ range, model: range, segment: "van" })).toBe(range);
    }
  });

  it("keeps the two Explorers in separate slots", () => {
    const slots = buildSlots([
      row({ segment: "car", range: "Explorer", model: "Explorer Estate", derivative: "X" }),
      row({ segment: "van", range: "Explorer", model: "Explorer Electric", derivative: "X" }),
    ]);
    expect(slots.map((s) => s.range).sort()).toEqual(["Explorer", "Explorer Van"]);
  });
});

describe("headline price", () => {
  // We win 36 and 48 like-for-like, but Select's 24-month price is below our
  // cheapest at any term — the case the term-by-term view hides.
  const masked = () =>
    buildSlots([
      row({ contractLengthMonths: 24, monthlyPriceGbp: 520 }),
      row({ contractLengthMonths: 24, brokerDealerName: "Select", monthlyPriceGbp: 399, dealIdentifier: "S24" }),
      row({ contractLengthMonths: 36, monthlyPriceGbp: 450 }),
      row({ contractLengthMonths: 36, brokerDealerName: "Select", monthlyPriceGbp: 470, dealIdentifier: "S36" }),
      row({ contractLengthMonths: 48, monthlyPriceGbp: 420 }),
      row({ contractLengthMonths: 48, brokerDealerName: "Select", monthlyPriceGbp: 440, dealIdentifier: "S48" }),
    ]);

  it("compares our cheapest at any term with the cheapest rival at any term", () => {
    const [h] = buildHeadlines(masked());
    expect(h.tf).toEqual({ monthly: 420, term: "48", broker: "TrustFord Transit Centre" });
    expect(h.rival).toEqual({ monthly: 399, term: "24", broker: "Select" });
    expect(h.gap).toBeCloseTo(21);
  });

  it("flags winning like-for-like while losing the headline", () => {
    const [h] = buildHeadlines(masked());
    expect(h.termsWon).toEqual(["36", "48"]);
    expect(h.masked).toBe(true);
    // Our best (48) wins 48 like-for-like; Select's 24 still undercuts it.
    expect(h.crossTerm).toBe(true);
  });

  it("is masked but not cross-term when the headline is lost on our own best term", () => {
    // We win 24, but our cheapest is 48 and Select beats us at 48 directly —
    // the term view already shows that loss.
    const [h] = buildHeadlines(
      buildSlots([
        row({ contractLengthMonths: 24, monthlyPriceGbp: 500 }),
        row({ contractLengthMonths: 24, brokerDealerName: "Select", monthlyPriceGbp: 510, dealIdentifier: "S24" }),
        row({ contractLengthMonths: 48, monthlyPriceGbp: 430 }),
        row({ contractLengthMonths: 48, brokerDealerName: "Select", monthlyPriceGbp: 420, dealIdentifier: "S48" }),
      ])
    );
    expect(h.masked).toBe(true);
    expect(h.crossTerm).toBe(false);
  });

  it("is not masked when we hold the lowest headline", () => {
    const [h] = buildHeadlines(
      buildSlots([
        row({ contractLengthMonths: 48, monthlyPriceGbp: 390 }),
        row({ contractLengthMonths: 24, brokerDealerName: "Select", monthlyPriceGbp: 399, dealIdentifier: "S" }),
      ])
    );
    expect(h.gap).toBeCloseTo(-9);
    expect(h.masked).toBe(false);
  });

  it("is a plain loss, not masked, when we win no term", () => {
    const [h] = buildHeadlines(
      buildSlots([
        row({ contractLengthMonths: 48, monthlyPriceGbp: 450 }),
        row({ contractLengthMonths: 48, brokerDealerName: "Select", monthlyPriceGbp: 440, dealIdentifier: "S" }),
      ])
    );
    expect(h.gap).toBeCloseTo(10);
    expect(h.termsWon).toEqual([]);
    expect(h.masked).toBe(false);
  });

  it("keeps mileages apart — the customer has already chosen one", () => {
    const hs = buildHeadlines(
      buildSlots([row({ annualMileage: 5000 }), row({ annualMileage: 10000 })])
    );
    expect(hs).toHaveLength(2);
  });

  it("summarises lowest and masked over headlines both sides price", () => {
    const hs = [
      ...buildHeadlines(masked()),
      ...buildHeadlines(buildSlots([row({ annualMileage: 8000, monthlyPriceGbp: 300 })])), // TF only
    ];
    expect(summariseHeadlines(hs)).toMatchObject({ compared: 1, lowest: 0, masked: 1, crossTerm: 1 });
  });
});
