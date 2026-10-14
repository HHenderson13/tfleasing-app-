// Builds public/fuel-reference.json: the make, model and derivative list
// with official MPG that the Fuel Cost Calculator offers for a customer's
// CURRENT petrol or diesel car or van.
//
//   npx tsx scripts/build-fuel-reference.ts
//
// Source: the European Environment Agency's CO2 monitoring data (cars:
// Regulation (EU) 2019/631; vans: 510/2011), queried through its free
// DiscoData SQL service: every new car and van registered, with make,
// commercial name (which carries the trim), fuel, engine size and the
// official type-approval CO2. Reuse is free with attribution (EEA). UK
// registrations are in it up to 2020; Ireland (right-hand drive, near-
// identical ranges) fills 2021 to 2022.
//
// MPG is worked back from the official CO2 by carbon balance, which is how
// the official MPG is calculated in the first place (lib/fuel-calc.ts
// mpgFromCo2). WLTP where the year has it, NEDC otherwise (flagged).
//
// Left out: plug-in hybrids (their official CO2 includes electric running,
// so the MPG would mislead), pure electric, gas and flex-fuel, and anything
// with fewer than a handful of registrations (one-offs and typos).

import { writeFileSync } from "node:fs";

const PULLS: { table: "co2cars" | "co2vans"; segment: "car" | "van"; country: string; years: number[]; minRegs: number }[] = [
  { table: "co2cars", segment: "car", country: "GB", years: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020], minRegs: 5 },
  { table: "co2vans", segment: "van", country: "GB", years: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020], minRegs: 3 },
  { table: "co2cars", segment: "car", country: "IE", years: [2021, 2022], minRegs: 3 },
  { table: "co2vans", segment: "van", country: "IE", years: [2021, 2022], minRegs: 2 },
];
const KEEP_TOTAL: Record<"car" | "van", number> = { car: 20, van: 10 };

interface Raw { Mk: string; Cn: string; Ft: string; Fm: string | null; ec: number | null; regs: number; wltp: number | null; nedc: number | null }

