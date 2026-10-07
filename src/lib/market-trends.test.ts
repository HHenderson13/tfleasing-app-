import { describe, it, expect } from "vitest";
import { buildSlots, type Listing } from "./market-slots";
import { compareSlots, summariseRun } from "./market-trends";

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
};
let n = 1;
const row = (over: Partial<Listing>): Listing => ({ ...base, id: n++, dealIdentifier: `D${n}`, ...over });
const TF = (p: number, over: Partial<Listing> = {}) => row({ monthlyPriceGbp: p, ...over });
const R = (broker: string, p: number, over: Partial<Listing> = {}) => row({ brokerDealerName: broker, monthlyPriceGbp: p, ...over });

describe("compareSlots", () => {
  it("finds a lead lost to a rival's cut, and says so", () => {
    const c = compareSlots(
      buildSlots([TF(480), R("Select", 490)]),
      buildSlots([TF(480), R("Select", 470)])
    );
    expect(c.lost).toHaveLength(1);
    expect(c.lost[0].rival).toBe("Select");
    expect(c.lost[0].causes).toEqual([{ kind: "rival-cut", broker: "Select", amount: 20 }]);
    expect(c.gained).toHaveLength(0);
  });

  it("blames a new rival, and our own rise, when both happened", () => {
    const c = compareSlots(
      buildSlots([TF(480), R("Select", 490)]),
      buildSlots([TF(495), R("Select", 490), R("Leasey", 470)])
    );
    expect(c.lost[0].rival).toBe("Leasey");
    expect(c.lost[0].causes.map((x) => x.kind)).toEqual(["new-rival", "tf-rose"]);
  });

  it("finds a lead gained, by our cut or a rival leaving", () => {
    const cut = compareSlots(
      buildSlots([TF(500), R("Select", 490)]),
      buildSlots([TF(480), R("Select", 490)])
    );
    expect(cut.gained[0].causes).toEqual([{ kind: "tf-cut", broker: "TrustFord Transit Centre", amount: 20 }]);
    const left = compareSlots(
      buildSlots([TF(500), R("Select", 490), R("Leasey", 520)]),
      buildSlots([TF(500), R("Leasey", 520)])
    );
    expect(left.gained[0].causes).toEqual([{ kind: "rival-left", broker: "Select", amount: null }]);
  });

  it("only compares slots present in both runs", () => {
    const c = compareSlots(
      buildSlots([TF(480), R("Select", 490), TF(300, { annualMileage: 6000 })]),
      buildSlots([TF(480), R("Select", 470), R("Select", 200, { annualMileage: 8000 })])
    );
    expect(c.matched).toBe(1);
    expect(c.onlyBefore).toBe(1);
    expect(c.onlyAfter).toBe(1);
  });

  it("does not call a listing change a lead change", () => {
    // We stopped listing it; that is tfDropped, not a lost lead.
    const c = compareSlots(
      buildSlots([TF(480), R("Select", 490)]),
      buildSlots([R("Select", 490)])
    );
    expect(c.lost).toHaveLength(0);
    expect(c.tfDropped).toBe(1);
  });

  it("counts each broker's cuts, rises, additions and withdrawals", () => {
    const c = compareSlots(
      buildSlots([
        TF(480), R("Select", 490),
        TF(400, { annualMileage: 6000 }), R("Select", 410, { annualMileage: 6000 }), R("Leasey", 405, { annualMileage: 6000 }),
      ]),
      buildSlots([
        TF(480), R("Select", 470),
        TF(400, { annualMileage: 6000 }), R("Select", 420, { annualMileage: 6000 }),
      ])
    );
    const select = c.brokers.find((b) => b.broker === "Select")!;
    expect(select).toMatchObject({ matched: 2, cuts: 1, rises: 1, avgCut: 20, avgRise: 10 });
    expect(c.brokers.find((b) => b.broker === "Leasey")).toMatchObject({ withdrawn: 1, matched: 0 });
    // TF leads the table, unchanged.
    expect(c.brokers[0]).toMatchObject({ isTF: true, cuts: 0, rises: 0, matched: 2 });
  });

  it("ignores pennies of scrape noise", () => {
    const c = compareSlots(
      buildSlots([TF(480), R("Select", 490)]),
      buildSlots([TF(480.001), R("Select", 489.999)])
    );
    expect(c.brokers.every((b) => b.cuts === 0 && b.rises === 0)).toBe(true);
  });
});

describe("summariseRun", () => {
  it("splits by segment and range, deduping first", () => {
    const dup = { dealIdentifier: "SAME" };
    const s = summariseRun([
      TF(480), R("Select", 470, dup), R("Select", 470, dup),
      row({ segment: "car", range: "Puma", model: "Puma", brokerDealerName: "TrustFord", monthlyPriceGbp: 300 }),
    ]);
    expect(Object.keys(s).sort()).toEqual(["car", "van"]);
    expect(s.van!.overall).toMatchObject({ compared: 1, cheapest: 0, marketSlots: 1 });
    expect(Object.keys(s.van!.ranges)).toEqual(["Transit Custom"]);
    expect(s.van!.competitors[0]).toMatchObject({ broker: "Select", headToHead: 1, undercuts: 1 });
    expect(s.car!.overall.compared).toBe(0);
  });
});
