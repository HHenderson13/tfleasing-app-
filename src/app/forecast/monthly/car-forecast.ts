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
  regDate: string | null;    // YYYY-MM-DD — natural registered date from dealbook
  overrideMonth: string | null; // YYYY-MM — admin override for DPA bucket only
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

export interface CostConfig {
  key: string;
  value: number;
  applies: "per_unit" | "per_month" | "special";
  appliesToLineKey: string | null;
}

export interface CarMonthInputs {
  // Active month's lines — drive Chassis GP, F&I, Standards/Stocking,
  // unit-driven costs.
  lines: DealbookCarLine[];
  // Lines registered in the active half-year (Jan–Jun or Jul–Dec).
  // Used only for DPA + Pot of Gold, which are based on reg-date.
  regHalfLines: DealbookCarLine[];
  // Active month, 1-12. Quarter/Half-year DPA only render in
  // quarter-end (3/6/9/12) and half-year-end (6/12) months respectively.
  monthNumber: number;
  vehicles: Map<string, VehicleInfo>;
  bonuses: BonusLookup;
  config: Map<string, number>;            // for "special" formula lookups (house charge etc.)
  costs: CostConfig[];                    // per_unit + per_month cost rows wired to line keys
  // Forecast scenario (extra units the user expects on top of dealbook)
  scenarioExtraUnits: number;
  scenarioMarginPerUnit: number;
}

export interface NoteEntry {
  lineKey: string;
  text: string;
}

export interface CarMonthForecast {
  values: Map<string, number>;        // per line key
  notes: Map<string, string[]>;       // per line key — one or more note strings
  // Diagnostics — surface in the UI when something's odd.
  unmatchedCount: number;             // lines where kind === "car" but no vehicleId
  iceUnits: number;
  bevUnits: number;
  salSacUnits: number;
}

const C = {
  HOUSE_CHARGE: "car_house_charge_per_unit",
};

