// Lease New Cars — per-line forecast computation.
//
// Two parallel sets of values are produced for the monthly sheet:
//
//   1. Dealbook  — strictly the upload's contribution (no scenarios).
//   2. Forecast  — dealbook + scenario contributions.
//
// Per-line dealbook math: look up the vehicle (by vehicle_id) → fuel
// type + per-vehicle bonus rates (Guarantee B %, Stocking %, etc.) and
// apply the right Chassis GP formula (ICE vs BEV). DPA Quarter,
// Half-Year DPA and Pot of Gold use reg-date scope.
//
// Scenarios: per-month rows ("N units of Capri at £X chassis"). Each
// scenario contributes to ALL the cascading metrics — F&I sums use the
// vehicle's all-year averages (from yearLines); Standards / Stocking /
// DPA / Pot of Gold use the per-vehicle bonus rates × scenario units.

import type { ForecastLine } from "../line-definitions";

export interface DealbookCarLine {
  vehicleId: string | null;
  kind: string;              // expect "car"
  source: string;            // "lease" | "salary_sacrifice"
  regDate: string | null;
  overrideMonth: string | null;
  effectiveMonth: string;
  basic: number;             // column BQ
  reconCost: number;
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

// Per-vehicle averages built from all year's dealbook lines. Drive the
// F&I revenue + DPA contributions for forecast scenario units.
export interface VehicleAverages {
  units: number;
  basic: number;             // avg column BQ
  financeIncome: number;     // avg V — Commission & VB
  alloyIncome: number;       // avg W+X+Y+Z+AA — Alloy/Tyre
  gapIncome: number;         // avg AB — GAP
  paintIncome: number;       // avg AC — Paint & Fabric
  warrantyIncome: number;    // avg AD — Warranty
  alloyAttach: number;       // share of lines with alloy income > 0 (0..1)
  gapAttach: number;
  paintAttach: number;       // unused for DCR but kept for symmetry
  warrantyAttach: number;
}

export interface ScenarioRow {
  id: string;
  vehicleId: string;
  chassisGpPerUnit: number;
  units: number;
}

export interface CarMonthInputs {
  lines: DealbookCarLine[];
  regHalfLines: DealbookCarLine[];
  yearLines: DealbookCarLine[];           // for vehicle averages
  scenarios: ScenarioRow[];
  monthNumber: number;
  vehicles: Map<string, VehicleInfo>;
  bonuses: BonusLookup;
  config: Map<string, number>;
  costs: CostConfig[];
}

export interface CarMonthForecast {
  dealbook: Map<string, number>;          // dealbook-only column values
  forecast: Map<string, number>;          // dealbook + scenario contributions
  notes: Map<string, string[]>;
  unmatchedCount: number;
  iceUnits: number;
  bevUnits: number;
  salSacUnits: number;
  scenarioUnits: number;
  vehicleAverages: Map<string, VehicleAverages>;
}

const C = {
  HOUSE_CHARGE:    "car_house_charge_per_unit",
  CHASSIS_PER_UNIT:"car_chassis_per_unit",
  DCR_PER_PRODUCT: "car_dcr_per_product",
};

const B = {
  GUARANTEE_B:      "guarantee_b_pct",
  STOCKING_CREDITS: "stocking_credits_pct",
  QUARTER_DPA:      "quarter_dpa_pct",
  HALF_YEAR_DPA:    "half_year_dpa_pct",
  POT_OF_GOLD:      "pot_of_gold_gbp",
};

function bonusPct(bonuses: BonusLookup, vehicleId: string | null, key: string): number {
  if (!vehicleId) return 0;
  return bonuses.get(vehicleId)?.get(key) ?? 0;
}

// Build per-vehicle averages from the year's dealbook lines.
export function computeVehicleAverages(yearLines: DealbookCarLine[]): Map<string, VehicleAverages> {
  const m = new Map<string, {
    units: number;
    basicSum: number;
    fiSum: number;
    alloySum: number;
    gapSum: number;
    paintSum: number;
    warrantySum: number;
    alloyCount: number;
    gapCount: number;
    paintCount: number;
    warrantyCount: number;
  }>();
  for (const l of yearLines) {
    if (l.kind !== "car" || !l.vehicleId) continue;
    const bucket = m.get(l.vehicleId) ?? {
      units: 0, basicSum: 0, fiSum: 0, alloySum: 0, gapSum: 0, paintSum: 0, warrantySum: 0,
      alloyCount: 0, gapCount: 0, paintCount: 0, warrantyCount: 0,
    };
    const alloy = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
    bucket.units++;
    bucket.basicSum += l.basic;
    bucket.fiSum += l.financeIncome;
    bucket.alloySum += alloy;
    bucket.gapSum += l.gapRtiIncome;
    bucket.paintSum += l.paintProtection;
    bucket.warrantySum += l.warranty;
    if (alloy > 0) bucket.alloyCount++;
    if (l.gapRtiIncome > 0) bucket.gapCount++;
    if (l.paintProtection > 0) bucket.paintCount++;
    if (l.warranty > 0) bucket.warrantyCount++;
    m.set(l.vehicleId, bucket);
  }
  const out = new Map<string, VehicleAverages>();
  for (const [vid, b] of m) {
    out.set(vid, {
      units: b.units,
      basic:           b.units > 0 ? b.basicSum / b.units : 0,
      financeIncome:   b.units > 0 ? b.fiSum / b.units : 0,
      alloyIncome:     b.units > 0 ? b.alloySum / b.units : 0,
      gapIncome:       b.units > 0 ? b.gapSum / b.units : 0,
      paintIncome:     b.units > 0 ? b.paintSum / b.units : 0,
      warrantyIncome:  b.units > 0 ? b.warrantySum / b.units : 0,
      alloyAttach:     b.units > 0 ? b.alloyCount / b.units : 0,
      gapAttach:       b.units > 0 ? b.gapCount / b.units : 0,
      paintAttach:     b.units > 0 ? b.paintCount / b.units : 0,
      warrantyAttach:  b.units > 0 ? b.warrantyCount / b.units : 0,
    });
  }
  return out;
}

export function computeCarMonthForecast(input: CarMonthInputs): CarMonthForecast {
  // Two parallel value maps so the sheet can render Budget · Dealbook ·
  // Forecast · vs Budget side by side.
  const dealbook = new Map<string, number>();
  const forecast = new Map<string, number>();
  const cfg = (key: string, fallback = 0) => input.config.get(key) ?? fallback;
  const houseCharge = cfg(C.HOUSE_CHARGE, 175);
  const chassisPerUnit = cfg(C.CHASSIS_PER_UNIT, 150);
  const dcrPerProduct = cfg(C.DCR_PER_PRODUCT, 15);

  const vehicleAverages = computeVehicleAverages(input.yearLines);
  const carLines = input.lines.filter((l) => l.kind === "car");

  // Per-vehicle Standards / Stocking roll-ups for the notes column.
  const standardsByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const stockingByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();

  // ── Dealbook contributions ────────────────────────────────────────
  let dbChassisGp = 0;
  let dbStandardsMargin = 0;
  let dbStockingCredits = 0;
  let dbCommissionVb = 0;
  let dbAlloy = 0;
  let dbGap = 0;
  let dbPaint = 0;
  let dbWarranty = 0;
  let unmatchedCount = 0;
  let iceUnits = 0;
  let bevUnits = 0;
  let salSacUnits = 0;
  let unitsExSalSac = 0;
  let alloyPolicies = 0;
  let gapPolicies = 0;
  let paintPolicies = 0;
  let warrantyPolicies = 0;

  for (const l of carLines) {
    const veh = l.vehicleId ? input.vehicles.get(l.vehicleId) : null;
    if (!veh) unmatchedCount++;
    const isIce = veh ? veh.fuelType === "ice" : true;
    if (l.source === "salary_sacrifice") salSacUnits++;
    else if (isIce) iceUnits++;
    else bevUnits++;
    if (l.source !== "salary_sacrifice") unitsExSalSac++;

    const alloyIncome = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
    if (alloyIncome > 0) alloyPolicies++;
    if (l.gapRtiIncome > 0) gapPolicies++;
    if (l.paintProtection > 0) paintPolicies++;
    if (l.warranty > 0) warrantyPolicies++;

    // Chassis GP per source / fuel:
    //   SalSac:      U + chassis_per_unit
    //   BEV (Lease): U + chassis_per_unit
    //   ICE (Lease): U + chassis_per_unit − (Basic × Guarantee B %)
    const isSalSac = l.source === "salary_sacrifice";
    const baseChassis = l.totalVehicleProfit + chassisPerUnit;
    if (isSalSac) {
      dbChassisGp += baseChassis;
    } else if (isIce) {
      const gbPct = bonusPct(input.bonuses, l.vehicleId, B.GUARANTEE_B);
      dbChassisGp += baseChassis - (l.basic * gbPct / 100);
    } else {
      dbChassisGp += baseChassis;
    }

    // Standards margin + Stocking credits — ICE only, Lease + SalSac.
    if (isIce) {
      const vehicleName = veh?.id ?? l.vehicleId ?? "(no vehicle)";
      const gbPct = bonusPct(input.bonuses, l.vehicleId, B.GUARANTEE_B);
      const guaranteeAmount = l.basic * gbPct / 100;
      dbStandardsMargin += guaranteeAmount;
      const sBucket = standardsByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: gbPct };
      sBucket.units++; sBucket.basicSum += l.basic; sBucket.total += guaranteeAmount; sBucket.pct = gbPct;
      standardsByVehicle.set(vehicleName, sBucket);

      const scPct = bonusPct(input.bonuses, l.vehicleId, B.STOCKING_CREDITS);
      const stockingAmount = l.basic * scPct / 100;
      dbStockingCredits += stockingAmount;
      const sCBucket = stockingByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct: scPct };
      sCBucket.units++; sCBucket.basicSum += l.basic; sCBucket.total += stockingAmount; sCBucket.pct = scPct;
      stockingByVehicle.set(vehicleName, sCBucket);
    }

