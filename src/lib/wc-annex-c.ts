// FIFA 2026 World Cup — Annex C lookup.
//
// Of the 12 groups (A-L), the 8 best third-placed teams advance into
// the Round of 32. There are C(12,8) = 495 possible combinations of
// which 8 groups produce a qualifying third. For each combination,
// FIFA's Annex C tells you which group's third goes into which R32
// match (74, 77, 79, 80, 81, 82, 85, 87).
//
// Extracted from src/lib/wc-annex-c.json which itself was parsed from
// the official Regulations PDF (Annexe C, pages 80-97). Each row maps
// the 8 R32 "best third" slots to a group letter A-L.

import RAW from "./wc-annex-c.json";

// One mapping = { matchNumber → groupLetter for that match's best-3rd slot }.
type Mapping = Record<string, string>;
const TABLE = RAW as Record<string, Mapping>;

// The 8 R32 match numbers that have a best-third slot, in the same
// column order Annex C lists them (1A→79, 1B→85, 1D→81, 1E→74, 1G→82,
// 1I→77, 1K→87, 1L→80).
export const BEST_THIRD_MATCHES = [74, 77, 79, 80, 81, 82, 85, 87] as const;

// Given the 8 group letters that produced a qualifying third, look up
// which group goes to each of the 8 R32 best-third slots. Returns null
// if the combination isn't valid (shouldn't happen — every C(12,8) set
// has an entry).
export function resolveAnnexC(qualifyingThirds: Set<string>): Map<number, string> | null {
  if (qualifyingThirds.size !== 8) return null;
  // Find the matching option by checking which row uses exactly these
  // groups. A row is a mapping match→group; the set of group letters
  // used by the row must equal qualifyingThirds.
  for (const row of Object.values(TABLE)) {
    const rowGroups = new Set(Object.values(row));
    if (rowGroups.size !== qualifyingThirds.size) continue;
    let match = true;
    for (const g of qualifyingThirds) {
      if (!rowGroups.has(g)) { match = false; break; }
    }
    if (!match) continue;
    // Build the result map { matchNumber → groupLetter }
    const out = new Map<number, string>();
    for (const [matchStr, group] of Object.entries(row)) {
      out.set(parseInt(matchStr, 10), group);
    }
    return out;
  }
  return null;
}
