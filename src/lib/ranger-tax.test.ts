import { describe, expect, it } from "vitest";
import {
  OTR_ITEMS, RANGERS, RATES_2026_27 as R, bandText, breakdown, carPercentage, classify, compareRangers, listExVatOf, p11dOf,
  rangerById, ratesFor, rulesFor, showsVat, sourcesFor, workings, type Settings, type VehicleInput,
} from "./ranger-tax";

const get = (id: string) => rangerById(id)!;
const car = (id: string, rental: number | null = null, extra: Partial<VehicleInput> = {}): VehicleInput =>
  ({ version: get(id), seats: 5, optionsIncVat: 0, monthlyRental: rental, pricePaidExVat: null, ...extra });
const twoSeat = (id: string, rental: number | null = null): VehicleInput => ({ ...car(id, rental), seats: 2 });

const S: Settings = { incomeTaxPct: 40, fuelCard: true, privateUse: "full", funding: "hire", businessTaxPct: 25, vatRegistered: true, termMonths: 48 };

describe("the price lists, as entered", () => {
  it("adds up exactly as Ford's lists do", () => {
    for (const v of RANGERS) {
      expect(Math.round(v.basicExVat * 1.2 * 100) / 100, v.id).toBe(v.basicIncVat);
      expect(v.basicIncVat + OTR_ITEMS.deliveryIncVat + OTR_ITEMS.platesIncVat + OTR_ITEMS.vedFirstYear + OTR_ITEMS.firstRegFee, v.id).toBe(v.otrIncVat);
    }
    // 1,104 + 25 + 345 + 55 = £1,529, the "TOTAL" on both lists' OTR table.
    expect(OTR_ITEMS.deliveryIncVat + OTR_ITEMS.platesIncVat + OTR_ITEMS.vedFirstYear + OTR_ITEMS.firstRegFee).toBe(1529);
  });

  it("builds a 2-Seat only in XLT and Wildtrak, diesel and PHEV", () => {
    expect(RANGERS.filter((v) => v.twoSeat).map((v) => v.id).sort()).toEqual(["wildtrak-diesel", "wildtrak-phev", "xlt-diesel", "xlt-phev"]);
  });

  it("has every Ranger over a tonne of payload except the Raptor", () => {
    for (const v of RANGERS) {
      if (v.trim === "Raptor") { expect(v.payloadUnderTonne).toBe(true); continue; }
      expect(v.payloadUnderTonne, v.id).toBe(false);
      expect(v.payloadKg!, v.id).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("2026/27 company car percentages (HMRC EIM24705)", () => {
  it("follows HMRC's table", () => {
    const cases: [number, number | null, number][] = [
      [0, null, 4], [25, 130, 4], [25, 70, 7], [25, 69, 10], [25, 40, 10], [25, 39, 14], [25, 30, 14], [25, 29, 16], [50, 0, 16],
      [51, null, 17], [54, null, 17], [55, null, 18], [64, null, 19], [69, null, 20], [70, null, 21], [74, null, 21],
      [75, null, 21], [79, null, 21], [80, null, 22], [100, null, 26], [154, null, 36], [155, null, 37], [315, null, 37],
    ];
    for (const [co2, range, pct] of cases) expect(carPercentage(co2, range, R), `${co2} g/km`).toBe(pct);
  });

  it("adds the diesel supplement, never past 37%", () => {
    expect(carPercentage(100, null, R, true)).toBe(30);
    expect(carPercentage(152, null, R, true)).toBe(37);
    expect(carPercentage(269, null, R, true)).toBe(37);
  });

  it("puts every diesel and the Raptor at 37%, every PHEV at 21%", () => {
    for (const v of RANGERS) {
      const want = v.fuel === "phev" ? 21 : 37;
      expect(carPercentage(v.co2, v.electricRangeMiles, R, v.fuel === "diesel"), v.id).toBe(want);
      expect(carPercentage(v.co2, v.electricRangeMiles, R, false), v.id).toBe(want);
    }
  });

  it("names the band", () => {
    expect(bandText(70, R)).toBe("70 to 74 g/km");
    expect(bandText(71, R)).toBe("70 to 74 g/km");
    expect(bandText(269, R)).toBe("155 g/km and over");
    expect(bandText(51, R)).toBe("51 to 54 g/km");
  });

  it("holds the 2026/27 flat charges", () => {
    expect([R.vanBenefit, R.vanFuelBenefit, R.carFuelMultiplier, R.class1APct]).toEqual([4170, 798, 29200, 15]);
  });

  it("knows which tax year a date is in", () => {
    expect(ratesFor("2026-11-04")).toEqual({ rates: R, current: true });
    expect(ratesFor("2026-04-06").current).toBe(true);
    expect(ratesFor("2027-04-05").current).toBe(true);
    expect(ratesFor("2027-04-06")).toEqual({ rates: R, current: false });
  });
});

describe("car or van", () => {
  it("makes a 5-seat a car, a 2-Seat a van, and the Raptor a car for VAT too", () => {
    expect(classify(get("wildtrak-diesel"), 5)).toEqual({ taxClass: "car", vatClass: "commercial" });
    expect(classify(get("wildtrak-diesel"), 2)).toEqual({ taxClass: "van", vatClass: "commercial" });
    expect(classify(get("raptor-petrol"), 5)).toEqual({ taxClass: "car", vatClass: "car" });
    // No 2-Seat Platinum is built, so asking for one is a 5-seat car.
    expect(classify(get("platinum-diesel"), 2).taxClass).toBe("car");
  });

  it("takes P11D as list + delivery + plates, incl. VAT, plus options", () => {
    expect(p11dOf(get("wildtrak-diesel"))).toBe(57229);
    expect(p11dOf(get("wildtrak-diesel"), 2700)).toBe(59929);
    // OTR less road tax and the registration fee, for every Ranger.
    for (const v of RANGERS) expect(p11dOf(v), v.id).toBe(v.otrIncVat - 345 - 55);
    // Ex VAT matches the list's OTR ex VAT less the same two: 48,090.83 − 400 = 47,690.83.
    expect(listExVatOf(get("wildtrak-diesel"))).toBe(47690.83);
  });
});

describe("the figures, worked by hand", () => {
  const c = compareRangers([car("wildtrak-diesel", 650), twoSeat("wildtrak-diesel", 650), car("wildtrak-phev", 600)], S, R);
  const [diesel, van, phev] = c.vehicles;

  it("taxes the Wildtrak 3.0 diesel 5-seat as a car", () => {
    // 57,229 × 37% = 21,174.73; fuel 29,200 × 37% = 10,804
    expect(diesel.benefit).toBe(21174.73);
    expect(diesel.fuelBenefit).toBe(10804);
    // × 40%: 8,469.89 + 4,321.60 = 12,791.49 a year, ÷ 12 = 1,065.96
    expect(diesel.driver).toEqual({ benefitTax: 8469.89, fuelTax: 4321.6, annual: 12791.49, monthly: 1065.96 });
    // NI: 31,978.73 × 15% = 4,796.81. Rentals 7,800, VAT reclaimed, 15% = 1,170 disallowed, × 25% = 292.50
    expect(diesel.business.nic).toBe(4796.81);
    expect(diesel.business.lease).toEqual({ rentals: 7800, vat: 1560, vatBlocked: 0, disallowed: 1170, restrictionTax: 292.5 });
    // Relief 4,796.81 × 25% = 1,199.20; business 4,796.81 + 0 + 292.50 − 1,199.20 = 3,890.11
    expect(diesel.business.relief).toBe(1199.2);
    expect(diesel.business.annual).toBe(3890.11);
    // 16,681.60 ÷ 12 = 1,390.13 a month
    expect(diesel.together).toEqual({ annual: 16681.6, monthly: 1390.13, overTerm: 66726.4 });
  });

  it("taxes the 2-Seat as a van", () => {
    // 4,170 + 798 at 40% = 1,668 + 319.20; NI 4,968 × 15% = 745.20; relief 186.30
    expect(van.taxClass).toBe("van");
    expect(van.driver).toEqual({ benefitTax: 1668, fuelTax: 319.2, annual: 1987.2, monthly: 165.6 });
    expect(van.business.nic).toBe(745.2);
    expect(van.business.lease!.restrictionTax).toBe(0);
    expect(van.business.annual).toBe(558.9);
    expect(van.together.annual).toBe(2546.1);
    // 2,546.10 ÷ 12 = 212.175, to the penny 212.18
    expect(van.together.monthly).toBe(212.18);
  });

  it("taxes the Wildtrak PHEV at 21%", () => {
    // 55,009 × 21% = 11,551.89; fuel 6,132; at 40%: 4,620.76 + 2,452.80 = 7,073.56
    expect(phev.pct).toBe(21);
    expect(phev.benefit).toBe(11551.89);
    expect(phev.driver.annual).toBe(7073.56);
    // NI 17,683.89 × 15% = 2,652.58; restriction 7,200 × 15% × 25% = 270; relief 663.15
    expect(phev.business.nic).toBe(2652.58);
    expect(phev.business.relief).toBe(663.15);
    expect(phev.business.annual).toBe(2259.43);
    expect(phev.together.annual).toBe(9332.99);
  });

  it("finds the biggest saving against the first", () => {
    expect(c.savings).toEqual([0, 14135.5, 7348.61]);
    // A month: 1,390.13 − 212.18 = 1,177.95; PHEV 9,332.99 ÷ 12 = 777.75, so 1,390.13 − 777.75 = 612.38
    expect(c.savingsMonthly).toEqual([0, 1177.95, 612.38]);
    expect(c.best).toBe(1);
    expect(c.headline).toBe("The Wildtrak 2-Seat 3.0 V6 diesel saves £14,136 a year in tax, £1,178 a month");
  });

  it("blocks half the Raptor's lease VAT, and restricts it with the VAT", () => {
    const r = compareRangers([car("raptor-petrol", 800)], { ...S, fuelCard: false }, R).vehicles[0];
    // 63,109 × 37% = 23,350.33; × 40% = 9,340.13
    expect(r.benefit).toBe(23350.33);
    expect(r.driver.annual).toBe(9340.13);
    // VAT 1,920, half kept 960; disallowed (9,600 + 960) × 15% = 1,584, × 25% = 396
    expect(r.business.lease).toEqual({ rentals: 9600, vat: 1920, vatBlocked: 960, disallowed: 1584, restrictionTax: 396 });
    // Relief (3,502.55 + 960) × 25% = 1,115.64; 3,502.55 + 960 + 396 − 1,115.64 = 3,742.91
    expect(r.business.nic).toBe(3502.55);
    expect(r.business.relief).toBe(1115.64);
    expect(r.business.annual).toBe(3742.91);
    expect(r.together.annual).toBe(13083.04);
  });

  it("keeps all the VAT when the business isn't registered", () => {
    const [c5, c2] = compareRangers([car("wildtrak-diesel", 650), twoSeat("wildtrak-diesel", 650)], { ...S, vatRegistered: false }, R).vehicles;
    expect(c5.business.lease).toEqual({ rentals: 7800, vat: 1560, vatBlocked: 1560, disallowed: 1404, restrictionTax: 351 });
    expect(c2.business.lease).toEqual({ rentals: 7800, vat: 1560, vatBlocked: 1560, disallowed: 0, restrictionTax: 0 });
  });

  it("leaves the lease out until every rental is in", () => {
    const part = compareRangers([car("wildtrak-diesel", 650), twoSeat("wildtrak-diesel")], S, R);
    expect(part.leaseComplete).toBe(false);
    expect(part.vehicles.every((v) => v.business.lease == null)).toBe(true);
    // Business is then NI less its relief: 4,796.81 − 1,199.20
    expect(part.vehicles[0].business.annual).toBe(3597.61);
  });

  it("charges nothing on a van used only for commuting, and a car in full", () => {
    const [c5, c2] = compareRangers([car("wildtrak-diesel"), twoSeat("wildtrak-diesel")], { ...S, privateUse: "commuting" }, R).vehicles;
    expect([c2.benefit, c2.fuelBenefit, c2.driver.annual, c2.business.nic]).toEqual([0, 0, 0, 0]);
    expect(c5.benefit).toBe(21174.73);
  });

  it("ignores options on a van and adds them to a car", () => {
    const [c5, c2] = compareRangers([car("wildtrak-diesel", null, { optionsIncVat: 2700 }), { ...twoSeat("wildtrak-diesel"), optionsIncVat: 2700 }], S, R).vehicles;
    expect(c5.benefit).toBe(22173.73); // 59,929 × 37%
    expect(c2.benefit).toBe(4170);
  });
});

describe("every tax bracket", () => {
  const trio = [car("wildtrak-diesel"), twoSeat("wildtrak-diesel"), car("wildtrak-phev")];

  it("works for a basic rate (20%) driver", () => {
    const [d, v, p] = compareRangers(trio, { ...S, incomeTaxPct: 20 }, R).vehicles;
    // Diesel: 21,174.73 × 20% = 4,234.95; fuel 10,804 × 20% = 2,160.80; 6,395.75 a year, 532.98 a month
    expect(d.driver).toEqual({ benefitTax: 4234.95, fuelTax: 2160.8, annual: 6395.75, monthly: 532.98 });
    // 2-Seat: 4,170 × 20% = 834; 798 × 20% = 159.60; 993.60 a year, 82.80 a month
    expect(v.driver).toEqual({ benefitTax: 834, fuelTax: 159.6, annual: 993.6, monthly: 82.8 });
    // PHEV: 11,551.89 × 20% = 2,310.38; 6,132 × 20% = 1,226.40; 3,536.78 a year, 294.73 a month
    expect(p.driver).toEqual({ benefitTax: 2310.38, fuelTax: 1226.4, annual: 3536.78, monthly: 294.73 });
  });

  it("works for a higher rate (40%) driver", () => {
    const [d, v, p] = compareRangers(trio, S, R).vehicles;
    expect(d.driver.monthly).toBe(1065.96);
    expect(v.driver.monthly).toBe(165.6);
    expect(p.driver.monthly).toBe(589.46);
  });

  it("works for an additional rate (45%) driver", () => {
    const [d, v] = compareRangers(trio, { ...S, incomeTaxPct: 45 }, R).vehicles;
    // 21,174.73 × 45% = 9,528.63; 10,804 × 45% = 4,861.80
    expect(d.driver.annual).toBe(14390.43);
    // 4,968 × 45% = 2,235.60
    expect(v.driver.annual).toBe(2235.6);
  });

  it("leaves the employer's NI the same whatever the driver's bracket", () => {
    for (const pct of [20, 40, 45]) {
      const [d, v] = compareRangers(trio, { ...S, incomeTaxPct: pct }, R).vehicles;
      expect(d.business.nic).toBe(4796.81);
      expect(v.business.nic).toBe(745.2);
    }
  });

  it("matches Ford's own printed BIK for the Raptor at 20% and 40%", () => {
    // Ford's Raptor list prints £382.36 and £764.73 a month (37%, 2025/26). Those are on £62,005:
    // the list price plus plates, without the delivery charge. On that same figure the maths agrees
    // to the penny. Our P11D adds the £1,104 delivery, which ITEPA s123 says the list price includes.
    const fordBase = { ...get("raptor-petrol"), basicIncVat: 62005 - OTR_ITEMS.deliveryIncVat - OTR_ITEMS.platesIncVat };
    const one = (pct: number) => compareRangers([{ ...car("raptor-petrol"), version: fordBase }], { ...S, fuelCard: false, incomeTaxPct: pct }, R).vehicles[0];
    expect(one(20).p11d).toBe(62005);
    expect(one(20).driver.monthly).toBe(382.36);
    expect(one(40).driver.monthly).toBe(764.73);
  });
});

describe("buying it", () => {
  const buy: Settings = { ...S, funding: "buy" };

  it("gives a van 100% in year one and a car 6%", () => {
    const [c5, c2] = compareRangers([car("wildtrak-diesel"), twoSeat("wildtrak-diesel")], buy, R).vehicles;
    // 47,690.83 × 6% = 2,861.45, × 25% = 715.36
    expect(c5.purchase).toEqual({ price: 47690.83, vat: 9538.17, vatReclaimed: true, base: 47690.83, allowancePct: 6, yearOneAllowance: 2861.45, yearOneRelief: 715.36 });
    // 47,690.83 × 100% × 25% = 11,922.71
    expect(c2.purchase!.yearOneRelief).toBe(11922.71);
    expect(c5.business.lease).toBeNull();
  });

  it("keeps the VAT on a Raptor and claims allowances on it", () => {
    const r = compareRangers([car("raptor-petrol")], buy, R).vehicles[0];
    // 52,590.83 + 10,518.17 = 63,109; × 6% = 3,786.54, × 25% = 946.64
    expect(r.purchase).toEqual({ price: 52590.83, vat: 10518.17, vatReclaimed: false, base: 63109, allowancePct: 6, yearOneAllowance: 3786.54, yearOneRelief: 946.64 });
  });

  it("uses the price paid when it's given", () => {
    const r = compareRangers([car("wildtrak-diesel", null, { pricePaidExVat: 44000 })], buy, R).vehicles[0];
    expect(r.purchase!.yearOneAllowance).toBe(2640);
  });
});

describe("VAT only where it matters", () => {
  const rows = (c: ReturnType<typeof compareRangers>, s: Settings) => breakdown(c, s, R).flatMap((x) => x.rows.map((r) => r.label));
  const lines = (c: ReturnType<typeof compareRangers>, s: Settings) => workings(c, s, R).flatMap((w) => w.lines).join("\n");

  it("leaves VAT out when there's no Raptor", () => {
    for (const s of [S, { ...S, funding: "buy" as const }]) {
      const c = compareRangers([car("wildtrak-diesel", 650), twoSeat("wildtrak-diesel", 650)], s, R);
      expect(showsVat(c, s)).toBe(false);
      expect(rows(c, s).join(" ").replace(/ex VAT/g, "")).not.toMatch(/VAT|reclaim/);
      // "ex VAT" stays: it's the basis the rental and price are given on, not talk about VAT.
      expect(lines(c, s).replace(/ex VAT/g, "")).not.toMatch(/VAT|reclaim/);
      expect(sourcesFor(c, s, R).map((x) => x.label)).not.toContain("VAT");
    }
  });

  it("shows it once a Raptor is in", () => {
    const c = compareRangers([car("wildtrak-diesel", 650), car("raptor-petrol", 800)], S, R);
    expect(showsVat(c, S)).toBe(true);
    expect(rows(c, S)).toContain("VAT it can't reclaim");
    expect(lines(c, S)).toContain("Lease restriction: (£9,600.00 + £960.00) × 15% = £1,584.00, × 25% = £396.00");
    expect(sourcesFor(c, S, R).map((x) => x.label)).toContain("VAT");
  });
});

describe("what the customer reads", () => {
  const all = [car("wildtrak-diesel", 650), twoSeat("xlt-phev", 500), car("raptor-petrol", 800), car("limited-phev", 600)];
  const texts = (s: Settings) => {
    const c = compareRangers(all, s, R);
    return [c.headline, ...breakdown(c, s, R).flatMap((x) => [x.title, ...x.rows.flatMap((r) => [r.label, r.hint ?? "", ...r.values])]),
      ...rulesFor(c, R).flatMap((x) => [x.title, x.text]), ...workings(c, s, R).flatMap((w) => [w.title, ...w.lines])].join("\n");
  };

  it("never prints a dash the customer would read as a pause", () => {
    for (const s of [S, { ...S, funding: "buy" as const }, { ...S, vatRegistered: false, fuelCard: false, privateUse: "commuting" as const }]) {
      expect(texts(s)).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("prints workings whose lines add up as shown", () => {
    const c = compareRangers([car("wildtrak-diesel", 650), twoSeat("wildtrak-diesel", 650)], S, R);
    const w = workings(c, S, R);
    expect(w[0].lines).toContain("P11D: £56,100.00 list + £1,104.00 delivery + £25.00 plates = £57,229.00");
    expect(w[0].lines).toContain("269 g/km, 155 g/km and over: 37%, the maximum");
    expect(w[0].lines).toContain("Driver: (£21,174.73 + £10,804.00) × 40% = £12,791.49, £1,065.96 a month");
    expect(w[0].lines).toContain("Lease restriction: £7,800.00 × 15% = £1,170.00, × 25% = £292.50");
    expect(w[0].lines).toContain("Business: £4,796.81 + £292.50 − £1,199.20 = £3,890.11");
    expect(w[0].lines).toContain("Together: £12,791.49 + £3,890.11 = £16,681.60 a year, ÷ 12 = £1,390.13 a month");
    expect(w[2].lines).toEqual([
      "Wildtrak 2-Seat 3.0 V6 diesel: £16,681.60 − £2,546.10 = £14,135.50 a year less, £56,542.00 over 48 months",
      "  a month: £1,390.13 − £212.18 = £1,177.95 less",
    ]);
  });

  it("explains only the cases on the page", () => {
    const only5 = compareRangers([car("wildtrak-diesel"), car("wildtrak-phev")], S, R);
    expect(rulesFor(only5, R).map((r) => r.title)).toEqual(["A 5-seat Ranger is a car", "Rangers already on the fleet"]);
    const withRaptor = compareRangers([car("raptor-petrol"), twoSeat("xlt-diesel")], S, R);
    expect(rulesFor(withRaptor, R).map((r) => r.title)).toEqual(["The 2-Seat is a van", "The Raptor is a car for VAT too", "Rangers already on the fleet"]);
  });
});
