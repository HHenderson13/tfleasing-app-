// Fuel Cost Calculator: one list of petrol and diesel vehicles to pick the
// customer's current one from. Two sources, kept apart in what they claim:
//
//   The library (fuel_vehicles, edited on /fuel-calculator/admin): current
//   models with the maker's own WLTP figure. No registration years, so they
//   sit under "Current model" rather than under invented dates.
//
//   The reference (public/fuel-reference.json): every car and van registered
//   in the UK 2012 to 2020 and Ireland 2021 to 2022, MPG worked back from the
//   official CO2 (lib/fuel-reference.ts).
//
// Pure and client-safe, so the dropdowns are tested here and not in a browser.

import type { FuelType, Segment, TestCycle } from "./fuel-calc";
import type { RefVehicle } from "./fuel-reference";

export interface LibraryVehicle {
  id: string;
  powertrain: "ice" | "ev";
  segment: Segment;
  make: string;
  model: string;
  derivative: string;
  fuel: "petrol" | "diesel" | "electric";
  efficiency: number;
  source: string | null;
}

export interface PickVehicle {
  id: string;
  segment: Segment;
  make: string;
  model: string;
  version: string;
  fuel: FuelType;
  hybrid: boolean;
  litres: number | null;
  /** Null for a current model from the library. */
  yearFrom: number | null;
  yearTo: number | null;
  current: boolean;
  mpg: number;
  cycle: TestCycle;
  co2: number | null;
  registrations: number;
  /** Where the MPG came from, as printed on the PDF. */
  source: string;
  haystack: string;
}

const litresIn = (s: string) => {
  const m = s.match(/\b(\d\.\d)\s*L?\b/i);
  return m ? Number(m[1]) : null;
};

export function fromLibrary(v: LibraryVehicle): PickVehicle | null {
  if (v.powertrain !== "ice" || v.fuel === "electric") return null;
  const litres = litresIn(v.derivative);
  return {
    id: `lib-${v.id}`, segment: v.segment, make: v.make, model: v.model, version: v.derivative, fuel: v.fuel,
    hybrid: /\b(m?hev|hybrid)\b/i.test(v.derivative), litres, yearFrom: null, yearTo: null, current: true,
    mpg: v.efficiency, cycle: "wltp", co2: null, registrations: 0, source: v.source ?? "Manufacturer WLTP combined",
    haystack: `${v.make} ${v.model} ${v.derivative} ${litres != null ? litres.toFixed(1) : ""} ${v.fuel} current`.toLowerCase(),
  };
}

export function fromReference(v: RefVehicle): PickVehicle {
  return {
    id: v.id, segment: v.segment, make: v.make, model: v.model, version: v.version, fuel: v.fuel, hybrid: v.hybrid,
    litres: v.litres, yearFrom: v.yearFrom, yearTo: v.yearTo, current: false, mpg: v.mpg, cycle: v.cycle, co2: v.co2,
    registrations: v.registrations,
    source: `Official ${v.cycle.toUpperCase()} figure, from ${v.co2} g/km CO₂`,
    haystack: v.haystack,
  };
}

/** "2.0 diesel", "1.0 petrol hybrid", or just the fuel when the size isn't known. */
export function engineLabel(v: Pick<PickVehicle, "litres" | "fuel" | "hybrid">): string {
  return `${v.litres != null ? `${v.litres.toFixed(1)} ` : ""}${v.fuel}${v.hybrid ? " hybrid" : ""}`;
}

/** "2016 to 2017", "2019", or "Current model". */
export function yearsOf(v: Pick<PickVehicle, "yearFrom" | "yearTo" | "current">): string {
  if (v.current || v.yearFrom == null) return "Current model";
  return v.yearFrom === v.yearTo || v.yearTo == null ? String(v.yearFrom) : `${v.yearFrom} to ${v.yearTo}`;
}

export type YearChoice = "any" | "current" | `${number}`;