async function query(sql: string): Promise<Raw[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://discodata.eea.europa.eu/sql?query=${encodeURIComponent(sql)}`, { signal: AbortSignal.timeout(240_000) });
    if (res.ok) return (await res.json()).results as Raw[];
    console.warn(`  attempt ${attempt}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error("EEA query failed");
}

function pullSql(table: string, country: string, year: number, minRegs: number) {
  // NEDC is "Enedc" from 2017 and "E" before it; vans used "E" throughout the early years.
  const nedc = `COALESCE([Enedc (g/km)], [E (g/km)])`;
  return `SELECT Mk, Cn, UPPER(Ft) AS Ft, Fm, [Ec (cm3)] AS ec, SUM(R) AS regs,
    SUM(R * [Ewltp (g/km)]) / NULLIF(SUM(CASE WHEN [Ewltp (g/km)] IS NULL THEN 0 ELSE R END), 0) AS wltp,
    SUM(R * ${nedc}) / NULLIF(SUM(CASE WHEN ${nedc} IS NULL THEN 0 ELSE R END), 0) AS nedc
  FROM [CO2Emission].[latest].[${table}]
  WHERE MS = '${country}' AND Year = ${year} AND UPPER(Ft) IN ('PETROL', 'DIESEL', 'PETROL/ELECTRIC', 'DIESEL/ELECTRIC')
  GROUP BY Mk, Cn, UPPER(Ft), Fm, [Ec (cm3)]
  HAVING SUM(R) >= ${minRegs}`;
}

// ─── Tidying names ─────────────────────────────────────────────────────────

const MAKE_ALIASES: Record<string, string> = {
  "MERCEDES": "Mercedes-Benz", "MERCEDES-BENZ": "Mercedes-Benz", "MERCEDES BENZ": "Mercedes-Benz", "MERCEDES-AMG": "Mercedes-Benz",
  "VW": "Volkswagen", "VOLKSWAGEN": "Volkswagen", "VOLKSWAGEN VW": "Volkswagen", "VOLKSWAGEN, VW": "Volkswagen",
  "CITROEN": "Citroën", "CITROËN": "Citroën", "DS": "DS", "LAND ROVER": "Land Rover", "LANDROVER": "Land Rover", "RANGE ROVER": "Land Rover",
  "ROLLS ROYCE": "Rolls-Royce", "ROLLS-ROYCE": "Rolls-Royce", "ALFA ROMEO": "Alfa Romeo", "ASTON MARTIN": "Aston Martin",
  "MINI": "MINI", "MG": "MG", "BMW": "BMW", "SEAT": "SEAT", "CUPRA": "Cupra", "SKODA": "Škoda", "ŠKODA": "Škoda", "KIA": "Kia",
  "SSANGYONG": "SsangYong", "LDV": "LDV", "MAN": "MAN", "IVECO": "Iveco", "ISUZU": "Isuzu",
  "DAIMLER": "Mercedes-Benz", "MCLAREN": "McLaren", "ISUZU TRUCKS": "Isuzu", "OPEL": "Vauxhall", "DFSK": "DFSK", "MAXUS": "Maxus",
};
/** Makers whose names come through in more than one form. */
const MAKE_PREFIXES: [RegExp, string][] = [[/^MITSUBISHI MOTORS/, "Mitsubishi"], [/^MITSUBISHI FUSO|^FUSO/, "Fuso"], [/^RENAULT TRUCKS/, "Renault Trucks"]];
/**
 * Not something a customer would be trading in: bodybuilders, conversions
 * recorded under their own name, and records with no make.
 */
const DROP_MAKES = new Set(["Unknown", "Other British", "Paneltex", "Gray & Adams", "Renault Trucks", "Fuso", "Other", "Not Known"]);
const DROP_MODELS = /^(UNKNOWN|NOT KNOWN|N\/A|TBC)$/i;
/** Wheelchair-accessible conversions recorded under the converter's name. */
const DROP_FAMILIES = new Set(["Allied", "Freedom", "Independence", "Journey", "Premier", "Eurobus", "Eurotaxi", "E7"]);
/** Official CO2 below this is a plug-in hybrid recorded without its plug-in flag. */
const MIN_CO2 = 70;
/** A model family needs this many registrations, or it's a clipped name or a one-off. */
const MIN_FAMILY_REGS = 100;
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const canonicalMake = (mk: string) => {
  const k = mk.trim().replace(/\s+/g, " ").toUpperCase();
  for (const [re, name] of MAKE_PREFIXES) if (re.test(k)) return name;
  return MAKE_ALIASES[k] ?? titleCase(k);
};
const tidy = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** The model family a commercial name belongs to: the Model drop-down. */
function modelOf(make: string, cn: string): string {
  const w = cn.split(" ");
  const [a, b, c] = w;
  // Clipped names in the source: TRAN, TRANSIT140, TRCON.
  if (make === "Ford" && /^TRCON/.test(a)) return "Transit Connect";
  if (make === "Ford" && /^TRAN(SIT)?\d*$/.test(a) && !["CUSTOM", "CONNECT", "COURIER"].includes(b)) return "Transit";
  if (make === "Ford" && (a === "TRANSIT" || a === "TRAN" || a === "TOURNEO") && ["CUSTOM", "CONNECT", "COURIER"].includes(b)) return `${a === "TOURNEO" ? "Tourneo" : "Transit"} ${titleCase(b)}`;
  if (make === "Ford" && a === "GRAND" && b) return `Grand ${b === "C-MAX" ? "C-MAX" : titleCase(b)}`;
  if (make === "Land Rover") {
    if (a === "RANGE" && b === "ROVER") return ["EVOQUE", "VELAR", "SPORT"].includes(c) ? `Range Rover ${titleCase(c)}` : "Range Rover";
    if (a === "DISCOVERY" && b === "SPORT") return "Discovery Sport";
  }
  if (make === "BMW") {
    const m = a.match(/^(\d)\d\d/);
    if (m) return `${m[1]} Series`;
    if (/^[XMZI]\d/.test(a)) return a;
  }
  if (make === "Mercedes-Benz" && /^(A|B|C|E|S|V|G|X|CLA|CLS|GLA|GLB|GLC|GLE|GLS|SL|SLC|SLK|CLK|ML|GL)$/.test(a)) return `${a}-Class`;
  if (b === "X" && /^(GRANDLAND|CROSSLAND|MOKKA)$/.test(a)) return `${titleCase(a)} X`;
  if (/^[A-Z]+$/.test(a)) return a.length <= 3 ? a : titleCase(a);
  return a; // numbers and codes as given: 208, C-HR, RAV4, CX-5
}

// ─── Build ─────────────────────────────────────────────────────────────────

interface Agg { segment: "car" | "van"; make: string; model: string; name: string; fuel: "petrol" | "diesel"; hybrid: boolean; litres: number | null; years: Set<number>; regs: number; wltpSum: number; wltpRegs: number; nedcSum: number; nedcRegs: number }

async function main() {
  const all = new Map<string, Agg>();
  for (const p of PULLS) {
    for (const year of p.years) {
      process.stdout.write(`${p.table} ${p.country} ${year} … `);
      const rows = await query(pullSql(p.table, p.country, year, p.minRegs));
      console.log(rows.length);
      for (const r of rows) {
        if (!r.Mk || !r.Cn) continue;
        const fm = (r.Fm ?? "").toUpperCase();
        if (fm === "P") continue; // plug-in hybrid
        const ft = r.Ft.toUpperCase();
        const fuel = ft.startsWith("DIESEL") ? "diesel" : "petrol";
        const hybrid = ft.includes("ELECTRIC") || fm === "H";
        const make = canonicalMake(r.Mk);
        const name = tidy(r.Cn);
        const litres = r.ec ? Math.round(r.ec / 100) / 10 : null;
        const key = [p.segment, make, name, fuel, hybrid, litres].join("|");
        const a = all.get(key) ?? { segment: p.segment, make, model: modelOf(make, name), name, fuel, hybrid, litres, years: new Set(), regs: 0, wltpSum: 0, wltpRegs: 0, nedcSum: 0, nedcRegs: 0 } as Agg;
        a.years.add(year);
        a.regs += r.regs;
        if (r.wltp && r.wltp > 40 && r.wltp < 450) { a.wltpSum += r.wltp * r.regs; a.wltpRegs += r.regs; }
        if (r.nedc && r.nedc > 40 && r.nedc < 450) { a.nedcSum += r.nedc * r.regs; a.nedcRegs += r.regs; }
        all.set(key, a);
      }
    }
  }

  // [segment, makeIdx, model, name, fuel+hybrid, litres, yearFrom, yearTo, co2, cycle, regs]
  const co2Of = (a: Agg) => (a.wltpRegs > 0 ? a.wltpSum / a.wltpRegs : a.nedcRegs > 0 ? a.nedcSum / a.nedcRegs : 0);
  const familyRegs = new Map<string, number>();
  for (const a of all.values()) familyRegs.set(`${a.segment}|${a.make}|${a.model}`, (familyRegs.get(`${a.segment}|${a.make}|${a.model}`) ?? 0) + a.regs);
  const kept = [...all.values()].filter((a) =>
    a.regs >= KEEP_TOTAL[a.segment]
    && co2Of(a) >= MIN_CO2
    && !DROP_MAKES.has(a.make)
    && !DROP_MODELS.test(a.model)
    && !DROP_FAMILIES.has(a.model)
    && (familyRegs.get(`${a.segment}|${a.make}|${a.model}`) ?? 0) >= MIN_FAMILY_REGS);
  const makes = [...new Set(kept.map((a) => a.make))].sort();
  const makeIdx = new Map(makes.map((m, i) => [m, i]));
  kept.sort((x, y) => x.make.localeCompare(y.make) || x.model.localeCompare(y.model) || x.name.localeCompare(y.name));
  const rows = kept.map((a) => {
    const wltp = a.wltpRegs > 0 ? a.wltpSum / a.wltpRegs : null;
    const co2 = wltp ?? a.nedcSum / a.nedcRegs;
    const ys = [...a.years].sort();
    return [a.segment === "car" ? 0 : 1, makeIdx.get(a.make)!, a.model, a.name, (a.fuel === "diesel" ? 1 : 0) + (a.hybrid ? 2 : 0), a.litres, ys[0], ys[ys.length - 1], Math.round(co2 * 10) / 10, wltp != null ? 1 : 0, a.regs];
  });
  const out = {
    source: "European Environment Agency CO2 monitoring data for new cars and vans (UK 2012 to 2020, Ireland 2021 to 2022). Official type-approval CO2, with MPG worked back by carbon balance.",
    built: new Date().toISOString().slice(0, 10),
    columns: ["segment(0 car,1 van)", "make", "model", "name", "fuel(0 petrol,1 diesel,+2 hybrid)", "litres", "yearFrom", "yearTo", "co2", "wltp(1)/nedc(0)", "registrations"],
    makes,
    rows,
  };
  writeFileSync("public/fuel-reference.json", JSON.stringify(out));
  console.log(`\n${rows.length} vehicles, ${makes.length} makes: cars ${rows.filter((r) => r[0] === 0).length}, vans ${rows.filter((r) => r[0] === 1).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