    // F&I sums.
    dbCommissionVb += l.financeIncome;
    dbAlloy        += alloyIncome;
    dbGap          += l.gapRtiIncome;
    dbPaint        += l.paintProtection;
    dbWarranty     += l.warranty;
  }

  const dealbookUnits = carLines.length;

  // ── DPA + Pot of Gold (reg-date scoped) ──────────────────────────
  const m = input.monthNumber;
  const isQuarterEnd = m === 3 || m === 6 || m === 9 || m === 12;
  const isHalfYearEnd = m === 6 || m === 12;
  let dbDpaQuarter = 0;
  let dbDpaHalfYear = 0;
  let dbPotOfGold = 0;
  let dbDcrProducts = 0;
  let dbDcrAlloy = 0;
  let dbDcrGap = 0;
  let dbDcrWarranty = 0;
  const quarterByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const halfYearByVehicle = new Map<string, { units: number; basicSum: number; total: number; pct: number }>();
  const potByVehicle = new Map<string, { units: number; perUnit: number; total: number }>();

  for (const l of input.regHalfLines) {
    if (l.kind !== "car" || !l.vehicleId) continue;
    const bucketYyyymm =
      l.overrideMonth ??
      (l.regDate && l.regDate.length >= 7 ? l.regDate.slice(0, 7) : null) ??
      l.effectiveMonth;
    if (!bucketYyyymm) continue;
    const regMonth = parseInt(bucketYyyymm.slice(5, 7), 10);
    if (!regMonth) continue;
    const inActiveQuarter = Math.floor((m - 1) / 3) === Math.floor((regMonth - 1) / 3);
    const halfStart = m <= 6 ? 1 : 7;
    const halfEnd = m <= 6 ? 6 : 12;
    const inActiveHalf = regMonth >= halfStart && regMonth <= halfEnd;
    const vehicleName = input.vehicles.get(l.vehicleId)?.id ?? l.vehicleId;

    if (isQuarterEnd && inActiveQuarter) {
      const pct = bonusPct(input.bonuses, l.vehicleId, B.QUARTER_DPA);
      const contribution = l.basic * pct / 100;
      dbDpaQuarter += contribution;
      const bucket = quarterByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct };
      bucket.units++; bucket.basicSum += l.basic; bucket.total += contribution; bucket.pct = pct;
      quarterByVehicle.set(vehicleName, bucket);

      const potPerUnit = bonusPct(input.bonuses, l.vehicleId, B.POT_OF_GOLD);
      dbPotOfGold += potPerUnit;
      const pot = potByVehicle.get(vehicleName) ?? { units: 0, perUnit: potPerUnit, total: 0 };
      pot.units++; pot.perUnit = potPerUnit; pot.total += potPerUnit;
      potByVehicle.set(vehicleName, pot);

      const alloyIncome = l.financeMb + l.tyreInsIncome + l.financeSubsidy + l.cpiIncome + l.smartRepair;
      if (alloyIncome > 0)     { dbDcrProducts++; dbDcrAlloy++; }
      if (l.gapRtiIncome > 0)  { dbDcrProducts++; dbDcrGap++; }
      if (l.warranty > 0)      { dbDcrProducts++; dbDcrWarranty++; }
    }
    if (isHalfYearEnd && inActiveHalf) {
      const pct = bonusPct(input.bonuses, l.vehicleId, B.HALF_YEAR_DPA);
      const contribution = l.basic * pct / 100;
      dbDpaHalfYear += contribution;
      const bucket = halfYearByVehicle.get(vehicleName) ?? { units: 0, basicSum: 0, total: 0, pct };
      bucket.units++; bucket.basicSum += l.basic; bucket.total += contribution; bucket.pct = pct;
      halfYearByVehicle.set(vehicleName, bucket);
    }
  }

  // ── Scenario contributions ────────────────────────────────────────
  let scenarioChassis = 0;
  let scenarioCommissionVb = 0;
  let scenarioAlloy = 0;
  let scenarioGap = 0;
  let scenarioPaint = 0;
  let scenarioWarranty = 0;
  let scenarioStandards = 0;
  let scenarioStocking = 0;
  let scenarioDpaQuarter = 0;
  let scenarioDpaHalfYear = 0;
  let scenarioPotOfGold = 0;
  let scenarioDcrAlloyProducts = 0;
  let scenarioDcrGapProducts = 0;
  let scenarioDcrWarrantyProducts = 0;
  let scenarioUnits = 0;

  for (const s of input.scenarios) {
    if (s.units <= 0) continue;
    scenarioUnits += s.units;
    scenarioChassis += s.chassisGpPerUnit * s.units;

    const veh = input.vehicles.get(s.vehicleId);
    const avg = vehicleAverages.get(s.vehicleId);

    if (avg) {
      scenarioCommissionVb += avg.financeIncome * s.units;
      scenarioAlloy        += avg.alloyIncome * s.units;
      scenarioGap          += avg.gapIncome * s.units;
      scenarioPaint        += avg.paintIncome * s.units;
      scenarioWarranty     += avg.warrantyIncome * s.units;

      // DCR: count expected products via the historical attach rates.
      // E.g. if 70% of Capri lines had GAP attached, 10 forecast Capri
      // units contributes 7 GAP products.
      if (isQuarterEnd) {
        scenarioDcrAlloyProducts    += avg.alloyAttach * s.units;
        scenarioDcrGapProducts      += avg.gapAttach * s.units;
        scenarioDcrWarrantyProducts += avg.warrantyAttach * s.units;
      }

      // Standards + Stocking — ICE units only.
      if (veh?.fuelType === "ice") {
        const gbPct = bonusPct(input.bonuses, s.vehicleId, B.GUARANTEE_B);
        const stPct = bonusPct(input.bonuses, s.vehicleId, B.STOCKING_CREDITS);
        scenarioStandards += avg.basic * gbPct / 100 * s.units;
        scenarioStocking  += avg.basic * stPct / 100 * s.units;
      }

      // DPA Quarter / Half-Year / Pot of Gold — all scenario units land
      // in the active month, so they fall in the active quarter / half.
      if (isQuarterEnd) {
        const qPct = bonusPct(input.bonuses, s.vehicleId, B.QUARTER_DPA);
        scenarioDpaQuarter += avg.basic * qPct / 100 * s.units;
        const pot = bonusPct(input.bonuses, s.vehicleId, B.POT_OF_GOLD);
        scenarioPotOfGold += pot * s.units;
      }
      if (isHalfYearEnd) {
        const hyPct = bonusPct(input.bonuses, s.vehicleId, B.HALF_YEAR_DPA);
        scenarioDpaHalfYear += avg.basic * hyPct / 100 * s.units;
      }
    }
  }

  // ── Populate value maps ───────────────────────────────────────────
  const totalUnitsDealbook = dealbookUnits;
  const totalUnitsForecast = dealbookUnits + scenarioUnits;
  const unitsExSalSacForecast = unitsExSalSac + scenarioUnits;
  // (Scenario units default to non-SalSac for Collection & Delivery.)

  dealbook.set("car_units",           totalUnitsDealbook);
  dealbook.set("car_chassis_gp",      dbChassisGp);
  dealbook.set("commission_vb",       dbCommissionVb);
  dealbook.set("alloy_tyre",          dbAlloy);
  dealbook.set("gap",                 dbGap);
  dealbook.set("paint_fabric",        dbPaint);
  dealbook.set("warranty",            dbWarranty);
  dealbook.set("standards_margin",    dbStandardsMargin);
  dealbook.set("stocking_credits",    dbStockingCredits);
  dealbook.set("dpa_quarter",         dbDpaQuarter);
  dealbook.set("dpa_half_year",       dbDpaHalfYear);
  dealbook.set("pot_of_gold",         dbPotOfGold);
  dealbook.set("dcr",                 dbDcrProducts * dcrPerProduct);
  dealbook.set("other_income",        houseCharge * totalUnitsDealbook);

  forecast.set("car_units",           totalUnitsForecast);
  forecast.set("car_chassis_gp",      dbChassisGp + scenarioChassis);
  forecast.set("commission_vb",       dbCommissionVb + scenarioCommissionVb);
  forecast.set("alloy_tyre",          dbAlloy + scenarioAlloy);
  forecast.set("gap",                 dbGap + scenarioGap);
  forecast.set("paint_fabric",        dbPaint + scenarioPaint);
  forecast.set("warranty",            dbWarranty + scenarioWarranty);
  forecast.set("standards_margin",    dbStandardsMargin + scenarioStandards);
  forecast.set("stocking_credits",    dbStockingCredits + scenarioStocking);
  forecast.set("dpa_quarter",         dbDpaQuarter + scenarioDpaQuarter);
  forecast.set("dpa_half_year",       dbDpaHalfYear + scenarioDpaHalfYear);
  forecast.set("pot_of_gold",         dbPotOfGold + scenarioPotOfGold);
  forecast.set("dcr",                 (dbDcrProducts + scenarioDcrAlloyProducts + scenarioDcrGapProducts + scenarioDcrWarrantyProducts) * dcrPerProduct);
  forecast.set("other_income",        houseCharge * totalUnitsForecast);

  // Unit-driven cost rows — apply config to both columns.
  for (const c of input.costs) {
    if (!c.appliesToLineKey) continue;
    if (c.applies === "per_unit") {
      const isCD = c.appliesToLineKey === "collection_delivery";
      dealbook.set(c.appliesToLineKey, c.value * (isCD ? unitsExSalSac : totalUnitsDealbook));
      forecast.set(c.appliesToLineKey, c.value * (isCD ? unitsExSalSacForecast : totalUnitsForecast));
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
    if (bevUnits) parts.push(`${bevUnits} BEV`);
    if (iceUnits) parts.push(`${iceUnits} ICE`);
    if (salSacUnits) parts.push(`${salSacUnits} SalSac`);
    if (scenarioUnits) parts.push(`${scenarioUnits} forecast`);
    if (parts.length) addNote("car_units", parts.join(" · "));
  }
  if (alloyPolicies) addNote("alloy_tyre", `${alloyPolicies} polic${alloyPolicies === 1 ? "y" : "ies"}`);
  if (gapPolicies) addNote("gap", `${gapPolicies} polic${gapPolicies === 1 ? "y" : "ies"}`);
  if (paintPolicies) addNote("paint_fabric", `${paintPolicies} polic${paintPolicies === 1 ? "y" : "ies"}`);
  if (warrantyPolicies) addNote("warranty", `${warrantyPolicies} polic${warrantyPolicies === 1 ? "y" : "ies"}`);

  for (const [vehicle, b] of standardsByVehicle) {
    if (b.units === 0 || Math.round(b.total) === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("standards_margin",
      `${vehicle} · ${b.units} ICE × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  for (const [vehicle, b] of stockingByVehicle) {
    if (b.units === 0 || Math.round(b.total) === 0) continue;
    const avg = Math.round(b.basicSum / b.units);
    addNote("stocking_credits",
      `${vehicle} · ${b.units} ICE × avg £${avg.toLocaleString("en-GB")} × ${b.pct}% = £${Math.round(b.total).toLocaleString("en-GB")}`,
    );
  }
  if (isQuarterEnd) {
    const quarterLabel = `Q${Math.floor((m - 1) / 3) + 1}`;
    for (const [vehicle, b] of quarterByVehicle) {
      if (Math.round(b.total) === 0) continue;
      const avg = Math.round(b.basicSum / b.units);
      addNote("dpa_quarter", `${quarterLabel} ${b.pct}% · ${vehicle} · ${b.units} × £${avg.toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
    for (const [vehicle, b] of potByVehicle) {
      if (Math.round(b.total) === 0) continue;
      addNote("pot_of_gold", `${quarterLabel} · ${vehicle} · ${b.units} × £${Math.round(b.perUnit).toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
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
      addNote("dcr", `${quarterLabel} · ${parts.join(" + ")} = ${Math.round(totalDcrProducts)} products × £${dcrPerProduct} = £${Math.round(totalDcrProducts * dcrPerProduct).toLocaleString("en-GB")}`);
    }
  }
  if (isHalfYearEnd) {
    const halfLabel = m <= 6 ? "H1" : "H2";
    for (const [vehicle, b] of halfYearByVehicle) {
      if (Math.round(b.total) === 0) continue;
      const avg = Math.round(b.basicSum / b.units);
      addNote("dpa_half_year", `${halfLabel} ${b.pct}% · ${vehicle} · ${b.units} × £${avg.toLocaleString("en-GB")} = £${Math.round(b.total).toLocaleString("en-GB")}`);
    }
  }

  return {
    dealbook,
    forecast,
    notes,
    unmatchedCount,
    iceUnits,
    bevUnits,
    salSacUnits,
    scenarioUnits,
    vehicleAverages,
  };
}

// Walks `total`/`perUnit` rows in the line definitions for a few sweeps
// so nested derivations settle. Same util used by both columns.
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
