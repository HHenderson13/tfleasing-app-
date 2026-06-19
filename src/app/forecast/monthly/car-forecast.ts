// Lease New Cars — per-line forecast computation.
//
// Replaces the generic sum-by-column rollup with a per-vehicle-aware
// computation. For each dealbook line we:
//   - Look up the vehicle (by vehicle_id) → fuel type + per-vehicle
//     bonus rates (Guarantee B %, Guarantee Margin %, Stocking %).
//   - Apply the right Chassis GP formula (ICE vs BEV).
//   - Sum into the right monthly line keys.
//
// Unit-driven costs (PDI, Cleaning, Sales Commission, etc.) use config
// values × total units. Constants live in forecast_config so the user
// can change them from Admin → Math without redeploy.

import type { ForecastLine } from "../line-definitions";

export interface DealbookCarLine {
  vehicleId: string | null;
  kind: string;              // expect "car"
  source: string;            // "lease" | "salary_sacrifice"
  basic: number;             // column BQ
  reconCost: number;         // column Q (typically negative)
  totalVehicleProfit: number;// column U
  financeIncome: number;     // V
  financeMb: number;         // W
  tyreInsIncome: number;     // X
  financeSubsidy: number;    // Y
  cpiIncome: number;         // Z
  smartRepair: number;       // AA
  gapRtiIncome: number;      // AB
  paintProtection: number;   // AC
  warranty: number;          // AD
}

export interface VehicleInfo {
  id: string;
  fuelType: "ice" | "bev";
}

export type BonusLookup = Map<string, Map<string, number>>;
//  vehicleId → bonusKey → value

export interface CarMonthInputs {
  lines: DealbookCarLine[];
  vehicles: Map<string, VehicleInfo>;
  bonuses: BonusLookup;
  config: Map<string, number>;
  // Forecast scenario (extra units the user expects on top of dealbook)
  scenarioExtraUnits: number;
  scenarioMarginPerUnit: number;
}

export interface CarMonthForecast {
  values: Map<string, number>;        // per line key
  // Diagnostics — surface in the UI when something's odd.
  unmatchedCount: number;             // lines where kind === "car" but no vehicleId
  iceUnits: number;
  bevUnits: number;
}

const C = {
  HOUSE_CHARGE: "car_house_charge_per_unit",
  PDI_PREP:     "car_pdi_prep_per_unit",
  CLEANING:     "car_cleaning_per_unit",
  SALES_COMM:   "car_sales_commission_per_unit",
  COLL_DEL:     "car_collection_delivery_per_unit",
};

const B = {
  GUARANTEE_B:        "guarantee_b_pct",
  GUARANTEE_MARGIN:   "guarantee_margin_pct",
  STOCKING_CREDITS:   "stocking_credits_pct",
};

function bonusPct(bonuses: BonusLookup, vehicleId: string | null, key: string): number {
  if (!vehicleId) return 0;
  return bonuses.get(vehicleId)?.get(key) ?? 0;
}

