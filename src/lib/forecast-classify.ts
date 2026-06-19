// Vehicle classifier — match a Dealbook "Model" string to the vehicle
// catalogue (forecast_vehicles) so each line can be tagged with the
// correct vehicle + kind (car / van / unknown).
//
// Algorithm: case-insensitive substring match. When multiple vehicles
// match the same model text, the one with the longest matching keyword
// wins so "Puma Gen-E Hatch …" is tagged as Puma Gen-E rather than the
// shorter "Puma" match.

export interface VehicleRow {
  id: string;
  name: string;
  kind: string;             // "car" | "van"
  fuelType: string;         // "ice" | "bev"
  keywords: string;         // JSON-encoded array
  sortOrder: number;
}

export interface ParsedVehicle {
  id: string;
  name: string;
  kind: "car" | "van";
  fuelType: "ice" | "bev";
  keywords: string[];
  sortOrder: number;
}

export function parseVehicle(row: VehicleRow): ParsedVehicle {
  let keywords: string[] = [];
  try {
    const arr = JSON.parse(row.keywords);
    if (Array.isArray(arr)) keywords = arr.filter((s) => typeof s === "string" && s.trim().length > 0);
  } catch {
    /* malformed → empty list, classifier will treat as unmatched */
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "van" ? "van" : "car",
    fuelType: row.fuelType === "bev" ? "bev" : "ice",
    keywords,
    sortOrder: row.sortOrder,
  };
}

export interface ClassifyResult {
  vehicleId: string | null;
  kind: "car" | "van" | "unknown";
  matchedKeyword: string | null;
}

export function classifyModel(model: string | null, vehicles: ParsedVehicle[]): ClassifyResult {
  if (!model) return { vehicleId: null, kind: "unknown", matchedKeyword: null };
  const haystack = model.toLowerCase();
  let best: { vehicle: ParsedVehicle; keyword: string } | null = null;
  for (const v of vehicles) {
    for (const kw of v.keywords) {
      const needle = kw.toLowerCase().trim();
      if (!needle) continue;
      if (!haystack.includes(needle)) continue;
      if (!best || needle.length > best.keyword.length) {
        best = { vehicle: v, keyword: kw };
      }
    }
  }
  if (!best) return { vehicleId: null, kind: "unknown", matchedKeyword: null };
  return { vehicleId: best.vehicle.id, kind: best.vehicle.kind, matchedKeyword: best.keyword };
}

// Helper used by the admin UI to render keywords as a comma-separated
// string and parse back on save.
export function keywordsToText(keywords: string[]): string {
  return keywords.join(", ");
}
export function keywordsFromText(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