export interface PickFilter { segment: Segment; make?: string; model?: string; year?: YearChoice; engine?: string }

const byName = (a: string, b: string) => a.localeCompare(b, "en-GB", { sensitivity: "base" });

export function makesFor(list: readonly PickVehicle[], segment: Segment): string[] {
  return [...new Set(list.filter((v) => v.segment === segment).map((v) => v.make))].sort(byName);
}

export function modelsFor(list: readonly PickVehicle[], segment: Segment, make: string): string[] {
  return [...new Set(list.filter((v) => v.segment === segment && v.make === make).map((v) => v.model))].sort(byName);
}

const inModel = (list: readonly PickVehicle[], f: PickFilter) =>
  list.filter((v) => v.segment === f.segment && v.make === f.make && v.model === f.model);

const yearMatches = (v: PickVehicle, year: YearChoice | undefined) => {
  if (!year || year === "any") return true;
  if (year === "current") return v.current;
  const y = Number(year);
  return !v.current && v.yearFrom != null && y >= v.yearFrom && y <= (v.yearTo ?? v.yearFrom);
};

/** Newest first, with "current" leading when the library holds the model. */
export function yearsFor(list: readonly PickVehicle[], f: PickFilter): YearChoice[] {
  const rows = inModel(list, f);
  const years = new Set<number>();
  for (const v of rows) if (!v.current && v.yearFrom != null) for (let y = v.yearFrom; y <= (v.yearTo ?? v.yearFrom); y++) years.add(y);
  const out: YearChoice[] = rows.some((v) => v.current) ? ["current"] : [];
  return [...out, ...[...years].sort((a, b) => b - a).map((y) => String(y) as YearChoice)];
}

/** Engines for the model in the year chosen, smallest first. */
export function enginesFor(list: readonly PickVehicle[], f: PickFilter): string[] {
  const rows = inModel(list, f).filter((v) => yearMatches(v, f.year));
  const seen = new Map<string, PickVehicle>();
  for (const v of rows) seen.set(engineLabel(v), v);
  return [...seen.entries()]
    .sort(([a, x], [b, y]) => (x.litres ?? 99) - (y.litres ?? 99) || byName(a, b))
    .map(([label]) => label);
}

/**
 * The versions left once make, model, year and engine are set: current
 * models first, then newest, then by name.
 */
export function versionsFor(list: readonly PickVehicle[], f: PickFilter): PickVehicle[] {
  return inModel(list, f)
    .filter((v) => yearMatches(v, f.year) && (!f.engine || f.engine === "any" || engineLabel(v) === f.engine))
    .sort((a, b) => Number(b.current) - Number(a.current) || (b.yearTo ?? 0) - (a.yearTo ?? 0) || byName(a.version, b.version) || b.mpg - a.mpg);
}

/** The version to show before one is chosen: the one most often registered. */
export function likeliest(versions: readonly PickVehicle[]): PickVehicle | null {
  let best: PickVehicle | null = null;
  for (const v of versions) if (!best || v.registrations > best.registrations) best = v;
  return best;
}

/**
 * Every word typed must appear; a year ("2019") matches what was registered
 * across it. A year after the reference data ends can only be a current
 * model. Current models and the commonest vehicles come first.
 */
export function searchCatalogue(list: readonly PickVehicle[], query: string, segment: Segment, limit = 8): PickVehicle[] {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  let lastYear = 0;
  for (const v of list) if (!v.current && v.yearTo != null && v.yearTo > lastYear) lastYear = v.yearTo;
  const yearOk = (v: PickVehicle, y: number) => (v.current ? y > lastYear : yearMatches(v, String(y) as YearChoice));
  const out: PickVehicle[] = [];
  for (const v of list) {
    if (v.segment !== segment) continue;
    const ok = words.every((w) => (/^(19|20)\d\d$/.test(w) ? yearOk(v, Number(w)) : v.haystack.includes(w)));
    if (ok) out.push(v);
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current) || b.registrations - a.registrations).slice(0, limit);
}
