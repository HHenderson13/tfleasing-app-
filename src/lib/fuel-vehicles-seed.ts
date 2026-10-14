// Fuel Cost Calculator: the vehicles it starts with, from the earlier
// calculator (Ford's official WLTP combined figures). Seeded INSERT OR IGNORE,
// so a figure changed on the admin page is never put back. More vehicles can
// be added on /fuel-calculator/admin.
//
// One correction on the way in: the old calculator listed the Transit
// Courier 1.0 EcoBoost under Diesel. EcoBoost is petrol; only the 1.5
// EcoBlue is diesel.

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
}

// Shown beside the figure and printed on the customer's PDF.
const SOURCE = "Ford WLTP combined";
export const SEED_SOURCE = SOURCE;

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

const eCustom: [string, number][] = [
  ["320S Trend 65kWh 100kW / 136PS 1AT RWD", 2.8], ["320S Limited 65kWh 100kW / 136PS 1AT RWD", 2.8], ["320S Limited 65kWh 160kW / 218PS 1AT RWD", 2.6],
  ["340L Limited 65kWh 100kW / 136PS 1AT RWD", 2.7], ["340L Limited 65kWh 160kW / 218PS 1AT RWD", 2.6], ["320S Sport 65kWh 160kW / 218PS 1AT RWD", 2.7],
  ["340L Sport 65kWh 160kW / 218PS 1AT RWD", 2.6], ["320S MS-RT 65kWh 210kW / 285PS 1AT RWD", 2.1], ["320L MS-RT 65kWh 210kW / 285PS 1AT RWD", 2.1],
];

const eCourier: [string, number][] = [
  ["Trend 43kWh Electric Drive 136PS 1-speed auto", 4.2], ["Limited 43kWh Electric Drive 136PS 1-speed auto", 4.2],
];

export const SEED_VEHICLES: SeedVehicle[] = [
  ...custom.map(([d, v]): SeedVehicle => ({ powertrain: "ice", segment: "van", make: "Ford", model: "Transit Custom", derivative: d, fuel: "diesel", efficiency: v })),
  ...courier.map(([d, v]): SeedVehicle => ({
    powertrain: "ice", segment: "van", make: "Ford", model: "Transit Courier", derivative: d,
    fuel: /EcoBoost/.test(d) ? "petrol" : "diesel", efficiency: v,
  })),
  ...eCustom.map(([d, v]): SeedVehicle => ({ powertrain: "ev", segment: "van", make: "Ford", model: "E-Transit Custom", derivative: d, fuel: "electric", efficiency: v })),
  ...eCourier.map(([d, v]): SeedVehicle => ({ powertrain: "ev", segment: "van", make: "Ford", model: "E-Transit Courier", derivative: d, fuel: "electric", efficiency: v })),
];
