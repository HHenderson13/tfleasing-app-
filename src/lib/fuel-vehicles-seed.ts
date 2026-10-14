// Fuel Cost Calculator: the vehicles it starts with. Seeded INSERT OR IGNORE,
// so a figure changed on the admin page is never put back. More vehicles can
// be added on /fuel-calculator/admin.
//
// Petrol and diesel: the Transit Custom and Transit Courier from the earlier
// calculator (Ford's official WLTP combined MPG). One correction on the way
// in: the old calculator listed the Transit Courier 1.0 EcoBoost under
// Diesel. EcoBoost is petrol; only the 1.5 EcoBlue is diesel.
//
// Electric: every Ford electric car and van, from the dealer price lists
// (user, 2026-10-14). Each figure is what the list publishes, converted
// only for units:
//
//   Efficiency is the official WLTP energy consumption, measured at the
//   plug, so charging losses are in it. Lists give it as kWh per 100 km,
//   kWh per 100 miles, or (Transit Custom) miles per kWh.
//
//   The E-Transit Courier list also prints "4.4 miles per kWh", but that is
//   its range divided by its battery, which leaves the charging losses out.
//   Its official consumption is 17.7 kWh/100km, 3.51 miles per kWh, and that
//   is what is used: 4.4 would understate the electric cost by a fifth.
//
//   Battery is the usable capacity; range is WLTP combined, with the WLTP
//   "extra high" (motorway) range where the list gives it; rapid charging is
//   the maximum DC power and the 10 to 80% time.

import type { FuelType, Segment } from "./fuel-calc";

export interface SeedVehicle {
  powertrain: "ice" | "ev";
  segment: Segment;
  make: string;
  model: string;
  derivative: string;
  fuel: FuelType | "electric";
  /** MPG for petrol / diesel; miles per kWh for electric. */
  efficiency: number;
  source: string;
  batteryKwh?: number | null;
  rangeMiles?: number | null;
  motorwayMiles?: number | null;
  dcKw?: number | null;
  dcMinutes?: number | null;
}

// Shown beside the figure and printed on the customer's PDF.
export const SEED_SOURCE = "Ford WLTP combined";

const custom: [string, number][] = [
  ["280S Leader 2.0L EcoBlue 110PS 6MT FWD", 40.4], ["320L Leader 2.0L EcoBlue 110PS 6MT FWD", 39.2], ["320L Leader 2.0L EcoBlue 136PS 6MT FWD", 39.2],
  ["280S Trend 2.0L EcoBlue 110PS 6MT FWD", 39.8], ["280S Trend 2.0L EcoBlue 136PS 6MT FWD", 39.8], ["280S Trend 2.0L EcoBlue 136PS 8AT FWD", 37.2],
  ["320S Trend 2.0L EcoBlue 110PS 6MT FWD", 39.2], ["320S Trend 2.0L EcoBlue 136PS 6MT FWD", 39.2], ["320S Trend 2.0L EcoBlue 136PS 8AT FWD", 36.7],
  ["320S Trend 2.0L EcoBlue 136PS 8AT AWD", 33.6], ["280L Trend 2.0L EcoBlue 110PS 6MT FWD", 39.8], ["280L Trend 2.0L EcoBlue 136PS 6MT FWD", 39.8],
  ["280L Trend 2.0L EcoBlue 136PS 8AT FWD", 37.2], ["320L Trend 2.0L EcoBlue 110PS 6MT FWD", 39.2], ["320L Trend 2.0L EcoBlue 136PS 6MT FWD", 39.2],
  ["320L Trend 2.0L EcoBlue 136PS 8AT FWD", 36.7], ["320L Trend 2.0L EcoBlue 136PS 8AT AWD", 33.6], ["280S Limited 2.0L EcoBlue 136PS 6MT FWD", 39.8],
  ["280S Limited 2.0L EcoBlue 136PS 8AT FWD", 36.7], ["320S Limited 2.0L EcoBlue 136PS 6MT FWD", 38.7], ["320S Limited 2.0L EcoBlue 136PS 8AT FWD", 36.2],
  ["320S Limited 2.0L EcoBlue 150PS 6MT FWD", 38.7], ["320S Limited 2.0L EcoBlue 170PS 8AT FWD", 36.2], ["280L Limited 2.0L EcoBlue 136PS 6MT FWD", 39.2],
  ["280L Limited 2.0L EcoBlue 136PS 8AT FWD", 36.7], ["320L Limited 2.0L EcoBlue 136PS 6MT FWD", 38.7], ["320L Limited 2.0L EcoBlue 136PS 8AT FWD", 36.2],
  ["320L Limited 2.0L EcoBlue 150PS 6MT FWD", 38.7], ["320L Limited 2.0L EcoBlue 170PS 8AT FWD", 36.2], ["320S Trail 2.0L EcoBlue 136PS 6MT FWD", 38.7],
  ["320S Trail 2.0L EcoBlue 150PS 6MT FWD", 38.7], ["320S Trail 2.0L EcoBlue 170PS 8AT AWD", 33.2], ["320L Trail 2.0L EcoBlue 136PS 6MT FWD", 38.7],
  ["320L Trail 2.0L EcoBlue 150PS 6MT FWD", 38.7], ["320L Trail 2.0L EcoBlue 170PS 8AT AWD", 33.2], ["320S Sport 2.0L EcoBlue 150PS 6MT FWD", 39.2],
  ["320S Sport 2.0L EcoBlue 170PS 8AT FWD", 36.7], ["320S Sport 2.0L EcoBlue 170PS 8AT AWD", 33.6], ["320L Sport 2.0L EcoBlue 150PS 6MT FWD", 38.7],
  ["320L Sport 2.0L EcoBlue 170PS 8AT FWD", 36.2], ["320L Sport 2.0L EcoBlue 170PS 8AT AWD", 33.2], ["320S MS-RT 2.0L EcoBlue 150PS 6MT FWD", 32.8],
  ["320S MS-RT 2.0L EcoBlue 170PS 8AT FWD", 30.7], ["320S MS-RT 2.0L EcoBlue 170PS 8AT AWD", 30.1], ["320L MS-RT 2.0L EcoBlue 150PS 6MT FWD", 32.8],
  ["320L MS-RT 2.0L EcoBlue 170PS 8AT FWD", 30.4], ["320L MS-RT 2.0L EcoBlue 170PS 8AT AWD", 30.1],
];

