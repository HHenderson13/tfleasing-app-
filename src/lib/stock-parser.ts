import "server-only";
import * as XLSX from "xlsx";
import officecrypto from "officecrypto-tool";

export interface ParsedStockVehicle {
  vin: string | null; // may be missing — order-number match still works for awaiting-delivery
  modelRaw: string | null;
  modelYear: string | null;
  bodyStyle: string | null;
  seriesRaw: string | null;
  derivativeRaw: string | null; // WERS_SUB_SERIES_DESC — e.g. "SPORT", "LIMITED/TITANIUM", "TREND" for vans
  engine: string | null;
  transmission: string | null;
  drive: string | null;
  colourRaw: string | null;
  options: string[];
  orderNo: string | null;
  locationStatus: string | null;
  gateReleaseAt: Date | null;
  etaAt: Date | null;
  dealerRaw: string | null;
  destinationRaw: string | null;
  deliveredAt: Date | null;       // input col AO
  interestBearingAt: Date | null; // input col AQ
  adoptedAt: Date | null;         // input col AR (overrides interest-bearing)
  customerAssigned: boolean;       // true when row should be excluded from /stock — customer/fleet assigned, excluded branch, or model not in our bucket list. Kept in DB for awaiting-delivery VIN/order matching.
  sourceSheet: string | null; // model bucket e.g. "Puma" — null when model isn't one we sell
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  return s || null;
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Excel column letter → zero-based index. "A"=0, "B"=1, ..., "AA"=26, "BM"=64.
function col(letter: string): number {
  let n = 0;
  for (const c of letter) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// -------------------------------------------------------------
// Lookups ported from the VBA macro
// -------------------------------------------------------------

// Branch code → "CODE (Location)" friendly string. (FormatBranchCode)
const BRANCH_CODES: Record<string, string> = {
  "41412": "Edgware", "42229": "Stains", "42386": "Dagenham", "48488": "Epsom / Wimbledon",
  "62133": "Manchester", "63360": "Huddersfield", "64290": "Barnsley", "66340": "Carlisle",
  "69183": "Castleford", "81125": "Bristol Cribbs", "82214": "Birmingham", "91680": "Glasgow",
  "92638": "Aberdeen", "97701": "Fleet Bristol", "97708": "Fleet Manchester", "97715": "Fleet Barnsley",
  "41413": "Edgware", "42413": "Dagenham", "43814": "Heathrow", "48489": "Epsom",
  "62134": "Stockport", "63361": "Huddersfield", "64293": "Barnsley", "66341": "Carlisle",
  "69184": "Castleford", "81126": "Bristol", "82213": "Birmingham", "91681": "Glasgow",
  "92639": "Aberdeen", "97702": "Fleet Bristol", "97709": "Fleet Manchester", "97714": "Fleet Barnsley",
  "97726": "Fleet Dagenham", "97725": "Fleet Dagenham", "86492": "Spellbound",
  "97721": "Fleet Epsom", "97728": "Fleet Scotland", "97729": "Fleet Aberdeen", "97706": "Fleet Birmingham",
};

// Site code → friendly site name. (FormatSiteCode)
const SITE_CODES: Record<string, string> = {
  "000": "Dagenham Site", "019": "Apex", "042": "Huddersfield Site", "0ET": "Carlisle Site",
  "127": "Epsom Site", "2FF": "Steer", "335": "Barnsley Site", "369": "Bristol Site",
  "380": "Trowbridge Site", "3FD": "VFS North", "3LW": "Aberdeen Site", "472": "Castleford Site",
  "510": "Chequers Lane", "5EB": "Transit GT", "655": "Weston Site", "6LJ": "Allied Glasgow",
  "681": "Belfast Site", "705": "Craigavon Site", "706": "Ballymena Site", "707": "Coleraine Site",
  "710": "Lisburn Site", "702": "Mallusk Site", "8ET": "BCA Corby", "8NS": "Staines",
  "A14": "BCA Kent", "B10": "VFS South", "BA8": "Bristol Site", "C19": "Edgware Site",
  "CA1": "Carlisle Site", "CB3": "Stockport Site", "G52": "Glasgow Site", "H29": "Dagenham Site",
  "H31": "Speke", "HF2": "Birmingham Site", "LN3": "Lincoln Commercial Bodies",
  "LTC": "Edgware Site", "MA1": "Cribbs Site", "OT1": "Long Marston", "PA5": "BCA Thurleigh",
  "PM1": "TVL", "SK9": "Wilmslow Site", "SN8": "Shepperton", "ST8": "A1 Automotive",
  "SW1": "Wimbledon Site", "TW2": "Heathrow Site",
};

function formatBranchCode(code: string | null): string | null {
  if (!code) return null;
  const name = BRANCH_CODES[code];
  return name ? `${code} (${name})` : code;
}

function formatSiteCode(code: string | null): string | null {
  if (!code) return null;
  const name = SITE_CODES[code];
  return name ? `${code} (${name})` : code;
}

// Model → per-sheet bucket.  (GetSheetForModel)
function sheetForModel(modelUpper: string): string | null {
  switch (modelUpper) {
    case "CAPRI": return "Capri";
    case "EXPLORER": return "Explorer";
    case "FOCUS": return "Focus";
    case "KUGA": return "Kuga";
    case "MACH-E": return "Mustang Mach-E";
    case "MUSTANG S650": return "Mustang";
    case "PUMA": return "Puma";
    case "PUMA EV": return "Puma Gen-E";
    case "RANGER":
    case "RANGER RAPTOR": return "Ranger";
    case "TRANSIT CONNECT": return "Transit Connect";
    case "TRANSIT COURIER":
    case "TRANSIT COURIER V769": return "Transit Courier";
    case "TRANSIT CUSTOM": return "Transit Custom";
    default: return null;
  }
}

// Branch codes to exclude entirely (macro deletes these rows).
const EXCLUDED_BRANCH_CODES = new Set(["93662", "81827", "86630", "81828", "97718", "97717", "93383", "86492"]);

// Partial (substring) replacements, case-insensitive — applied to specific fields per model bucket.
// Ported from the Tidy_Up_* macros.
type Replacement = { find: string; replace: string; whole?: boolean };

const MODEL_REPLACEMENTS: Record<string, string> = {
  "PUMA EV": "PUMA GEN-E",
  "RANGER RAPTOR": "RANGER",
  "MUSTANG S650": "MUSTANG",
};

const SERIES_REPLACEMENTS: Record<string, Replacement[]> = {
  Ranger: [{ find: "RAPTOR SERIES", replace: "RAPTOR" }],
};

const BODY_STYLE_REPLACEMENTS: Record<string, Replacement[]> = {
  Focus: [
    { find: "5 DOOR SEDAN-6 LITE", replace: "HATCHBACK" },
    { find: "4 DOOR STATION WAGON", replace: "ESTATE" },
  ],
  Mustang: [
    { find: "2 DOOR CONVERTIBLE", replace: "CONVERTIBLE" },
    { find: "2 DOOR COUPE-4 LITE", replace: "COUPE" },
  ],
  Ranger: [{ find: "DOUBLE CAB (CREW CAB)", replace: "DOUBLE CAB" }],
};

const ENGINE_REPLACEMENTS: Record<string, Replacement[]> = {
  Focus: [
    { find: "1.0L FOX E", replace: "1.0L ECOBOOST 125PS" },
    { find: "1.0L TC GAS NEW FOX C", replace: "1.0L ECOBOOST 155PS" },
    { find: "2.3L 4V TIVCT DI TC 270 HP GAS", replace: "2.3L ECOBOOST 280PS" },
  ],
  Puma: [
    { find: "1.0L FOX D", replace: "1.0L ECOBOOST 170PS" },
    { find: "1.0L TC GAS NEW FOX B", replace: "1.0L ECOBOOST 125PS" },
    { find: "1.0L 12V DI TC I3 GAS FOX UPG 155PS", replace: "1.0L ECOBOOST 155PS" },
  ],
  Kuga: [
    { find: "1.5L DRAGON MANUAL", replace: "1.5L ECOBOOST" },
    { find: "CVT AUTO HF45 PHEV/FHEV", replace: "2.5L FHEV 180PS" },
    { find: "CVT AUTO HF55 PHEV/FHEV", replace: "2.5L PHEV 243PS" },
  ],
  Mustang: [
    { find: "MOD 5.0L-4V DOHC SEFI NA", replace: "5.0L V8" },
    { find: "MOD 5.0L-4V DOHC EFI NA GAS", replace: "5.0L V8" },
  ],
  Explorer: [
    { find: "ELECTRIC MOTOR #1", replace: "STANDARD RANGE RWD 170PS" },
    { find: "ELECTRIC MOTOR #2", replace: "EXTENDED RANGE RWD 286PS" },
    { find: "ELECTRIC MOTOR #3", replace: "EXTENDED RANGE AWD 340PS" },
  ],
  Capri: [
    { find: "STANDARD RANGE RWD", replace: "STANDARD RANGE RWD 170PS" },
    { find: "EXTENDED RANGE RWD", replace: "EXTENDED RANGE RWD 286PS" },
    { find: "EXTENDED RANGE AWD", replace: "EXTENDED RANGE AWD 340PS" },
  ],
  "Mustang Mach-E": [
    { find: "GT", replace: "EXTENDED RANGE AWD" },
    { find: "ELECTRIC MOTOR #8", replace: "STANDARD RANGE RWD" },
  ],
  Ranger: [
    { find: "2.0L CR TC DSL PANTHER C", replace: "2.0L ECOBLUE 205PS" },
    { find: "2.0L CR TC DSL PANTHER J", replace: "2.0L ECOBLUE 170PS" },
    { find: "2.3L I4 GTDI DURATEC", replace: "2.3L ECOBOOST 281PS PHEV" },
    { find: "3.0L 4V DOHC V6 TC DSL-LION B", replace: "3.0L ECOBLUE V6 240PS" },
    { find: "3.0L", replace: "3.0L ECOBOOST V6 292PS", whole: true },
  ],
};

const TRANSMISSION_REPLACEMENTS: Record<string, Replacement[]> = {
  Focus: [{ find: "7 SPD DCT AUTO/MAN TRANS", replace: "7 SPEED AUTO" }],
  Puma: [{ find: "7 SPD DCT AUTO/MAN TRANS", replace: "7 SPEED AUTO" }],
  Kuga: [
    { find: "6 SPD MAN TRANS GFT B6 PLUS", replace: "MANUAL" },
    { find: "CVT AUTO HF45 PHEV/FHEV", replace: "AUTO" },
    { find: "CVT AUTO HF55 PHEV/FHEV", replace: "AUTO" },
  ],
  Mustang: [
    { find: "6 SPD MAN TRANS-3160", replace: "MANUAL" },
    { find: "6 SPD MAN TRANS-MT82", replace: "MANUAL" },
    { find: "10 SPD AUTO TRANSMISSION-10R80", replace: "AUTO" },
  ],
  Explorer: [{ find: "1 SPD AUTO TRANS", replace: "AUTO" }],
  Capri: [{ find: "1 SPEED AUTO TRANSMISSION", replace: "AUTO" }],
  "Mustang Mach-E": [{ find: "1 SPD AUTO TRANS", replace: "AUTO" }],
  "Puma Gen-E": [{ find: "1 SPEED AUTOMATIC", replace: "AUTO" }],
  Ranger: [
    { find: "10 SPD AUTO TRANSMISSION-10R60", replace: "AUTO" },
    { find: "10 SPD AUTO TRANSMISSION-10R80", replace: "AUTO" },
    { find: "MOD HYBRD TRNAXLE-A10R80-MHT-X", replace: "AUTO" },
    { find: "6 SPD MAN TRANS-MT88", replace: "AUTO" },
  ],
};

const DRIVE_REPLACEMENTS: Record<string, Replacement[]> = {
  Kuga: [
    { find: "2 WHL R/H FRONT DRIVE", replace: "FWD" },
    { find: "4 WHL R/H PART TIME DRIVE", replace: "AWD" },
  ],
};

const COLOUR_REPLACEMENTS: Record<string, Replacement[]> = {
  Explorer: [
    { find: "ARCTIC BLUE 3C", replace: "ARCTIC BLUE" },
    { find: "AGATE BLACK METALLIC", replace: "AGATE BLACK" },
    { find: "LUCID RED TC/RED CARPET TC", replace: "LUCID RED" },
  ],
  Ranger: [
    { find: "AGATE BLACK METALLIC", replace: "AGATE BLACK" },
    { find: "CARBONIZED GRAY/ASHER GRAY", replace: "CARBONIZED GRAY" },
    { find: "ICONIC SILVER/SILVER RADIANCE", replace: "ICONIC SILVER" },
    { find: "LUCID RED TC/RED CARPET TC", replace: "LUCID RED" },
  ],
};

const OPTION_REPLACEMENTS: Record<string, Replacement[]> = {
  Focus: [
    { find: "MARKETING DESIGN EXT PACK #2", replace: "DESIGN PACK" },
    { find: "PARKING PACK #1", replace: "PARKING PACK" },
    { find: "MARKETING WINTER PACK #1", replace: "WINTER PACK" },
    { find: "POWER LIFTGATE W/HANDS FREE", replace: "POWER LIFTGATE" },
    { find: "ROOF CONVERSION-HI OPENING", replace: "PANORAMA ROOF" },
  ],
  Puma: [
    { find: "SOUND EDITION (ICE)", replace: "SOUND EDITION" },
    { find: "ST2 VERSION", replace: "ST" },
    { find: "SERIES 57", replace: "ST-LINE X" },
    { find: "19X7.5 ALLOY WHEEL STYLE B", replace: '19" UPGRADED ALLOYS' },
    { find: "DRIVER ASSISTANCE PACKAGE #6P", replace: "DRIVER ASSISTANCE PACKAGE" },
    { find: "MARKETING COMFORT PACK #2", replace: "COMFORT PACK" },
    { find: "MARKETING WINTER PACK #1", replace: "WINTER PACK" },
    { find: "RF CONV-PANORAMA PWR/OPEN", replace: "PANORAMA ROOF" },
  ],
  Kuga: [
    { find: "MARKETING TECHNOLOGY PACK #2", replace: "TECHNOLOGY PACK" },
    { find: "MARKETING WINTER PACK #1", replace: "WINTER PACK" },
    { find: "RF CONV-PANORAMA PWR/OPEN", replace: "PANORAMA ROOF" },
  ],
  "Puma Gen-E": [
    { find: "MARKETING WINTER PACK #1", replace: "WINTER PACK" },
    { find: "DRIVER ASSISTANCE PACKAGE #6P", replace: "DRIVER ASSISTANCE PACK" },
    { find: "MARKETING COMFORT PACK #2", replace: "COMFORT PACK" },
  ],
  Explorer: [
    { find: "AIR CONDITIONING #2", replace: "HEAT PUMP" },
    { find: "21 X 8.5 ALUMINUM WHL 21X9 RR", replace: 'UPGRADED 21" ALLOYS' },
    { find: "1ST AND 2ND ROW BEZELS (FOR DOG GUARD)", replace: "DOG GUARD BEZELS" },
  ],
  Capri: [
    { find: "ENERGY-EFFICIENT HEAT PUMP SYSTEM", replace: "HEAT PUMP" },
    { find: "21 INCH ALLOY WHEELS", replace: 'UPGRADED 21" ALLOYS' },
    { find: "1ST AND 2ND ROW BEZELS (FOR DOG GUARD)", replace: "DOG GUARD BEZELS" },
  ],
  Ranger: [
    { find: "ICE FEATURE PACK 106", replace: "B&O SOUND SYSTEM" },
    { find: "MARKETING CV PACK #3", replace: "POWER PACK" },
    { find: "VERSION PACK 13", replace: "" },
    { find: "VERSION PACK 14", replace: "" },
    { find: "VERSION PACK 15", replace: "" },
    { find: "WINTER PACK 1", replace: "WINTER PACK" },
  ],
};

function applyReplacements(value: string | null, rules: Replacement[] | undefined): string | null {
  if (!value || !rules) return value;
  let out = value;
  for (const r of rules) {
    if (r.whole) {
      if (out.toUpperCase() === r.find.toUpperCase()) out = r.replace;
    } else {
      // Case-insensitive substring replace (all occurrences).
      const re = new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, r.replace);
    }
  }
  return out.trim() || null;
}

function looksEncrypted(buffer: Buffer): boolean {
  // OLE compound file header (D0 CF 11 E0 A1 B1 1A E1) — used by encrypted OOXML containers.
  if (buffer.length >= 8 &&
      buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1) {
    return true;
  }
  try { return Boolean(officecrypto.isEncrypted(buffer)); } catch { return false; }
}

async function readWorkbook(buffer: Buffer, password: string): Promise<XLSX.WorkBook> {
  if (looksEncrypted(buffer)) {
    let decrypted: Buffer;
    try {
      decrypted = await officecrypto.decrypt(buffer, { password });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Wrong password (tried "${password}"): ${msg}`);
    }
    return XLSX.read(decrypted, { cellDates: true });
  }
  try {
    return XLSX.read(buffer, { cellDates: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/password|encrypt/i.test(msg)) {
      const decrypted = await officecrypto.decrypt(buffer, { password });
      return XLSX.read(decrypted, { cellDates: true });
    }
    throw e;
  }
}

function headerIndex(headers: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = String(h ?? "").trim().toUpperCase();
    if (key && idx[key] === undefined) idx[key] = i;
  });
  return idx;
}

// Best-effort fuzzy header lookup: strip non-alphanumerics and try contains-matches,
// so "DELIVERY DATE", "DEL_DATE", "DELIV_DATE" etc. all resolve to the same column.
function findHeaderIndex(headers: unknown[], needles: string[]): number | undefined {
  const norm = (s: string) => s.replace(/[^A-Z0-9]/g, "").toUpperCase();
  const normHeaders = headers.map((h) => norm(String(h ?? "")));
  for (const needle of needles) {
    const n = norm(needle);
    if (!n) continue;
    const exact = normHeaders.indexOf(n);
    if (exact >= 0) return exact;
  }
  for (const needle of needles) {
    const n = norm(needle);
    if (!n) continue;
    const part = normHeaders.findIndex((h) => h.includes(n));
    if (part >= 0) return part;
  }
  return undefined;
}

export async function parseStockWorkbook(buffer: Buffer, password: string): Promise<ParsedStockVehicle[]> {
  const wb = await readWorkbook(buffer, password);
  // Prefer a "Stock" tab (Ford Trust Report layout) with proper headers.
  // Fall back to "input" (Ford Leasing Stock Report) with fixed column letters.
  const stockName = wb.SheetNames.find((n) => n.toLowerCase() === "stock");
  const inputName = wb.SheetNames.find((n) => n.toLowerCase() === "input");
  if (stockName) return parseByHeaders(wb.Sheets[stockName]);
  if (inputName) return parseByFixedColumns(wb.Sheets[inputName]);
  throw new Error('No "Stock" or "input" tab found in workbook.');
}

function parseByHeaders(sheet: XLSX.WorkSheet): ParsedStockVehicle[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 2) return [];
  const headers = rows[0] ?? [];
  const h = headerIndex(headers);

  const pick = (row: unknown[], ...names: string[]) => {
    for (const n of names) {
      const i = h[n];
      if (i !== undefined) {
        const v = row[i];
        if (v !== null && v !== undefined && v !== "") return v;
      }
    }
    return null;
  };

  // Fuzzy lookups for less consistent date columns — same trick as pick() but tolerates header drift.
  const deliveredIdx  = findHeaderIndex(headers, ["DELIVERY_DATE", "DELIV_DATE", "DEL_DATE", "DELIVERED_DATE", "DELIVERY"]) ?? col("AO");
  const intBearingIdx = findHeaderIndex(headers, ["INTEREST_BEARING_DATE", "INT_BEARING_DATE", "INT_BEAR_DATE", "INTEREST_DATE", "INTEREST"]) ?? col("AQ");
  const adoptedIdx    = findHeaderIndex(headers, ["ADOPTED_DATE", "ADOPT_DATE", "ADOPTION_DATE", "ADOPTED"]) ?? col("AR");
  const pickIdx = (row: unknown[], i: number | undefined) => (i === undefined ? null : row[i] ?? null);

  // Options: every column whose header is WERS_OPTION_FEATURES_DESCR.
  const optionCols: number[] = [];
  (rows[0] ?? []).forEach((col, i) => {
    if (String(col ?? "").trim().toUpperCase() === "WERS_OPTION_FEATURES_DESCR") optionCols.push(i);
  });

  const out: ParsedStockVehicle[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const vin = toStr(pick(row, "VIN"));
    const orderNo = toStr(pick(row, "ORDER_NO"));
    if (!vin && !orderNo) continue; // no identifier — nothing we can match against
    if (vin) {
      if (seen.has(vin)) continue;
      seen.add(vin);
    }

    const branchRaw = toStr(pick(row, "DEALER"));
    const modelRawUpper = (toStr(pick(row, "WERS_MODEL_NAME")) ?? "").toUpperCase();
    const bucket = modelRawUpper ? sheetForModel(modelRawUpper) : null;

    // Out-of-scope for /stock if assigned to customer/fleet, on an excluded branch, or
    // a model we don't sell. Row still persisted so awaiting-delivery can match by VIN/order.
    const customerAssigned =
      !!(toStr(pick(row, "CUST1_SURNAME")) || toStr(pick(row, "FLEET_ID_NUMBER"))) ||
      (!!branchRaw && EXCLUDED_BRANCH_CODES.has(branchRaw)) ||
      !bucket;

    const statusRaw = toStr(pick(row, "LOCATION", "STATUS_TEXT"));
    const statusUpper = statusRaw ? statusRaw.toUpperCase() : null;
    const etaRaw = pick(row, "ETA_DATE");
    const eta = statusUpper === "DELIVERED" || statusUpper === "DEALER" ? null : toDate(etaRaw);

    const modelTidy = modelRawUpper ? (MODEL_REPLACEMENTS[modelRawUpper] ?? modelRawUpper) : null;

    const optRules = bucket ? OPTION_REPLACEMENTS[bucket] : undefined;
    const options: string[] = [];
    for (const i of optionCols) {
      const v = applyReplacements(toStr(row[i]), optRules);
      if (v) options.push(v);
    }

    out.push({
      vin,
      modelRaw: modelTidy,
      modelYear: toStr(pick(row, "WERS_MKT_MODEL_YEAR", "ANSWERS_MKT_MODEL_YEAR")),
      bodyStyle: applyReplacements(toStr(pick(row, "WERS_BODY_STYLE_DESC")), bucket ? BODY_STYLE_REPLACEMENTS[bucket] : undefined),
      seriesRaw: applyReplacements(toStr(pick(row, "WERS_SERIES_MKT_DESCRIPTION")), bucket ? SERIES_REPLACEMENTS[bucket] : undefined),
      derivativeRaw: toStr(pick(row, "WERS_SUB_SERIES_DESC")),
      engine: applyReplacements(
        // Kuga: use the emissions column (literal column S = index 18) — WERS_ENGINE_DESC isn't useful for display.
        bucket === "Kuga" ? toStr(row[col("S")]) : toStr(pick(row, "WERS_ENGINE_DESC")),
        bucket ? ENGINE_REPLACEMENTS[bucket] : undefined,
      ),
      transmission: applyReplacements(toStr(pick(row, "WERS_TRANSMISSION_DESC")), bucket ? TRANSMISSION_REPLACEMENTS[bucket] : undefined),
      drive: applyReplacements(toStr(pick(row, "WERS_DRIVE_DESC")), bucket ? DRIVE_REPLACEMENTS[bucket] : undefined),
      colourRaw: applyReplacements(toStr(pick(row, "WERS_COLOUR_DESCR")), bucket ? COLOUR_REPLACEMENTS[bucket] : undefined),
      options,
      orderNo,
      locationStatus: statusRaw,
      gateReleaseAt: toDate(pick(row, "GATE_REL_DATE")),
      etaAt: eta,
      dealerRaw: formatBranchCode(branchRaw),
      destinationRaw: formatSiteCode(toStr(pick(row, "DESTINATION"))),
      deliveredAt: toDate(pickIdx(row, deliveredIdx)),
      interestBearingAt: toDate(pickIdx(row, intBearingIdx)),
      adoptedAt: toDate(pickIdx(row, adoptedIdx)),
      customerAssigned,
      sourceSheet: bucket,
    });
  }
  return out;
}

function parseByFixedColumns(sheet: XLSX.WorkSheet): ParsedStockVehicle[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 2) return [];

  const C = {
    branch: col("B"),
    colH: col("H"),
    modelYear: col("K"),
    model: col("L"),
    bodyStyle: col("M"),
    series: col("O"),
    engine: col("P"),
    emissions: col("S"),
    transmission: col("Q"),
    drive: col("R"),
    colour: col("AA"),
    vin: col("AC"),
    orderNo: col("AF"),
    gateRelease: col("AK"),
    locationStatus: col("AX"),
    eta: col("BA"),
    deliveredDate: col("AO"),
    interestBearing: col("AQ"),
    adopted: col("AR"),
    site: col("BE"),
    optionsStart: col("BM"),
    optionsEnd: col("CI"),
  };

  const out: ParsedStockVehicle[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const vin = toStr(row[C.vin]);
    const orderNo = toStr(row[C.orderNo]);
    if (!vin && !orderNo) continue;
    if (vin) {
      if (seen.has(vin)) continue;
      seen.add(vin);
    }

    const branchRaw = toStr(row[C.branch]);
    const modelRawUpper = (toStr(row[C.model]) ?? "").toUpperCase();
    const bucket = modelRawUpper ? sheetForModel(modelRawUpper) : null;

    // Out-of-scope for /stock if customer/fleet-assigned (col H), excluded branch, or unknown model.
    // Row still persisted so awaiting-delivery can match by VIN/order.
    const customerAssigned =
      !!toStr(row[C.colH]) ||
      (!!branchRaw && EXCLUDED_BRANCH_CODES.has(branchRaw)) ||
      !bucket;

    const statusRaw = toStr(row[C.locationStatus]);
    const statusUpper = statusRaw ? statusRaw.toUpperCase() : null;
    const eta = statusUpper === "DELIVERED" || statusUpper === "DEALER" ? null : toDate(row[C.eta]);

    const modelTidy = modelRawUpper ? (MODEL_REPLACEMENTS[modelRawUpper] ?? modelRawUpper) : null;

    const optRules = bucket ? OPTION_REPLACEMENTS[bucket] : undefined;
    const options: string[] = [];
    for (let i = C.optionsStart; i <= C.optionsEnd; i++) {
      const v = applyReplacements(toStr(row[i]), optRules);
      if (v) options.push(v);
    }

    out.push({
      vin,
      modelRaw: modelTidy,
      modelYear: toStr(row[C.modelYear]),
      bodyStyle: applyReplacements(toStr(row[C.bodyStyle]), bucket ? BODY_STYLE_REPLACEMENTS[bucket] : undefined),
      seriesRaw: applyReplacements(toStr(row[C.series]), bucket ? SERIES_REPLACEMENTS[bucket] : undefined),
      derivativeRaw: null, // input-tab layout doesn't expose sub_series
      engine: applyReplacements(
        // Kuga: use emissions column (S) — the engine column (P) values aren't useful for display.
        toStr(row[bucket === "Kuga" ? C.emissions : C.engine]),
        bucket ? ENGINE_REPLACEMENTS[bucket] : undefined,
      ),
      transmission: applyReplacements(toStr(row[C.transmission]), bucket ? TRANSMISSION_REPLACEMENTS[bucket] : undefined),
      drive: applyReplacements(toStr(row[C.drive]), bucket ? DRIVE_REPLACEMENTS[bucket] : undefined),
      colourRaw: applyReplacements(toStr(row[C.colour]), bucket ? COLOUR_REPLACEMENTS[bucket] : undefined),
      options,
      orderNo,
      locationStatus: statusRaw,
      gateReleaseAt: toDate(row[C.gateRelease]),
      etaAt: eta,
      dealerRaw: formatBranchCode(branchRaw),
      destinationRaw: formatSiteCode(toStr(row[C.site])),
      deliveredAt: toDate(row[C.deliveredDate]),
      interestBearingAt: toDate(row[C.interestBearing]),
      adoptedAt: toDate(row[C.adopted]),
      customerAssigned,
      sourceSheet: bucket,
    });
  }

  return out;
}
