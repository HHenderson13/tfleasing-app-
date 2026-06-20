// Lease New Commercial — per-line forecast computation.
//
// Mirrors car-forecast.ts but with CV-specific math:
//   Chassis GP   = U − (Basic × Standards %) − (Basic × VETS %) + £150
//   Guar. Margin = Basic × Standards %
//   Standards    = Basic × VETS %
//   Stocking     = Basic × Stocking Credits %
//   Quarter DPA only (no Half-Year, no Pot of Gold)
//   CSPA         = 10% × previous quarter's Quarter DPA total, paid in
//                  Jan / Apr / Jul / Oct only
//
// Scenarios cascade through the same way as the Car sheet — each row
// adds units × the vehicle's averages × the per-vehicle bonus rates.

import type { ForecastLine } from "../line-definitions";
import { computeVehicleAverages } from "./car-forecast";
import type {
  DealbookCarLine,
  VehicleInfo,
  BonusLookup,
  CostConfig,
  ScenarioRow,
  VehicleAverages,
} from "./car-forecast";

// Re-use the Car line shape — same dealbook columns.
export type DealbookCvLine = DealbookCarLine;

export interface CvMonthInputs {
  lines: DealbookCvLine[];
  regHalfLines: DealbookCvLine[];
  // Previous quarter reg-scope, only loaded when active month is in
  // {Jan, Apr, Jul, Oct}. Used to compute CSPA from prior Q DPA.
  prevQuarterLines: DealbookCvLine[];
  yearLines: DealbookCvLine[];
  scenarios: ScenarioRow[];
  monthNumber: number;
  vehicles: Map<string, VehicleInfo>;
  bonuses: BonusLookup;
  config: Map<string, number>;
  costs: CostConfig[];
}

export interface CvMonthForecast {
  dealbook: Map<string, number>;
  forecast: Map<string, number>;
  notes: Map<string, string[]>;
  unmatchedCount: number;
  vanUnits: number;
  scenarioUnits: number;
  vehicleAverages: Map<string, VehicleAverages>;
}

const C = {
  HOUSE_CHARGE:     "cv_house_charge_per_unit",
  CHASSIS_PER_UNIT: "cv_chassis_per_unit",
  DCR_PER_PRODUCT:  "cv_dcr_per_product",
  CSPA_PCT:         "cv_cspa_pct_of_prev_q_dpa",
};

const B = {
  STANDARDS:        "standards_pct",         // → Guaranteed Margin AND Chassis deduction
  VETS:             "vets_pct",              // → Standards margin AND Chassis deduction
  STOCKING_CREDITS: "stocking_credits_pct",  // → Stocking credits
  QUARTER_DPA:      "dpa_quarter_pct",       // → Quarter DPA
};

function bonusPct(bonuses: BonusLookup, vehicleId: string | null, key: string): number {
  if (!vehicleId) return 0;
  return bonuses.get(vehicleId)?.get(key) ?? 0;
}