const courier: [string, number][] = [
  ["Leader 1.0L EcoBoost 100PS 6-speed manual", 43.46], ["Leader 1.0L EcoBoost 125PS 7-speed auto", 42.8], ["Leader 1.5L EcoBlue 100PS 6-speed manual", 51.36],
  ["Trend 1.0L EcoBoost 125PS 6-speed manual", 52.8], ["Trend 1.0L EcoBoost 125PS 7-speed auto", 42.16], ["Trend 1.5L EcoBlue 100PS 6-speed manual", 50.44],
  ["Limited 1.0L EcoBoost 125PS 6-speed manual", 52.8], ["Limited 1.0L EcoBoost 125PS 7-speed auto", 42.16], ["Limited 1.5L EcoBlue 100PS 6-speed manual", 50.44],
  ["Active 1.0L EcoBoost 125PS 6-speed manual", 42.8], ["Active 1.0L EcoBoost 125PS 7-speed auto", 41.54], ["Active 1.5L EcoBlue 100PS 6-speed manual", 48.7],
];

// ─── Electric, from the price lists ────────────────────────────────────────

export type Consumption = { value: number; per: "100km" | "100mi" } | { milesPerKwh: number };

/** Official consumption as published, in miles per kWh to 2 places. */
export function milesPerKwhFrom(c: Consumption): number {
  const v = "milesPerKwh" in c ? c.milesPerKwh : c.per === "100km" ? 100 / 1.609344 / c.value : 100 / c.value;
  return Math.round(v * 100) / 100;
}

const consumptionText = (c: Consumption) =>
  "milesPerKwh" in c ? `${c.milesPerKwh.toFixed(1)} miles per kWh` : `${c.value.toFixed(1)} kWh/${c.per === "100km" ? "100km" : "100 miles"}`;

interface PriceList {
  segment: Segment;
  model: string;
  list: string;
  dcKw: number | null;
  dcMinutes: number | null;
  /** derivative, consumption, usable battery kWh, WLTP range, WLTP motorway range, then any DC figures that differ */
  rows: [string, Consumption, number, number, number | null, { dcKw: number; dcMinutes: number }?][];
}

const km = (value: number): Consumption => ({ value, per: "100km" });
const mi = (value: number): Consumption => ({ value, per: "100mi" });
const mpk = (milesPerKwh: number): Consumption => ({ milesPerKwh });

