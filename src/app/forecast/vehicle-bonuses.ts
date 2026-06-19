// Per-vehicle bonus catalogue. Each row is one column the admin keys in
// per vehicle on the Admin → Vehicles tab. Cars and vans have different
// bonus structures because the funder programmes that pay them differ.

export interface BonusDef {
  key: string;            // stored in forecast_vehicle_bonuses.bonus_key
  label: string;          // shown to the admin
  kind: "pct" | "gbp";    // affects formatting + step
}

export const CAR_BONUSES: BonusDef[] = [
  { key: "guarantee_b_pct",        label: "Guarantee B %",     kind: "pct" },
  { key: "stock_credits_pct",      label: "Stock Credits %",   kind: "pct" },
  { key: "quarter_dpa_pct",        label: "Quarter DPA %",     kind: "pct" },
  { key: "half_year_dpa_pct",      label: "Half Year DPA %",   kind: "pct" },
  { key: "pot_of_gold_gbp",        label: "Pot of Gold £",     kind: "gbp" },
];

export const VAN_BONUSES: BonusDef[] = [
  { key: "standards_pct",          label: "Standards %",       kind: "pct" },
  { key: "vets_pct",                label: "VETS %",            kind: "pct" },
  { key: "stocking_credits_pct",   label: "Stocking Credits %",kind: "pct" },
  { key: "cepa_pct",                label: "CEPA %",            kind: "pct" },
  { key: "dpa_quarter_pct",        label: "DPA Quarter %",     kind: "pct" },
];

export function bonusesForKind(kind: "car" | "van"): BonusDef[] {
  return kind === "car" ? CAR_BONUSES : VAN_BONUSES;
}
