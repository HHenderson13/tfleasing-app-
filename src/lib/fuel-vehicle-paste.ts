// Fuel Cost Calculator: adding vehicles by pasting rows, straight from
// Excel (tab-separated) or typed with "|". Every row is checked before
// anything is saved; a bad row is named, never guessed at.
//
//   Petrol / diesel:  Car or Van | Make | Model | Derivative | Petrol or Diesel | MPG
//   Electric:         Car or Van | Make | Model | Derivative | Miles per kWh
//
// A header row is skipped (its efficiency isn't a number).

export interface PastedVehicle {
  powertrain: "ice" | "ev";
  segment: "car" | "van";
  make: string;
  model: string;
  derivative: string;
  fuel: "petrol" | "diesel" | "electric";
  efficiency: number;
}

export interface PasteResult { rows: PastedVehicle[]; errors: { line: number; text: string; message: string }[] }

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// Plausible ranges. Outside them it's almost certainly a typo (or the
// wrong unit: kWh per 100 miles, or litres per 100 km).
const MPG_RANGE = [10, 120] as const;
const MI_PER_KWH_RANGE = [1, 8] as const;

export function parseVehiclePaste(text: string, powertrain: "ice" | "ev"): PasteResult {
  const out: PasteResult = { rows: [], errors: [] };
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split("|")).map(clean);
    const fail = (message: string) => out.errors.push({ line: i + 1, text: raw.trim().slice(0, 120), message });
    const want = powertrain === "ice" ? 6 : 5;
    const effCell = cells[want - 1];
    const eff = Number(String(effCell ?? "").replace(/[^\d.]/g, ""));
    if (cells.length < want) return fail(`Needs ${want} columns: ${powertrain === "ice" ? "Car/Van, Make, Model, Derivative, Fuel, MPG" : "Car/Van, Make, Model, Derivative, Miles per kWh"}.`);
    if (!/\d/.test(effCell ?? "")) { if (i === 0 || out.rows.length === 0) return; return fail("The last column must be a number."); }
    const seg = cells[0].toLowerCase();
    const segment = seg.startsWith("car") ? "car" : seg.startsWith("van") || seg === "lcv" || seg === "cv" ? "van" : null;
    if (!segment) return fail(`"${cells[0]}": the first column must be Car or Van.`);
    const [, make, model, derivative] = cells;
    if (!make || !model || !derivative) return fail("Make, model and derivative are all needed.");
    let fuel: PastedVehicle["fuel"] = "electric";
    if (powertrain === "ice") {
      const f = cells[4].toLowerCase();
      if (f.startsWith("petrol") || f === "p") fuel = "petrol";
      else if (f.startsWith("diesel") || f === "d") fuel = "diesel";
      else return fail(`"${cells[4]}": fuel must be Petrol or Diesel.`);
    }
    const [lo, hi] = powertrain === "ice" ? MPG_RANGE : MI_PER_KWH_RANGE;
    if (!(eff >= lo && eff <= hi)) {
      return fail(powertrain === "ice"
        ? `${effCell} MPG is outside ${lo} to ${hi}. Check it's miles per gallon.`
        : `${effCell} is outside ${lo} to ${hi} miles per kWh. Check it isn't kWh per 100 miles.`);
    }
    out.rows.push({ powertrain, segment, make, model, derivative, fuel, efficiency: eff });
  });
  return out;
}
