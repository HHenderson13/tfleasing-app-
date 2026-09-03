// Parsing a pasted list of vehicles for bulk pre-reg entry.
//
// Twenty identical vans registered on the same day is one specification and
// twenty vehicles, each with its OWN registration and its own VIN — and the
// two belong together, so they have to arrive paired. One line per vehicle
// does that: whatever else is malformed, the pairing on a line is
// unambiguous, which two side-by-side boxes matched up by line number would
// not be (one blank line and every VIN is on the wrong car).
//
// The box gets pasted from two spreadsheet columns, so a line arrives as
// "AB12 CDE<TAB>WF0AXXTTRAPY12345". It also has to keep working for a plain
// list of plates with no VINs at all.

// Compared with spaces removed: "AB12 CDE" and "AB12CDE" are the same car,
// and someone pasting from two sources will produce both.
export function normaliseReg(reg: string): string {
  return reg.replace(/\s+/g, "").toUpperCase();
}

// Stored as typed, tidied: uppercase, single-spaced, so the list reads like
// a plate rather than a code.
export function tidyReg(reg: string): string {
  return reg.trim().replace(/\s+/g, " ").toUpperCase();
}

// A VIN is exactly 17 characters with no spaces. That is what tells it apart
// from a second registration on the same line — without the length check,
// "AB12 CDE, EF13 GHI" (two plates, one line) would be read as a plate and a
// VIN, silently inventing a VIN that does not exist.
export function looksLikeVin(token: string): boolean {
  return /^[A-Z0-9]{17}$/.test(token.replace(/\s+/g, "").toUpperCase());
}

export interface ParsedVehicle {
  reg: string;
  vin: string | null;
}

export interface ParsedRegs {
  vehicles: ParsedVehicle[];
  duplicateRegs: string[];  // the same plate listed more than once
  duplicateVins: string[];  // the same VIN on more than one plate
}

export function parseRegNumbers(input: string): ParsedRegs {
  const seenReg = new Map<string, string>();
  const seenVin = new Map<string, string>();
  const vehicles: ParsedVehicle[] = [];
  const duplicateRegs: string[] = [];
  const duplicateVins: string[] = [];

  for (const rawLine of input.split(/[\n\r]+/)) {
    // Within a line, these separate the plate from the VIN. NOT the space —
    // "AB12 CDE" is one plate.
    const tokens = rawLine.split(/[,;\t]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) continue;

    // Each token is either a VIN or a plate. Anything that is not 17
    // characters is treated as another vehicle, so a comma-separated list of
    // plates on one line still works.
    let pendingReg: string | null = null;
    const flush = () => {
      if (!pendingReg) return;
      addVehicle(pendingReg, null);
      pendingReg = null;
    };
    const addVehicle = (reg: string, vin: string | null) => {
      const tidy = tidyReg(reg);
      if (!tidy) return;
      const key = normaliseReg(tidy);
      const already = seenReg.get(key);
      if (already) {
        if (!duplicateRegs.includes(already)) duplicateRegs.push(already);
        return;
      }
      let useVin = vin;
      if (useVin) {
        const seen = seenVin.get(useVin);
        if (seen) {
          // A VIN identifies exactly one vehicle. Two plates carrying the
          // same one is a paste error, and guessing which is right would be
          // worse than dropping it and saying so.
          if (!duplicateVins.includes(useVin)) duplicateVins.push(useVin);
          useVin = null;
        } else {
          seenVin.set(useVin, tidy);
        }
      }
      seenReg.set(key, tidy);
      vehicles.push({ reg: tidy, vin: useVin });
    };

    for (const token of tokens) {
      if (looksLikeVin(token)) {
        const vin = token.replace(/\s+/g, "").toUpperCase();
        if (pendingReg) {
          addVehicle(pendingReg, vin);
          pendingReg = null;
        }
        // A VIN with no plate in front of it has nothing to attach to and is
        // ignored — a pre-reg vehicle is identified by its plate.
        continue;
      }
      flush();
      pendingReg = token;
    }
    flush();
  }

  return { vehicles, duplicateRegs, duplicateVins };
}

// ─── Two lists, matched in order ───────────────────────────────────────────
//
// The natural way to enter twenty vehicles is to copy the registration
// column and paste it, then copy the VIN column and paste that. They pair by
// POSITION: the third VIN belongs to the third plate.
//
// Which is fine right up until the two lists are different lengths, and then
// every VIN after the gap is on the wrong car — silently, and in a way that
// is very hard to spot afterwards. So a mismatch is refused rather than
// guessed at; see pairByPosition below.

export function parseVinList(input: string): { vins: string[]; duplicates: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const vins: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\n\r,;\t]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const vin = token.replace(/\s+/g, "").toUpperCase();
    if (!looksLikeVin(vin)) { invalid.push(token); continue; }
    if (seen.has(vin)) { if (!duplicates.includes(vin)) duplicates.push(vin); continue; }
    seen.add(vin);
    vins.push(vin);
  }
  return { vins, duplicates, invalid };
}

export type PairResult =
  | { ok: true; vehicles: ParsedVehicle[] }
  | { ok: false; reason: string };

// An empty VIN list is fine — plates alone are a valid entry. A list that is
// present but the wrong length is not, because there is no safe way to guess
// which car lost its VIN.
export function pairByPosition(vehicles: ParsedVehicle[], vins: string[]): PairResult {
  if (vins.length === 0) return { ok: true, vehicles };
  if (vins.length !== vehicles.length) {
    return {
      ok: false,
      reason:
        `${vehicles.length} registration${vehicles.length === 1 ? "" : "s"} but ${vins.length} VIN${vins.length === 1 ? "" : "s"}. ` +
        `They pair in order, so the lists have to be the same length — otherwise every VIN after the gap lands on the wrong vehicle.`,
    };
  }
  return { ok: true, vehicles: vehicles.map((v, i) => ({ reg: v.reg, vin: vins[i] })) };
}
