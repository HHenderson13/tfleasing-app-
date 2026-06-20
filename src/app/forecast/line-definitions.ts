// Static line schemas for each of the three forecast sheets. These are the
// rows you'd see down the left-hand column of the Excel templates in
// ~/Downloads/New Retail Car Input.xlsx etc. Order matters — the display
// renders them in this exact order.
//
// `dealbookKey` (when set) tells the rollup which dealbook column to sum
// for the "Actual (so far this month)" column. When not set, the line
// either rolls up from other lines (total) or is purely user-keyed.
//
// `kind` controls the row's behaviour:
//   - "unit"     → integer-styled count (no £)
//   - "money"    → currency-styled
//   - "perUnit"  → derived = money/units, read-only
//   - "header"   → no values, just a section divider
//   - "total"    → derived sum of preceding lines in the same group

export type LineKind = "unit" | "money" | "perUnit" | "header" | "total" | "pct";

export interface ForecastLine {
  key: string;                 // stable slug used in DB + URL state
  label: string;
  kind: LineKind;
  // When set, sum this dealbook column for the "Actual" value.
  dealbookKey?: keyof DealbookSummable;
  // For "perUnit": which money key and which unit key to divide.
  perUnitOf?: { money: string; units: string };
  // Section header — visual grouping only.
  section?: boolean;
  // For "total": which keys to sum, and which to subtract.
  totalOf?: string[];
  subtractOf?: string[];
  // Hint about indentation in the UI (0 default, 1 nested).
  indent?: number;
}

// Subset of the dealbook line columns that we can sum into a forecast line.
// Mirrors the column names used in src/db/schema.ts forecastDealbookLines.
export interface DealbookSummable {
  units: number;                 // 1 per line
  chassisProfit: number;
  addBonus: number;
  metalSubsidy: number;
  reconCost: number;
  oallowDiscount: number;
  accessoryProfit: number;
  warrantyCost: number;
  totalVehicleProfit: number;
  financeIncome: number;
  financeMb: number;
  tyreInsIncome: number;
  financeSubsidy: number;
  cpiIncome: number;
  smartRepair: number;
  gapRtiIncome: number;
  paintProtection: number;
  warranty: number;
  totalFiIncome: number;
  totalGrossProfit: number;
}

// ── New Retail Car ────────────────────────────────────────────────────────
// Slim layout: Retail Car (units + Chassis GP), F&I, other income lines
// and the cost stack. Lines tagged with `dealbookKey` draw their value
// from the per-vehicle car-month forecast computation in monthly/
// car-forecast.ts; the rest are derived totals / per-unit cells.
export const NEW_RETAIL_CAR_LINES: ForecastLine[] = [
  { key: "section_retail", label: "New Retail Car", kind: "header", section: true },
  { key: "car_units",          label: "New Car Units",        kind: "unit",   dealbookKey: "units" },
  { key: "car_chassis_gp",     label: "Chassis GP",           kind: "money",  dealbookKey: "chassisProfit" },
  { key: "car_chassis_per",    label: "Chassis GP per unit",  kind: "perUnit", perUnitOf: { money: "car_chassis_gp", units: "car_units" } },

  { key: "section_fi", label: "F&I", kind: "header", section: true },
  { key: "commission_vb",      label: "Commission & VB",      kind: "money",  dealbookKey: "financeIncome" },
  { key: "alloy_tyre",          label: "Alloy Wheel & Tyre",    kind: "money", dealbookKey: "tyreInsIncome" },
  { key: "gap",                 label: "GAP",                   kind: "money", dealbookKey: "gapRtiIncome" },
  { key: "paint_fabric",        label: "Paint & Fabric",        kind: "money", dealbookKey: "paintProtection" },
  { key: "warranty",            label: "Warranty",              kind: "money", dealbookKey: "warranty" },
  { key: "dcr",                 label: "DCR",                   kind: "money" },
  { key: "total_fi",            label: "Total F&I",             kind: "total", totalOf: ["commission_vb", "alloy_tyre", "gap", "paint_fabric", "warranty", "dcr"] },
  { key: "fi_per_unit",         label: "F&I per unit",          kind: "perUnit", perUnitOf: { money: "total_fi", units: "car_units" } },

  { key: "section_other_income", label: "Other income lines", kind: "header", section: true },
  { key: "standards_margin",    label: "Standards margin (ICE)",   kind: "money" },
  { key: "stocking_credits",    label: "Stocking credits (ICE)",   kind: "money" },
  // Quarter DPA / Pot of Gold only land in the quarter-end month
  // (Mar / Jun / Sep / Dec). Half-year DPA only in Jun / Dec. The
  // forecast computation zeroes them in other months.
  { key: "dpa_quarter",         label: "Quarter DPA",              kind: "money" },
  { key: "dpa_half_year",       label: "Half-Year DPA",            kind: "money" },
  { key: "pot_of_gold",         label: "Pot of Gold",              kind: "money" },
  { key: "other_income",        label: "Other income (House charge)", kind: "money" },
  { key: "gp_before_variables", label: "GP Before Variables",      kind: "total", totalOf: ["car_chassis_gp", "total_fi", "standards_margin", "stocking_credits", "dpa_quarter", "dpa_half_year", "pot_of_gold", "other_income"] },

  { key: "section_variable", label: "Variable costs", kind: "header", section: true },
  { key: "pdi_prep",            label: "PDI & Prep",               kind: "money" },
  { key: "cleaning",            label: "Cleaning",                 kind: "money" },
  { key: "sales_commissions",   label: "Sales Commissions",        kind: "money" },
  { key: "collection_delivery", label: "Collection & Delivery",    kind: "money" },
  { key: "late_costs",          label: "Late Costs",               kind: "money" },
  { key: "total_variable",      label: "Total variable costs",     kind: "total", totalOf: ["pdi_prep", "cleaning", "sales_commissions", "collection_delivery", "late_costs"] },
  { key: "variable_per_unit",   label: "Variable costs per unit",  kind: "perUnit", perUnitOf: { money: "total_variable", units: "car_units" } },
  { key: "gross_profit",        label: "Gross Profit",             kind: "total", totalOf: ["gp_before_variables"], subtractOf: ["total_variable"] },

  { key: "section_expenses", label: "Expenses", kind: "header", section: true },
  { key: "personnel",           label: "Personnel Costs",          kind: "money" },
  { key: "sales_promotion",     label: "Sales Promotion Costs",    kind: "money" },
  { key: "vehicle_costs",       label: "Vehicle Costs",            kind: "money" },
  { key: "equipment",           label: "Equipment Costs",          kind: "money" },
  { key: "stock_control",       label: "Stock Control Costs",      kind: "money" },
  { key: "other_direct",        label: "Other Direct (incl. bad debt)", kind: "money" },
  { key: "property",            label: "Property Costs",           kind: "money" },
  { key: "total_expenses",      label: "Total Expenses",           kind: "total", totalOf: ["personnel", "sales_promotion", "vehicle_costs", "equipment", "stock_control", "other_direct", "property"] },
  { key: "total_interest",      label: "Total Interest",           kind: "money" },
  { key: "net_profit",          label: "Net profit",               kind: "total", totalOf: ["gross_profit"], subtractOf: ["total_expenses", "total_interest"] },
];

