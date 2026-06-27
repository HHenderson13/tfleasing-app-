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

// Permutation narrowing — what FIFA does on its bracket page mid-group-
// stage. Given:
//   - guaranteedIn:   group letters whose 3rd-place team is mathematically
//                     already in the top-8 (will be one of the qualifying
//                     thirds).
//   - eliminatedOut:  group letters whose 3rd-place team is mathematically
//                     out of the top-8 (will NOT qualify).
//
// Filter the 495 Annex C rows to those consistent with both constraints
// (every guaranteedIn group must appear in the row, no eliminatedOut
// group may appear). Then for each best-third R32 slot (74/77/79/…/87),
// if every surviving row agrees on the same group letter, lock that
// slot. Returns a partial map of "match → group letter" — only entries
// the surviving rows unanimously agree on.
//
// This is what lets us publish "Match 74 = Germany vs Paraguay (3rd-D)"
// even while Group X is still playing, exactly the way FIFA does it.
export function narrowAnnexC(
  guaranteedIn: Set<string>,
  eliminatedOut: Set<string>,
): Map<number, string> {
  const survivors = Object.values(TABLE).filter((row) => {
    const rowGroups = new Set(Object.values(row));
    for (const g of guaranteedIn) if (!rowGroups.has(g)) return false;
    for (const g of eliminatedOut) if (rowGroups.has(g)) return false;
    return true;
  });
  const out = new Map<number, string>();
  if (survivors.length === 0) return out;
  // For each best-third match slot, check if all surviving rows agree.
  for (const matchNo of [74, 77, 79, 80, 81, 82, 85, 87]) {
    const key = String(matchNo);
    const seen = new Set<string>();
    for (const row of survivors) seen.add(row[key]);
    if (seen.size === 1) out.set(matchNo, [...seen][0]);
  }
  return out;
}