const PRICE_LISTS: PriceList[] = [
  {
    segment: "car", model: "Puma Gen-E", list: "price list effective 5 Aug 2026", dcKw: 100, dcMinutes: 26,
    rows: [
      ["Select 46.8kWh 168PS FWD", km(13.0), 46.8, 259, 192],
      ["Premium 46.8kWh 168PS FWD", km(13.7), 46.8, 251, 187],
      ["Black Edition 46.8kWh 168PS FWD", km(13.6), 46.8, 251, 187],
      ["BlueCruise Edition 46.8kWh 168PS FWD", km(13.7), 46.8, 251, 187],
    ],
  },
  {
    segment: "car", model: "Capri", list: "price list effective 11 May 2026", dcKw: 183, dcMinutes: 29,
    rows: [
      ["Style 58kWh Standard Range 190PS RWD", km(14.9), 58, 286, 218, { dcKw: 105, dcMinutes: 26 }],
      ["Select 79kWh Extended Range 286PS RWD", km(13.8), 79, 389, 299],
      ["Collection 79kWh Extended Range 286PS RWD", km(14.6), 79, 374, 289],
      ["Premium 58kWh Standard Range 190PS RWD", km(15.5), 58, 272, 209, { dcKw: 105, dcMinutes: 26 }],
      ["Premium 79kWh Extended Range 286PS RWD", km(14.7), 79, 371, 289],
      ["Premium 77kWh Extended Range 340PS AWD", km(16.4), 77, 339, 269, { dcKw: 185, dcMinutes: 27 }],
    ],
  },
  {
    segment: "car", model: "Explorer", list: "price list effective 11 May 2026", dcKw: 183, dcMinutes: 29,
    rows: [
      ["Style 58kWh Standard Range 190PS RWD", km(15.5), 58, 273, 202, { dcKw: 105, dcMinutes: 26 }],
      ["Style 79kWh Extended Range 286PS RWD", km(14.5), 79, 374, 283],
      ["Select 79kWh Extended Range 286PS RWD", km(14.5), 79, 374, 283],
      ["Collection 79kWh Extended Range 286PS RWD", km(15.1), 79, 362, 276],
      ["Premium 58kWh Standard Range 190PS RWD", km(16.2), 58, 257, 193, { dcKw: 105, dcMinutes: 26 }],
      ["Premium 79kWh Extended Range 286PS RWD", km(15.5), 79, 354, 272],
      ["Premium 77kWh Extended Range 340PS AWD", km(17.3), 77, 321, 249, { dcKw: 185, dcMinutes: 27 }],
    ],
  },
  {
    // The list heads this column kWh/100miles, but the figures are per
    // 100 km: per 100 miles, the Select would cover 394 miles on the energy
    // its 73kWh battery takes from the plug, against a 292-mile range.
    segment: "car", model: "Mustang Mach-E", list: "price list effective 7 Jan 2026", dcKw: 150, dcMinutes: 36,
    rows: [
      ["Select 73kWh Standard Range 268PS RWD", km(18.5), 73, 292, 233, { dcKw: 150, dcMinutes: 33 }],
      ["Premium 88kWh Extended Range 276PS RWD", km(17.7), 88, 382, 311],
      ["Premium 88kWh Extended Range 375PS AWD", km(19.3), 88, 344, 288],
      ["GT 91kWh Extended Range 487PS AWD", km(21.0), 91, 320, 260],
      ["GT 91kWh Extended Range 487PS AWD with Rally Pack", km(21.3), 91, 316, 254],
    ],
  },
  {
    segment: "van", model: "Explorer Van", list: "price list effective 11 May 2026", dcKw: 185, dcMinutes: 26,
    rows: [
      ["Select 79kWh Extended Range 286PS RWD", km(14.5), 79, 374, 283],
      ["Select 77kWh Extended Range 340PS AWD", km(16.2), 77, 345, 264, { dcKw: 175, dcMinutes: 28 }],
    ],
  },
  {
    // The chassis cab's range and consumption are "TBC" on the list.
    segment: "van", model: "Transit City", list: "price list effective 29 Apr 2026", dcKw: 87, dcMinutes: 33,
    rows: [
      ["Van Trend 300S SWB H1 56kWh 150PS", mi(38.3), 56, 157.8, null],
      ["Van Trend 330M LWB H2 56kWh 150PS", mi(43.45), 56, 139.2, null],
    ],
  },
  {
    // No rapid charging figures on this list.
    segment: "van", model: "E-Transit Courier", list: "price list effective 24 Aug 2026", dcKw: null, dcMinutes: null,
    rows: [
      ["Trend 46kWh 136PS", km(17.7), 46, 201, null],
      ["Limited 46kWh 136PS", km(17.7), 46, 201, null],
    ],
  },
  {
    segment: "van", model: "E-Transit Custom", list: "price list effective 11 Sep 2026", dcKw: 125, dcMinutes: 29,
    rows: [
      ["320S Trend 71kWh 136PS RWD", mpk(2.9), 71, 237, 180],
      ["320S Trend 71kWh 136PS AWD", mpk(2.8), 71, 213, 165],
      ["320S Limited 71kWh 136PS RWD", mpk(2.9), 71, 236, 180],
      ["320S Limited 71kWh 218PS RWD", mpk(2.8), 71, 226, 166],
      ["320S Limited 71kWh 136PS AWD", mpk(2.8), 71, 213, 165],
      ["320S Limited 71kWh 218PS AWD", mpk(2.6), 71, 203, 152],
      ["320S Trail 71kWh 218PS AWD", mpk(2.6), 71, 201, 150],
      ["320S Sport 71kWh 218PS RWD", mpk(2.8), 71, 225, 166],
      ["320S Sport 71kWh 218PS AWD", mpk(2.6), 71, 203, 152],
      ["320S MS-RT 71kWh 285PS RWD", mpk(2.1), 71, 189, 133],
      ["320S MS-RT 71kWh 285PS AWD", mpk(2.0), 71, 172, 123],
      ["340L Trend 71kWh 136PS RWD", mpk(2.9), 71, 234, 179],
      ["340L Trend 71kWh 136PS AWD", mpk(2.7), 71, 210, 163],
      ["340L Limited 71kWh 136PS RWD", mpk(2.9), 71, 234, 179],
      ["340L Limited 71kWh 218PS RWD", mpk(2.7), 71, 222, 164],
      ["340L Limited 71kWh 136PS AWD", mpk(2.7), 71, 210, 163],
      ["340L Limited 71kWh 218PS AWD", mpk(2.6), 71, 201, 151],
      ["340L Trail 71kWh 218PS AWD", mpk(2.6), 71, 199, 149],
      ["340L Sport 71kWh 218PS RWD", mpk(2.7), 71, 222, 164],
      ["340L Sport 71kWh 218PS AWD", mpk(2.6), 71, 200, 151],
      ["340L MS-RT 71kWh 285PS RWD", mpk(2.1), 71, 187, 132],
      ["340L MS-RT 71kWh 285PS AWD", mpk(2.0), 71, 170, 122],
    ],
  },
];