// ── New Retail CV ─────────────────────────────────────────────────────────
// Mirrors the Car layout. CV-specific bits:
//   - Chassis = U − (Basic × Standards %) − (Basic × VETS %) + £150
//   - Guaranteed Margin = Basic × Standards %
//   - Standards margin  = Basic × VETS %
//   - Quarter DPA only — no Half-Year DPA, no Pot of Gold
//   - CSPA = 10% × previous quarter's CV DPA, paid in Jan/Apr/Jul/Oct
export const NEW_RETAIL_CV_LINES: ForecastLine[] = [
  { key: "section_retail_cv", label: "New Retail CV", kind: "header", section: true },
  { key: "cv_units",           label: "New CV Units",          kind: "unit",   dealbookKey: "units" },
  { key: "cv_chassis_gp",      label: "Chassis GP",            kind: "money",  dealbookKey: "chassisProfit" },
  { key: "cv_chassis_per",     label: "Chassis GP per unit",   kind: "perUnit", perUnitOf: { money: "cv_chassis_gp", units: "cv_units" } },

  { key: "section_cv_fi", label: "F&I", kind: "header", section: true },
  { key: "cv_commission_vb",   label: "Commission & VB",       kind: "money",  dealbookKey: "financeIncome" },
  { key: "cv_alloy_tyre",      label: "Alloy Wheel & Tyre",    kind: "money", dealbookKey: "tyreInsIncome" },
  { key: "cv_gap",             label: "GAP",                   kind: "money", dealbookKey: "gapRtiIncome" },
  { key: "cv_paint_fabric",    label: "Paint & Fabric",        kind: "money", dealbookKey: "paintProtection" },
  { key: "cv_warranty",        label: "Warranty",              kind: "money", dealbookKey: "warranty" },
  { key: "cv_dcr",             label: "DCR",                   kind: "money" },
  { key: "cv_total_fi",        label: "Total F&I",             kind: "total", totalOf: ["cv_commission_vb", "cv_alloy_tyre", "cv_gap", "cv_paint_fabric", "cv_warranty", "cv_dcr"] },
  { key: "cv_fi_per_unit",     label: "F&I per unit",          kind: "perUnit", perUnitOf: { money: "cv_total_fi", units: "cv_units" } },

  { key: "section_cv_other", label: "Other income lines", kind: "header", section: true },
  { key: "cv_guaranteed_margin", label: "Guaranteed Margin",      kind: "money" },
  { key: "cv_standards_margin", label: "Standards margin",        kind: "money" },
  { key: "cv_stocking_credits", label: "Stocking credits",        kind: "money" },
  { key: "cvdpa",              label: "Quarter DPA",              kind: "money" },
  { key: "cv_cspa",            label: "CSPA",                     kind: "money" },
  { key: "cv_other_income",    label: "Other income (House charge)", kind: "money" },
  { key: "cv_gp_before_variables", label: "GP Before Variables",  kind: "total", totalOf: ["cv_chassis_gp", "cv_total_fi", "cv_guaranteed_margin", "cv_standards_margin", "cv_stocking_credits", "cvdpa", "cv_cspa", "cv_other_income"] },

  { key: "section_cv_variable", label: "Variable costs", kind: "header", section: true },
  { key: "cv_pdi_prep",         label: "PDI & Prep",              kind: "money" },
  { key: "cv_cleaning",         label: "Cleaning",                kind: "money" },
  { key: "cv_sales_commissions", label: "Sales Commissions",      kind: "money" },
  { key: "cv_collection_delivery", label: "Collection & Delivery", kind: "money" },
  { key: "cv_total_variable",   label: "Total variable costs",    kind: "total", totalOf: ["cv_pdi_prep", "cv_cleaning", "cv_sales_commissions", "cv_collection_delivery"] },
  { key: "cv_variable_per_unit", label: "Variable costs per unit", kind: "perUnit", perUnitOf: { money: "cv_total_variable", units: "cv_units" } },
  { key: "cv_gross_profit",     label: "Gross Profit",            kind: "total", totalOf: ["cv_gp_before_variables"], subtractOf: ["cv_total_variable"] },

  { key: "section_cv_expenses", label: "Expenses", kind: "header", section: true },
  { key: "cv_personnel",        label: "Personnel Costs",         kind: "money" },
  { key: "cv_sales_promotion",  label: "Sales Promotion Costs",   kind: "money" },
  { key: "cv_vehicle_costs",    label: "Vehicle Costs",           kind: "money" },
  { key: "cv_equipment",        label: "Equipment Costs",         kind: "money" },
  { key: "cv_stock_control",    label: "Stock Control Costs",     kind: "money" },
  { key: "cv_other_direct",     label: "Other Direct (incl. bad debt)", kind: "money" },
  { key: "cv_property",         label: "Property Costs",          kind: "money" },
  { key: "cv_total_expenses",   label: "Total Expenses",          kind: "total", totalOf: ["cv_personnel", "cv_sales_promotion", "cv_vehicle_costs", "cv_equipment", "cv_stock_control", "cv_other_direct", "cv_property"] },
  { key: "cv_total_interest",   label: "Total Interest",          kind: "money" },
  { key: "cv_net_profit",       label: "Net profit",              kind: "total", totalOf: ["cv_gross_profit"], subtractOf: ["cv_total_expenses", "cv_total_interest"] },
];

