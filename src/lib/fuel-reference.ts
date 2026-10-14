// Fuel Cost Calculator: the make, model and version list for a customer's
// current petrol or diesel car or van. Built by scripts/build-fuel-reference.ts
// from the European Environment Agency's CO2 monitoring data (UK 2012 to 2020,
// Ireland 2021 to 2022) into public/fuel-reference.json, loaded by the page
// when it opens. Client-safe.
//
// MPG comes from the official type-approval CO2 by carbon balance, the way
// the official MPG is calculated (mpgFromCo2).

import { mpgFromCo2, type FuelType, type Segment, type TestCycle } from "./fuel-calc";

export interface ReferenceFile {
  source: string;
  built: string;
  makes: string[];
  /** [segment 0 car 1 van, makeIdx, model, name, fuel (0 petrol 1 diesel, +2 hybrid), litres, yearFrom, yearTo, co2, wltp 1 or nedc 0, registrations] */
  rows: [number, number, string, string, number, number | null, number, number, number, number, number][];
}

export interface RefVehicle {
  id: string;
  segment: Segment;
  make: string;
  model: string;
  /** The version as sold, tidied: "Golf Life 1.5 TSI EVO". */
  version: string;
  fuel: FuelType;
  hybrid: boolean;
  litres: number | null;
  yearFrom: number;
  yearTo: number;
  co2: number;
  cycle: TestCycle;
  mpg: number;
  registrations: number;
  /** Lower-case text the search matches against. */
  haystack: string;
}

// Words written as their makers write them. Anything not here is title-cased,
// except short all-capital tokens and codes with digits, which stay as given.
const SPELLINGS: Record<string, string> = {
  ECOBLUE: "EcoBlue", ECOBOOST: "EcoBoost", ECONETIC: "ECOnetic", ECOFLEX: "Ecoflex", BLUEMOTION: "BlueMotion", BLUEHDI: "BlueHDi",
  PURETECH: "PureTech", BLUEDCI: "Blue dCi", DCI: "dCi", TCE: "TCe", HDI: "HDi", ETSI: "eTSI", TFSI: "TFSI", TSI: "TSI", TDI: "TDI",
  CDI: "CDI", CRDI: "CRDi", CRDI4: "CRDi", GDI: "GDi", TGDI: "T-GDi", "T-GDI": "T-GDi", MHEV: "mHEV", HEV: "HEV", PHEV: "PHEV", FHEV: "FHEV",
  "ST-LINE": "ST-Line", "M-SPORT": "M Sport", XDRIVE: "xDrive", SDRIVE: "sDrive", "4MATIC": "4MATIC", QUATTRO: "quattro", "4MOTION": "4MOTION",
  SKYACTIV: "Skyactiv", "SKYACTIV-G": "Skyactiv-G", "SKYACTIV-D": "Skyactiv-D", "SKYACTIV-X": "Skyactiv-X", VTEC: "VTEC", "I-VTEC": "i-VTEC",
  "I-DTEC": "i-DTEC", "D-4D": "D-4D", VVT: "VVT", "VVT-I": "VVT-i", AUTO: "Auto", MANUAL: "Manual", DSG: "DSG", CVT: "CVT", DCT: "DCT",
  AWD: "AWD", FWD: "FWD", RWD: "RWD", "4WD": "4WD", "4X4": "4x4", "4X2": "4x2", LWB: "LWB", SWB: "SWB", MWB: "MWB", DCIV: "DCiV",
  CREWCAB: "Crew Cab", DCAB: "Double Cab", "D/CAB": "Double Cab", "DBL": "Double", MS: "MS", "MS-RT": "MS-RT", AMG: "AMG", GTI: "GTI",
  GTD: "GTD", GTE: "GTE", ST: "ST", RS: "RS", SE: "SE", SEL: "SEL", GT: "GT", XLT: "XLT", XL: "XL", JCW: "JCW", SRI: "SRi", SXI: "SXi",
  EVO: "EVO", TECH: "Tech", NAV: "Nav", "N-CONNECTA": "N-Connecta", "N-DESIGN": "N-Design", "R-LINE": "R-Line", "S-LINE": "S line",
};

function prettyToken(t: string): string {
  if (SPELLINGS[t]) return SPELLINGS[t];
  if (/^\d{3}[DI]$/.test(t)) return t.slice(0, 3) + t[3].toLowerCase(); // BMW 320d, 118i
  if (/\d/.test(t)) return t; // codes: 2.0, 320L2, 130PS
  if (t.length <= 3) return t; // SE, GT, RS, VW
  if (t.includes("-")) return t.split("-").map(prettyToken).join("-");
  return t.charAt(0) + t.slice(1).toLowerCase();
}

/** "GOLF LIFE TSI EVO" → "Golf Life TSI EVO"; "KUGA ST-LINE ED EBLUE MHEV" → "Kuga ST-Line ED Eblue mHEV". */
export function prettyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").split(" ").map(prettyToken).join(" ");
}

export function decodeReference(file: ReferenceFile): RefVehicle[] {
  return file.rows.map((r, i) => {
    const [seg, mk, model, name, fuelCode, litres, yearFrom, yearTo, co2, wltp, regs] = r;
    const fuel: FuelType = fuelCode % 2 === 1 ? "diesel" : "petrol";
    const cycle: TestCycle = wltp === 1 ? "wltp" : "nedc";
    const make = file.makes[mk];
    const version = prettyName(name);
    return {
      id: `ref-${i}`,
      segment: seg === 1 ? "van" : "car",
      make,
      model,
      version,
      fuel,
      hybrid: fuelCode >= 2,
      litres,
      yearFrom,
      yearTo,
      co2,
      cycle,
      mpg: Math.round((mpgFromCo2(co2, fuel, cycle) ?? 0) * 10) / 10,
      registrations: regs,
      // Engine as people say it: "2.0" and "1.5", never "2".
      haystack: `${make} ${model} ${version} ${litres != null ? litres.toFixed(1) : ""} ${fuel}${fuelCode >= 2 ? " hybrid" : ""} ${yearFrom} ${yearTo}`.toLowerCase(),
    };
  });
}

/** "2019 to 2021", or one year. */
export const yearsLabel = (v: Pick<RefVehicle, "yearFrom" | "yearTo">) => (v.yearFrom === v.yearTo ? String(v.yearFrom) : `${v.yearFrom} to ${v.yearTo}`);

/**
 * Every word typed must appear; the commonest vehicles come first. A year
 * typed ("2019") matches the vehicles registered across it.
 */
export function searchReference(list: readonly RefVehicle[], query: string, segment: Segment, limit = 40): RefVehicle[] {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const out: RefVehicle[] = [];
  for (const v of list) {
    if (v.segment !== segment) continue;
    const ok = words.every((w) => {
      if (/^(19|20)\d\d$/.test(w)) { const y = Number(w); return y >= v.yearFrom && y <= v.yearTo; }
      return v.haystack.includes(w);
    });
    if (ok) out.push(v);
  }
  return out.sort((a, b) => b.registrations - a.registrations).slice(0, limit);
}