export const EV_SEED: SeedVehicle[] = PRICE_LISTS.flatMap((pl) => pl.rows.map(([derivative, c, batteryKwh, rangeMiles, motorwayMiles, dc]): SeedVehicle => ({
  powertrain: "ev", segment: pl.segment, make: "Ford", model: pl.model, derivative, fuel: "electric",
  efficiency: milesPerKwhFrom(c),
  source: `Ford WLTP ${consumptionText(c)}, ${pl.list}`,
  batteryKwh, rangeMiles, motorwayMiles,
  dcKw: dc?.dcKw ?? pl.dcKw, dcMinutes: dc?.dcMinutes ?? pl.dcMinutes,
})));

export const SEED_VEHICLES: SeedVehicle[] = [
  ...custom.map(([d, v]): SeedVehicle => ({ powertrain: "ice", segment: "van", make: "Ford", model: "Transit Custom", derivative: d, fuel: "diesel", efficiency: v, source: SEED_SOURCE })),
  ...courier.map(([d, v]): SeedVehicle => ({
    powertrain: "ice", segment: "van", make: "Ford", model: "Transit Courier", derivative: d,
    fuel: /EcoBoost/.test(d) ? "petrol" : "diesel", efficiency: v, source: SEED_SOURCE,
  })),
  ...EV_SEED,
];

/**
 * The electric vans the first version seeded from the old calculator: an
 * earlier model year (65kWh E-Transit Custom, 43kWh E-Transit Courier), and
 * the Courier figure was range over battery. Removed once, and only where
 * nobody has changed them since.
 */
export const RETIRED_EV_SEED: Omit<SeedVehicle, "source">[] = [
  ...([
    ["320S Trend 65kWh 100kW / 136PS 1AT RWD", 2.8], ["320S Limited 65kWh 100kW / 136PS 1AT RWD", 2.8], ["320S Limited 65kWh 160kW / 218PS 1AT RWD", 2.6],
    ["340L Limited 65kWh 100kW / 136PS 1AT RWD", 2.7], ["340L Limited 65kWh 160kW / 218PS 1AT RWD", 2.6], ["320S Sport 65kWh 160kW / 218PS 1AT RWD", 2.7],
    ["340L Sport 65kWh 160kW / 218PS 1AT RWD", 2.6], ["320S MS-RT 65kWh 210kW / 285PS 1AT RWD", 2.1], ["320L MS-RT 65kWh 210kW / 285PS 1AT RWD", 2.1],
  ] as const).map(([derivative, efficiency]) => ({ powertrain: "ev" as const, segment: "van" as const, make: "Ford", model: "E-Transit Custom", derivative, fuel: "electric" as const, efficiency })),
  ...([["Trend 43kWh Electric Drive 136PS 1-speed auto", 4.2], ["Limited 43kWh Electric Drive 136PS 1-speed auto", 4.2]] as const)
    .map(([derivative, efficiency]) => ({ powertrain: "ev" as const, segment: "van" as const, make: "Ford", model: "E-Transit Courier", derivative, fuel: "electric" as const, efficiency })),
];