export function computeCvMonthForecast(input: CvMonthInputs): CvMonthForecast {
  const dealbook = new Map<string, number>();
  const forecast = new Map<string, number>();
  const cfg = (key: string, fallback = 0) => input.config.get(key) ?? fallback;
  const houseCharge = cfg(C.HOUSE_CHARGE, 175);
  const chassisPerUnit = cfg(C.CHASSIS_PER_UNIT, 150);
  const dcrPerProduct = cfg(C.DCR_PER_PRODUCT, 15);
  const cspaPct = cfg(C.CSPA_PCT, 10);

  const vehicleAverages = computeVehicleAverages(input.yearLines);
  const cvLines = input.lines.filter((l) => l.kind === "van");

  // Per-vehicle Guaranteed Margin (Standards %) + Standards (VETS %)
  // + Stocking aggregations so the notes column can break down what
  // each model contributed.
  const guaranteedByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const standardsByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const stockingByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();

  // ── Dealbook contributions ────────────────────────────────────────
  let dbChassisGp = 0;
  let dbGuaranteedMargin = 0;
  let dbStandardsMargin = 0;
  let dbStockingCredits = 0;
  let dbCommissionVb = 0;
  let dbAlloy = 0;
  let dbGap = 0;
  let dbPaint = 0;
  let dbWarranty = 0;
  let unmatchedCount = 0;
  let vanUnits = 0;
  let alloyPolicies = 0;
  let gapPolicies = 0;
  let paintPolicies = 0;
  let warrantyPolicies = 0;

  for (const l of cvLines) {
    const veh = l.vehicleId ? input.vehicles.get(l.vehicleId) : null;
    if (!veh) unmatchedCount++;
    vanUnits++;

    const alloyIncome = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
    if (alloyIncome > 0) alloyPolicies++;
    if (l.gapRtiIncome > 0) gapPolicies++;
    if (l.paintProtection > 0) paintPolicies++;
    if (l.warranty > 0) warrantyPolicies++;

    const vehicleName = veh?.id ?? l.vehicleId ?? "(no vehicle)";
    const standardsPct = bonusPct(input.bonuses, l.vehicleId, B.STANDARDS);
    const vetsPct = bonusPct(input.bonuses, l.vehicleId, B.VETS);
    const stockPct = bonusPct(input.bonuses, l.vehicleId, B.STOCKING_CREDITS);
    const standardsAmount = l.basic * standardsPct / 100;
    const vetsAmount = l.basic * vetsPct / 100;
    const stockingAmount = l.basic * stockPct / 100;

    // Chassis GP = U − (Basic × Standards) − (Basic × VETS) + chassis_constant
    dbChassisGp += l.totalVehicleProfit - standardsAmount - vetsAmount + chassisPerUnit;

    // Guaranteed Margin = Basic × Standards %
    dbGuaranteedMargin += standardsAmount;
    {
      const b = guaranteedByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: standardsPct };
      b.units++; b.basicSum += l.basic; b.total += standardsAmount; b.pct = standardsPct;
      guaranteedByVehicle.set(vehicleName, b);
    }

    // Standards margin = Basic × VETS %
    dbStandardsMargin += vetsAmount;
    {
      const b = standardsByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: vetsPct };
      b.units++; b.basicSum += l.basic; b.total += vetsAmount; b.pct = vetsPct;
      standardsByVehicle.set(vehicleName, b);
    }

    // Stocking credits = Basic × Stocking %
    dbStockingCredits += stockingAmount;
    {
      const b = stockingByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: stockPct };
      b.units++; b.basicSum += l.basic; b.total += stockingAmount; b.pct = stockPct;
      stockingByVehicle.set(vehicleName, b);
    }

    // F&I sums (same as car).
    dbCommissionVb += l.financeIncome;
    dbAlloy        += alloyIncome;
    dbGap          += l.gapRtiIncome;
    dbPaint        += l.paintProtection;
    dbWarranty     += l.warranty;
  }

  const dealbookUnits = cvLines.length;

  // ── Quarter DPA (reg-date scoped) + DCR ──────────────────────────
  const m = input.monthNumber;
  const isQuarterEnd = m === 3 || m === 6 || m === 9 || m === 12;
  const isCspaMonth = m === 1 || m === 4 || m === 7 || m === 10;
  let dbDpaQuarter = 0;
  let dbDcrProducts = 0;
  let dbDcrAlloy = 0;
  let dbDcrGap = 0;
  let dbDcrWarranty = 0;
  const quarterByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();

  for (const l of input.regHalfLines) {
    if (l.kind !== "van" || !l.vehicleId) continue;
    const bucketYyyymm =
      l.overrideMonth ??
      (l.regDate && l.regDate.length >= 7 ? l.regDate.slice(0, 7) : null) ??
      l.effectiveMonth;
    if (!bucketYyyymm) continue;
    const regMonth = parseInt(bucketYyyymm.slice(5, 7), 10);
    if (!regMonth) continue;
    const inActiveQuarter = Math.floor((m - 1) / 3) === Math.floor((regMonth - 1) / 3);
    if (!isQuarterEnd || !inActiveQuarter) continue;
    const vehicleName = input.vehicles.get(l.vehicleId)?.id ?? l.vehicleId;
    const pct = bonusPct(input.bonuses, l.vehicleId, B.QUARTER_DPA);
    const contribution = l.basic * pct / 100;
    dbDpaQuarter += contribution;
    const bucket = quarterByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct };
    bucket.units++; bucket.basicSum += l.basic; bucket.total += contribution; bucket.pct = pct;
    quarterByVehicle.set(vehicleName, bucket);

    const alloyIncome = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
    if (alloyIncome > 0)     { dbDcrProducts++; dbDcrAlloy++; }
    if (l.gapRtiIncome > 0)  { dbDcrProducts++; dbDcrGap++; }
    if (l.warranty > 0)      { dbDcrProducts++; dbDcrWarranty++; }
  }

  // ── CSPA: 10% × previous quarter's Quarter DPA ───────────────────
  // The user spec: "do not include half year or pot of gold" — CV
  // never has those, so it's literally Q-DPA for that previous
  // quarter. Only payable in Jan / Apr / Jul / Oct.
  let dbCspa = 0;
  if (isCspaMonth) {
    let prevQDpa = 0;
    for (const l of input.prevQuarterLines) {
      if (l.kind !== "van" || !l.vehicleId) continue;
      const pct = bonusPct(input.bonuses, l.vehicleId, B.QUARTER_DPA);
      prevQDpa += l.basic * pct / 100;
    }
    dbCspa = prevQDpa * cspaPct / 100;
  }

  // ── Scenario contributions ────────────────────────────────────────
  let scenarioChassis = 0;
  let scenarioGuaranteed = 0;
  let scenarioStandards = 0;
  let scenarioStocking = 0;
  let scenarioCommissionVb = 0;
  let scenarioAlloy = 0;
  let scenarioGap = 0;
  let scenarioPaint = 0;
  let scenarioWarranty = 0;
  let scenarioDpaQuarter = 0;
  let scenarioDcrAlloyProducts = 0;
  let scenarioDcrGapProducts = 0;
  let scenarioDcrWarrantyProducts = 0;
  let scenarioUnits = 0;

  for (const s of input.scenarios) {
    if (s.units <= 0) continue;
    const veh = input.vehicles.get(s.vehicleId);
    if (!veh) continue; // scenarios for non-vans don't apply here
    scenarioUnits += s.units;
    scenarioChassis += s.chassisGpPerUnit * s.units;

    const avg = vehicleAverages.get(s.vehicleId);
    if (!avg) continue;
    scenarioCommissionVb += avg.financeIncome * s.units;
    scenarioAlloy        += avg.alloyIncome * s.units;
    scenarioGap          += avg.gapIncome * s.units;
    scenarioPaint        += avg.paintIncome * s.units;
    scenarioWarranty     += avg.warrantyIncome * s.units;

    if (isQuarterEnd) {
      scenarioDcrAlloyProducts    += avg.alloyAttach * s.units;
      scenarioDcrGapProducts      += avg.gapAttach * s.units;
      scenarioDcrWarrantyProducts += avg.warrantyAttach * s.units;
    }

    const stdPct = bonusPct(input.bonuses, s.vehicleId, B.STANDARDS);
    const vetsPct = bonusPct(input.bonuses, s.vehicleId, B.VETS);
    const stockPct = bonusPct(input.bonuses, s.vehicleId, B.STOCKING_CREDITS);
    scenarioGuaranteed += avg.basic * stdPct / 100 * s.units;
    scenarioStandards  += avg.basic * vetsPct / 100 * s.units;
    scenarioStocking   += avg.basic * stockPct / 100 * s.units;

    if (isQuarterEnd) {
      const qPct = bonusPct(input.bonuses, s.vehicleId, B.QUARTER_DPA);
      scenarioDpaQuarter += avg.basic * qPct / 100 * s.units;
    }
    // CSPA scenarios are tricky (would need prev-Q scenarios). Skip —
    // CSPA is purely a function of last quarter's DPA, which we can't
    // back-fill without scenarios in the prior month.
  }

  // ── Populate maps ────────────────────────────────────────────────
  const totalUnitsDealbook = dealbookUnits;
  const totalUnitsForecast = dealbookUnits + scenarioUnits;

  dealbook.set("cv_units",             totalUnitsDealbook);
  dealbook.set("cv_chassis_gp",        dbChassisGp);
  dealbook.set("cv_commission_vb",     dbCommissionVb);
  dealbook.set("cv_alloy_tyre",        dbAlloy);
  dealbook.set("cv_gap",               dbGap);
  dealbook.set("cv_paint_fabric",      dbPaint);
  dealbook.set("cv_warranty",          dbWarranty);
  dealbook.set("cv_guaranteed_margin", dbGuaranteedMargin);
  dealbook.set("cv_standards_margin",  dbStandardsMargin);
  dealbook.set("cv_stocking_credits",  dbStockingCredits);
  dealbook.set("cvdpa",                dbDpaQuarter);
  dealbook.set("cv_cspa",              dbCspa);
  dealbook.set("cv_dcr",               dbDcrProducts * dcrPerProduct);
  dealbook.set("cv_other_income",      houseCharge * totalUnitsDealbook);

  forecast.set("cv_units",             totalUnitsForecast);
  forecast.set("cv_chassis_gp",        dbChassisGp + scenarioChassis);
  forecast.set("cv_commission_vb",     dbCommissionVb + scenarioCommissionVb);
  forecast.set("cv_alloy_tyre",        dbAlloy + scenarioAlloy);
  forecast.set("cv_gap",               dbGap + scenarioGap);
  forecast.set("cv_paint_fabric",      dbPaint + scenarioPaint);
  forecast.set("cv_warranty",          dbWarranty + scenarioWarranty);
  forecast.set("cv_guaranteed_margin", dbGuaranteedMargin + scenarioGuaranteed);
  forecast.set("cv_standards_margin",  dbStandardsMargin + scenarioStandards);
  forecast.set("cv_stocking_credits",  dbStockingCredits + scenarioStocking);
  forecast.set("cvdpa",                dbDpaQuarter + scenarioDpaQuarter);
  forecast.set("cv_cspa",              dbCspa);
  forecast.set("cv_dcr",               (dbDcrProducts + scenarioDcrAlloyProducts + scenarioDcrGapProducts + scenarioDcrWarrantyProducts) * dcrPerProduct);
  forecast.set("cv_other_income",      houseCharge * totalUnitsForecast);

  // Cost rows (PDI, cleaning, sales commission, collection & delivery,
  // and the per-month expense rows) flow in via the same applies /
  // applies_to_line_key mechanism as Car.
  for (const c of input.costs) {
    if (!c.appliesToLineKey) continue;
    if (c.applies === "per_unit") {
      dealbook.set(c.appliesToLineKey, c.value * totalUnitsDealbook);
      forecast.set(c.appliesToLineKey, c.value * totalUnitsForecast);
    } else if (c.applies === "per_month") {
      dealbook.set(c.appliesToLineKey, c.value);
      forecast.set(c.appliesToLineKey, c.value);
    }
  }

  // ── Notes ────────────────────────────────────────────────────────
  const notes = new Map<string, string[]>();
  const addNote = (key: string, text: string) => {
    const arr = notes.get(key) ?? [];
    arr.push(text);
    notes.set(key, arr);
  };
  if (totalUnitsForecast > 0) {
    const parts: string[] = [];
    if (vanUnits) parts.push(`${vanUnits} dealbook`);
    if (scenarioUnits) parts.push(`${scenarioUnits} forecast`);
    if (parts.length) addNote("cv_units", parts.join(" · "));
  }
  if (alloyPolicies) addNote("cv_alloy_tyre", `${alloyPolicies} polic${alloyPolicies === 1 ? "y" : "ies"}`);
  if (gapPolicies) addNote("cv_gap", `${gapPolicies} polic${gapPolicies === 1 ? "y" : "ies"}`);
  if (paintPolicies) addNote("cv_paint_fabric", `${paintPolicies} polic${paintPolicies === 1 ? "y" : "ies"}`);
  if (warrantyPolicies) addNote("cv_warranty", `${warrantyPolicies} polic${warrantyPolicies === 1 ? "y" : "ies"}`);

  for (const [vehicle, b] of guaranteedByVehicle) {
    if (b.units === 0 || Math.round(b.total) === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("cv_guaranteed_margin",
      `${vehicle} · ${b.units} × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% Standards = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  for (const [vehicle, b] of standardsByVehicle) {
    if (b.units === 0 || Math.round(b.total) === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("cv_standards_margin",
      `${vehicle} · ${b.units} × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% VETS = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  for (const [vehicle, b] of stockingByVehicle) {
    if (b.units === 0 || Math.round(b.total) === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("cv_stocking_credits",
      `${vehicle} · ${b.units} × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% Stocking = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  if (isQuarterEnd) {
    const quarterLabel = `Q${Math.floor((m - 1) / 3) + 1}`;
    for (const [vehicle, b] of quarterByVehicle) {
      if (Math.round(b.total) === 0) continue;
      const avg = Math.round(b.basicSum / b.units);
      addNote("cvdpa", `${quarterLabel} ${b.pct}% · ${vehicle} · ${b.units} × £${avg.toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
    const totalDcrProducts = dbDcrProducts + scenarioDcrAlloyProducts + scenarioDcrGapProducts + scenarioDcrWarrantyProducts;
    if (totalDcrProducts > 0) {
      const parts: string[] = [];
      const alloy = dbDcrAlloy + scenarioDcrAlloyProducts;
      const gap = dbDcrGap + scenarioDcrGapProducts;
      const wrnt = dbDcrWarranty + scenarioDcrWarrantyProducts;
      if (alloy > 0) parts.push(`${Math.round(alloy)} Alloy`);
      if (gap > 0) parts.push(`${Math.round(gap)} GAP`);
      if (wrnt > 0) parts.push(`${Math.round(wrnt)} Warranty`);
      addNote("cv_dcr", `${quarterLabel} · ${parts.join(" + ")} = ${Math.round(totalDcrProducts)} products × £${dcrPerProduct} = £${Math.round(totalDcrProducts * dcrPerProduct).toLocaleString("en-GB")}`);
    }
  }
  if (isCspaMonth && Math.round(dbCspa) !== 0) {
    const prevQ = m === 1 ? "Q4" : `Q${Math.floor((m - 1) / 3)}`;
    addNote("cv_cspa", `${cspaPct}% × ${prevQ} Quarter DPA = £${Math.round(dbCspa).toLocaleString("en-GB")}`);
  }

  return {
    dealbook,
    forecast,
    notes,
    unmatchedCount,
    vanUnits,
    scenarioUnits,
    vehicleAverages,
  };
}

// Re-use the Car settler for derived totals.
export { settleDerivedLines } from "./car-forecast";

// Re-export the line type for symmetry.
export type { ForecastLine };