const B = {
  // Same key drives both the Chassis GP deduction and Standards margin
  // (the £ value subtracted from chassis is the same £ added to
  // Standards margin — different sides of the same accounting move).
  GUARANTEE_B:        "guarantee_b_pct",
  STOCKING_CREDITS:   "stocking_credits_pct",
  QUARTER_DPA:        "quarter_dpa_pct",
  HALF_YEAR_DPA:      "half_year_dpa_pct",
  POT_OF_GOLD:        "pot_of_gold_gbp",
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
  let salSacUnits = 0;
  let unitsExSalSac = 0;

  // F&I policy counts — for the Notes column.
  let alloyPolicies = 0;
  let gapPolicies = 0;
  let paintPolicies = 0;
  let warrantyPolicies = 0;
  // Per-vehicle Standards / Stocking roll-ups so notes can show the
  // % each vehicle was charged at.
  const standardsByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const stockingByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();

  for (const l of carLines) {
    const veh = l.vehicleId ? input.vehicles.get(l.vehicleId) : null;
    if (!veh) {
      unmatchedCount++;
      // Even unmatched cars contribute units + finance income so the
      // exec sees them — they just won't pick up ICE-specific bonuses.
    }
    const isIce = veh ? veh.fuelType === "ice" : true; // unknown defaults to ICE
    if (isIce) iceUnits++; else bevUnits++;
    if (l.source === "salary_sacrifice") salSacUnits++;
    if (l.source !== "salary_sacrifice") unitsExSalSac++;

    // F&I policy counters (any non-zero income on a line = one policy).
    const alloyIncome = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
    if (alloyIncome > 0) alloyPolicies++;
    if (l.gapRtiIncome > 0) gapPolicies++;
    if (l.paintProtection > 0) paintPolicies++;
    if (l.warranty > 0) warrantyPolicies++;

    // Chassis GP per the user's spec:
    //   BEV: U + Q + house_charge
    //   ICE: U + Q + house_charge - (Basic × Guarantee B %)
    // Q is a negative cost so "U + Q" already subtracts recon. The
    // £175 house charge is added here too (separately from the Other
    // income row, which also picks it up).
    const baseChassis = l.totalVehicleProfit + l.reconCost + houseCharge;
    if (isIce) {
      const vehicleName = veh?.id ?? l.vehicleId ?? "(no vehicle)";
      const gbPct = bonusPct(input.bonuses, l.vehicleId, B.GUARANTEE_B);
      // Chassis GP gets the deduction; Standards margin gets the same
      // value back. Net effect: moves the £ from one row to another so
      // the user can see Standards margin separately on the sheet.
      const guaranteeAmount = l.basic * gbPct / 100;
      chassisGp += baseChassis - guaranteeAmount;
      standardsMargin += guaranteeAmount;
      const sBucket = standardsByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: gbPct };
      sBucket.units++; sBucket.basicSum += l.basic; sBucket.total += guaranteeAmount; sBucket.pct = gbPct;
      standardsByVehicle.set(vehicleName, sBucket);

      // Stocking credits: Basic × per-vehicle Stocking Credits %.
      const scPct = bonusPct(input.bonuses, l.vehicleId, B.STOCKING_CREDITS);
      const stockingAmount = l.basic * scPct / 100;
      stockingCredits += stockingAmount;
      const sCBucket = stockingByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: scPct };
      sCBucket.units++; sCBucket.basicSum += l.basic; sCBucket.total += stockingAmount; sCBucket.pct = scPct;
      stockingByVehicle.set(vehicleName, sCBucket);
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

  // Other income (House charge) is hardcoded — £175 per unit.
  v.set("other_income", houseCharge * totalUnits);

  // ── DPA + Pot of Gold ─────────────────────────────────────────────
  // Based on REGISTERED date, not the upload's effective month — a
  // unit registered in April is a Q2 unit even if the admin moved it
  // into a different forecast bucket. They only land in the right
  // trigger month (quarter-end for DPA Quarter + Pot of Gold,
  // half-year-end for DPA Half Year).
  const m = input.monthNumber;
  const isQuarterEnd = m === 3 || m === 6 || m === 9 || m === 12;
  const isHalfYearEnd = m === 6 || m === 12;

  let dpaQuarterTotal = 0;
  let dpaHalfYearTotal = 0;
  let potOfGoldTotal = 0;

  // Per-vehicle breakdown so the Notes column can show
  // "Capri: 25 × £40,000 × 2.5% = £25,000" etc.
  const quarterByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const halfYearByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const potByVehicle = new Map<string, { units: number; perUnit: number; total: number }>();

  for (const l of input.regHalfLines) {
    if (l.kind !== "car") continue;
    if (!l.vehicleId) continue;
    // DPA bucket follows override_month if set, else the natural reg
    // date. So a unit reg'd in March but moved to April by the admin
    // counts toward Q2 / H1 instead of Q1.
    const bucketYyyymm = l.overrideMonth ?? (l.regDate ? l.regDate.slice(0, 7) : null);
    if (!bucketYyyymm) continue;
    const regMonth = parseInt(bucketYyyymm.slice(5, 7), 10);
    if (!regMonth) continue;
    const inActiveQuarter = quartersMatch(m, regMonth);
    const halfStart = m <= 6 ? 1 : 7;
    const halfEnd = m <= 6 ? 6 : 12;
    const inActiveHalf = regMonth >= halfStart && regMonth <= halfEnd;

    const vehicleName = input.vehicles.get(l.vehicleId)?.id ?? l.vehicleId;

    if (isQuarterEnd && inActiveQuarter) {
      const pct = bonusPct(input.bonuses, l.vehicleId, B.QUARTER_DPA);
      const contribution = l.basic * pct / 100;
      dpaQuarterTotal += contribution;
      const bucket = quarterByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct };
      bucket.units++;
      bucket.basicSum += l.basic;
      bucket.total += contribution;
      bucket.pct = pct;
      quarterByVehicle.set(vehicleName, bucket);

      const potPerUnit = bonusPct(input.bonuses, l.vehicleId, B.POT_OF_GOLD);
      potOfGoldTotal += potPerUnit;
      const pot = potByVehicle.get(vehicleName) ?? { units: 0, perUnit: potPerUnit, total: 0 };
      pot.units++;
      pot.perUnit = potPerUnit;
      pot.total += potPerUnit;
      potByVehicle.set(vehicleName, pot);
    }

    if (isHalfYearEnd && inActiveHalf) {
      const pct = bonusPct(input.bonuses, l.vehicleId, B.HALF_YEAR_DPA);
      const contribution = l.basic * pct / 100;
      dpaHalfYearTotal += contribution;
      const bucket = halfYearByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct };
      bucket.units++;
      bucket.basicSum += l.basic;
      bucket.total += contribution;
      bucket.pct = pct;
      halfYearByVehicle.set(vehicleName, bucket);
    }
  }

  v.set("dpa_quarter", dpaQuarterTotal);
  v.set("dpa_half_year", dpaHalfYearTotal);
  v.set("pot_of_gold", potOfGoldTotal);

  // Apply admin-keyed cost rows. Each config row has an `applies` flag
  // (per_unit / per_month) and `applies_to_line_key` naming the line to
  // populate. per_unit multiplies by total units; per_month uses the
  // value as-is. Collection & Delivery is special-cased to use the
  // SalSac-excluded unit count.
  for (const c of input.costs) {
    if (!c.appliesToLineKey) continue;
    if (c.applies === "per_unit") {
      const multiplier = c.appliesToLineKey === "collection_delivery" ? unitsExSalSac : totalUnits;
      v.set(c.appliesToLineKey, c.value * multiplier);
    } else if (c.applies === "per_month") {
      v.set(c.appliesToLineKey, c.value);
    }
  }

  // ── Build the Notes column ──────────────────────────────────────
  const notes = new Map<string, string[]>();
  const addNote = (key: string, text: string) => {
    const arr = notes.get(key) ?? [];
    arr.push(text);
    notes.set(key, arr);
  };

  // Unit split. Show ICE / BEV / SalSac so the user can see the mix
  // at a glance — matches the user's example "70 BEV, 20 ICE, 10 SalSac".
  if (totalUnits > 0) {
    const parts: string[] = [];
    if (bevUnits) parts.push(`${bevUnits} BEV`);
    if (iceUnits) parts.push(`${iceUnits} ICE`);
    if (salSacUnits) parts.push(`${salSacUnits} SalSac`);
    if (input.scenarioExtraUnits) parts.push(`${input.scenarioExtraUnits} scenario`);
    if (parts.length) addNote("car_units", parts.join(" · "));
  }

  // F&I policy counts.
  if (alloyPolicies) addNote("alloy_tyre", `${alloyPolicies} polic${alloyPolicies === 1 ? "y" : "ies"}`);
  if (gapPolicies) addNote("gap", `${gapPolicies} polic${gapPolicies === 1 ? "y" : "ies"}`);
  if (paintPolicies) addNote("paint_fabric", `${paintPolicies} polic${paintPolicies === 1 ? "y" : "ies"}`);
  if (warrantyPolicies) addNote("warranty", `${warrantyPolicies} polic${warrantyPolicies === 1 ? "y" : "ies"}`);

  // Standards margin — one note per ICE vehicle so the user sees the
  // rate that was applied to each (e.g. "Kuga: 5 × £30,000 × 1.5% = £2,250").
  for (const [vehicle, b] of standardsByVehicle) {
    if (b.units === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("standards_margin",
      `${vehicle} · ${b.units} ICE × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  for (const [vehicle, b] of stockingByVehicle) {
    if (b.units === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("stocking_credits",
      `${vehicle} · ${b.units} ICE × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }

  // DPA Quarter — one note per vehicle so the user sees each rate.
  if (isQuarterEnd) {
    const quarterLabel = quarterLabelOf(m);
    for (const [vehicle, b] of quarterByVehicle) {
      if (b.total === 0 && b.units === 0) continue;
      const avg = Math.round(b.basicSum / b.units);
      addNote("dpa_quarter", `${quarterLabel} ${b.pct}% · ${vehicle} · ${b.units} × £${avg.toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
    for (const [vehicle, b] of potByVehicle) {
      if (b.total === 0 && b.units === 0) continue;
      addNote("pot_of_gold", `${quarterLabel} · ${vehicle} · ${b.units} × £${Math.round(b.perUnit).toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
  }

  // DPA Half Year — one note per vehicle.
  if (isHalfYearEnd) {
    const halfLabel = m <= 6 ? "H1" : "H2";
    for (const [vehicle, b] of halfYearByVehicle) {
      if (b.total === 0 && b.units === 0) continue;
      const avg = Math.round(b.basicSum / b.units);
      addNote("dpa_half_year", `${halfLabel} ${b.pct}% · ${vehicle} · ${b.units} × £${avg.toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
  }

  return {
    values: v,
    notes,
    unmatchedCount,
    iceUnits,
    bevUnits,
    salSacUnits,
  };
}

// Returns true if `regMonth` (1-12) falls in the same quarter as
// the active month. Used to scope DPA Quarter to its reg-date bucket.
function quartersMatch(activeMonth: number, regMonth: number): boolean {
  const activeQ = Math.floor((activeMonth - 1) / 3);
  const regQ = Math.floor((regMonth - 1) / 3);
  return activeQ === regQ;
}

function quarterLabelOf(month: number): string {
  const q = Math.floor((month - 1) / 3) + 1;
  return `Q${q}`;
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