// ── Overheads ─────────────────────────────────────────────────────────────
export const OVERHEADS_LINES: ForecastLine[] = [
  { key: "section_overheads", label: "General Overheads", kind: "header", section: true },
  { key: "oh_personnel",      label: "Personnel Costs",        kind: "money" },
  { key: "oh_sales_promotion", label: "Sales Promotion Costs", kind: "money" },
  { key: "oh_vehicle_costs",  label: "Vehicle Costs",          kind: "money" },
  { key: "oh_equipment",      label: "Equipment Costs",        kind: "money" },
  { key: "oh_stock_control",  label: "Stock Control Costs",    kind: "money" },
  { key: "oh_other_direct",   label: "Other Direct (incl. bad debt)", kind: "money" },
  { key: "oh_property",       label: "Property Costs",         kind: "money" },
  { key: "oh_total_expenses", label: "Total Expenses",         kind: "total", totalOf: ["oh_personnel", "oh_sales_promotion", "oh_vehicle_costs", "oh_equipment", "oh_stock_control", "oh_other_direct", "oh_property"] },
  { key: "oh_total_interest", label: "Total Interest",         kind: "money" },
  { key: "oh_other_income",   label: "Other income",           kind: "money" },
  { key: "oh_net_profit",     label: "Net profit",             kind: "total", totalOf: ["oh_other_income"], subtractOf: ["oh_total_expenses", "oh_total_interest"] },
];

export type SheetKey = "car" | "cv" | "overheads";

export function getLinesForSheet(sheet: SheetKey): ForecastLine[] {
  if (sheet === "car") return NEW_RETAIL_CAR_LINES;
  if (sheet === "cv") return NEW_RETAIL_CV_LINES;
  return OVERHEADS_LINES;
}

export const SHEET_LABELS: Record<SheetKey, string> = {
  car: "New Retail Car",
  cv: "New Retail CV",
  overheads: "Overheads",
};