export function computeCarMonthForecast(input: CarMonthInputs): CarMonthForecast {
  const v = new Map<string, number>();
  const cfg = (key: string, fallback = 0) => input.config.get(key) ?? fallback;
  const houseCharge = cfg(C.HOUSE_CHARGE, 175);

  // Filter to actual car lines (kind === "car"). Unmatched lines stay
  // out of the rollup until the admin adds the vehicle to the catalogue.
  const carLines = input.lines.filter((l) => l.kind === "car");

  let chassisGp = 0;
  let standardsMargin = 0;
  let stockingCredits = 0;
  let commissionVb = 0;
  let alloyTyre = 0;
  let gap = 0;
  let paintFabric = 0;
  let warranty = 0;
  let unmatchedCount = 0;
  let iceUnits = 0;
  let bevUnits = 0;
  let unitsExSalSac = 0;

  for (const l of carLines) {
    const veh = l.vehicleId ? input.vehicles.get(l.vehicleId) : null;
    if (!veh) {
      unmatchedCount++;
      // Even unmatched cars contribute units + finance income so the
      // exec sees them — they just won't pick up ICE-specific bonuses.
    }
    const isIce = veh ? veh.fuelType === "ice" : true; // unknown defaults to ICE
    if (isIce) iceUnits++; else bevUnits++;
    if (l.source !== "salary_sacrifice") unitsExSalSac++;

    // Chassis GP per the user's spec:
    //   BEV: U + Q - house_charge
    //   ICE: U + Q - house_charge - (Basic × Guarantee B %)
    // Q is a negative cost, so "U + Q" already subtracts recon.
    const baseChassis = l.totalVehicleProfit + l.reconCost - houseCharge;
    if (isIce) {
      const gbPct = bonusPct(input.bonuses, l.vehicleId, B.GUARANTEE_B);
      chassisGp += baseChassis - (l.basic * gbPct / 100);

      // Standards margin: Basic × per-vehicle Guarantee Margin %.
      const gmPct = bonusPct(input.bonuses, l.vehicleId, B.GUARANTEE_MARGIN);
      standardsMargin += l.basic * gmPct / 100;

      // Stocking credits: Basic × per-vehicle Stocking Credits %.
      const scPct = bonusPct(input.bonuses, l.vehicleId, B.STOCKING_CREDITS);
      stockingCredits += l.basic * scPct / 100;
    } else {
      chassisGp += baseChassis;
    }

    // F&I rows: simple sums per the spec.
    commissionVb += l.financeIncome;                                                  // V
    alloyTyre    += l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair; // W:AA
    gap          += l.gapRtiIncome;                                                   // AB
    paintFabric  += l.paintProtection;                                                // AC
    warranty     += l.warranty;                                                       // AD
  }

  // Scenario uplift — extra units at £X margin land on Chassis GP.
  // Treat scenario units as ICE-equivalent (no Standards/Stocking uplift
  // for now). They count toward all unit-driven costs and unitsExSalSac
  // (assumption: scenario units are Lease, not SalSac).
  const dealbookUnits = carLines.length;
  const totalUnits = dealbookUnits + input.scenarioExtraUnits;
  const scenarioChassis = input.scenarioExtraUnits * input.scenarioMarginPerUnit;
  chassisGp += scenarioChassis;
  unitsExSalSac += input.scenarioExtraUnits;

  // Leaf money values per the user's spec.
  v.set("car_units", totalUnits);
  v.set("car_chassis_gp", chassisGp);
  v.set("commission_vb", commissionVb);
  v.set("alloy_tyre", alloyTyre);
  v.set("gap", gap);
  v.set("paint_fabric", paintFabric);
  v.set("warranty", warranty);
  v.set("standards_margin", standardsMargin);
  v.set("stocking_credits", stockingCredits);

  // Unit-driven costs.
  v.set("other_income",        houseCharge * totalUnits);
  v.set("pdi_prep",            cfg(C.PDI_PREP, 135) * totalUnits);
  v.set("cleaning",            cfg(C.CLEANING, 35) * totalUnits);
  v.set("sales_commissions",   cfg(C.SALES_COMM, 80) * totalUnits);
  v.set("collection_delivery", cfg(C.COLL_DEL, 200) * unitsExSalSac);

  return {
    values: v,
    unmatchedCount,
    iceUnits,
    bevUnits,
  };
}

// Reusable totals + per-unit settler. The user-facing sheet definition
// describes derived rows via `kind: "total"` (totalOf + optional
// subtractOf) and `kind: "perUnit"` (perUnitOf). This walks the lines a
// few passes so nested derivations settle.
export function settleDerivedLines(lines: ForecastLine[], values: Map<string, number>) {
  for (let pass = 0; pass < 4; pass++) {
    for (const l of lines) {
      if (l.kind === "total") {
        const add = (l.totalOf ?? []).reduce((acc: number, k: string) => acc + (values.get(k) ?? 0), 0);
        const sub = (l.subtractOf ?? []).reduce((acc: number, k: string) => acc + (values.get(k) ?? 0), 0);
        values.set(l.key, add - sub);
      } else if (l.kind === "perUnit" && l.perUnitOf) {
        const money = values.get(l.perUnitOf.money);
        const units = values.get(l.perUnitOf.units);
        values.set(l.key, money !== undefined && units && units !== 0 ? money / units : 0);
      }
    }
  }
}
