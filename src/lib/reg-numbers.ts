// Parsing a pasted list of registration numbers.
//
// Twenty identical vans registered on the same day is one spec and twenty
// plates, so the entry form takes the spec once and a box of regs. That box
// gets pasted from a spreadsheet column, an email, or typed — so the parser
// has to cope with newlines, commas, tabs and stray blank lines without
// complaint.

// Plates are compared with spaces removed: "AB12 CDE" and "AB12CDE" are the
// same car, and someone pasting from two sources will produce both.
export function normaliseReg(reg: string): string {
  return reg.replace(/\s+/g, "").toUpperCase();
}

// Stored as typed, tidied: uppercase, single-spaced. Keeping the space means
// the list reads like a plate rather than a code.
export function tidyReg(reg: string): string {
  return reg.trim().replace(/\s+/g, " ").toUpperCase();
}

export interface ParsedRegs {
  regs: string[];        // tidied, in the order given, duplicates removed
  duplicates: string[];  // appeared more than once in the input
}

export function parseRegNumbers(input: string): ParsedRegs {
  // Maps the space-stripped key to the spelling we accepted, so a repeat is
  // reported as the plate that actually exists rather than however it was
  // typed the second time.
  const accepted = new Map<string, string>();
  const regs: string[] = [];
  const duplicates: string[] = [];
  // Split on anything that separates a list. NOT on spaces — "AB12 CDE" is
  // one plate, and splitting there would turn every reg into two.
  for (const piece of input.split(/[\n\r,;\t]+/)) {
    const tidy = tidyReg(piece);
    if (!tidy) continue;
    const key = normaliseReg(tidy);
    const already = accepted.get(key);
    if (already) {
      if (!duplicates.includes(already)) duplicates.push(already);
      continue;
    }
    accepted.set(key, tidy);
    regs.push(tidy);
  }
  return { regs, duplicates };
}
