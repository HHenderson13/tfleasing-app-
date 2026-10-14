// Fuel Cost Calculator: reading each price out of its source. Pure, so the
// tests can pin every format; the fetching is in fuel-prices.ts. Each parser
// returns null when the source doesn't look as expected, and the stored
// price then stands (marked as not refreshed) rather than taking a guess.
//
//   Petrol, diesel    DESNZ weekly road fuel prices (CSV, every Monday)
//   Home daytime      Ofgem price cap, direct-debit electricity unit rate
//   Home overnight    Octopus Go off-peak rate (public API), GB average
//   Depot             DESNZ non-domestic electricity, "Small" consumers,
//                     incl. Climate Change Levy, ex VAT (quarterly)
//   Public rapid      Zapmap Price Index, Rapid / Ultra-rapid PAYG (monthly)

import * as XLSX from "xlsx";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ─── DESNZ weekly road fuel prices ─────────────────────────────────────────

/** The current-series CSV ("2018 to 2026") from the gov.uk content API record. */
export function desnzWeeklyCsvUrl(content: { details?: { attachments?: { title?: string; url?: string; content_type?: string }[] } }): string | null {
  const csvs = (content.details?.attachments ?? []).filter((a) => a.url && (a.content_type === "text/csv" || /\.csv$/i.test(a.url)));
  const current = csvs.find((a) => /2018/.test(a.title ?? "")) ?? csvs[0];
  return current?.url ?? null;
}

/** The latest week: date and pump prices (pence a litre, incl. VAT). */
export function parseDesnzWeeklyCsv(csv: string): { asOf: string; petrol: number; diesel: number } | null {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2 || !/ULSP/i.test(lines[0]) || !/ULSD/i.test(lines[0])) return null;
  for (let i = lines.length - 1; i > 0; i--) {
    const [date, petrol, diesel] = lines[i].split(",");
    const m = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const p = Number(petrol), d = Number(diesel);
    if (m && p > 50 && p < 400 && d > 50 && d < 400) return { asOf: `${m[3]}-${m[2]}-${m[1]}`, petrol: p, diesel: d };
  }
  return null;
}

// ─── Ofgem price cap ───────────────────────────────────────────────────────

/**
 * The electricity unit rate for the cap period covering `today` (or the
 * latest that has started). The page lists periods as headings, then
 * "Electricity <rate> pence per kWh <standing> pence daily standing charge"
 * once per period in the same order.
 */
export function parseOfgemCap(html: string, today: string): { value: number; period: string; asOf: string } | null {
  const t = text(html);
  const periods = [...t.matchAll(/Energy price cap per unit and standing charge (\d{1,2}) (\w+) to (\d{1,2}) (\w+) (\d{4})/g)]
    .map((m) => {
      const sm = MONTHS[m[2].toLowerCase()], em = MONTHS[m[4].toLowerCase()];
      if (!sm || !em) return null;
      const endYear = Number(m[5]);
      const startYear = sm > em ? endYear - 1 : endYear;
      return { label: `${m[1]} ${m[2]} to ${m[3]} ${m[4]} ${m[5]}`, start: `${startYear}-${String(sm).padStart(2, "0")}-${m[1].padStart(2, "0")}` };
    })
    .filter((p): p is { label: string; start: string } => !!p);
  const elec = t.match(/Electricity\s+((?:[\d.]+ pence per kWh [\d.]+ pence daily standing charge\s*)+)/);
  if (!periods.length || !elec) return null;
  const rates = [...elec[1].matchAll(/([\d.]+) pence per kWh/g)].map((m) => Number(m[1]));
  if (rates.length < periods.length) return null;
  let pick = 0;
  periods.forEach((p, i) => { if (p.start <= today) pick = i; });
  const value = rates[pick];
  if (!(value > 5 && value < 100)) return null;
  return { value, period: periods[pick].label, asOf: periods[pick].start };
}

// ─── Octopus Go off-peak ───────────────────────────────────────────────────

/** The off-peak (cheapest) rate in force now, from one region's standard unit rates. */
export function octopusOffPeak(rates: { value_inc_vat: number; valid_from: string; valid_to: string | null }[], nowIso: string): number | null {
  const now = Date.parse(nowIso);
  // The listed slots for the last couple of days: the night slot is the
  // cheapest of them. Bounded so an old promotional rate can't creep in.
  const recent = rates.filter((r) => Date.parse(r.valid_from) <= now + 86_400_000 && (!r.valid_to || Date.parse(r.valid_to) >= now - 2 * 86_400_000));
  const values = recent.map((r) => r.value_inc_vat).filter((v) => v > 0 && v < 100);
  return values.length ? Math.min(...values) : null;
}

/** GB regions in Octopus's tariff codes (A to P, no I or O). */
export const OCTOPUS_REGIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P"];

// ─── DESNZ non-domestic electricity ────────────────────────────────────────

/**
 * Latest quarter's "Electricity: Small" price, incl. Climate Change Levy, ex
 * VAT, table 3.4.2. Small is 20 to 499 MWh a year: a small business site,
 * which a depot charging a few vans usually is.
 */
export function parseDesnzNonDomestic(buf: ArrayBuffer | Buffer): { value: number; asOf: string; period: string } | null {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array" });
  const name = wb.SheetNames.find((n) => /3\.4\.2/.test(n) && !/annual/i.test(n));
  if (!name) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null });
  const header = rows.findIndex((r) => Array.isArray(r) && r.some((c) => /^Electricity: Small \(/i.test(String(c ?? ""))));
  if (header < 0) return null;
  const col = (rows[header] as unknown[]).findIndex((c) => /^Electricity: Small \(/i.test(String(c ?? "")));
  for (let i = rows.length - 1; i > header; i--) {
    const r = rows[i] as unknown[];
    const year = Number(String(r?.[0] ?? "").replace(/\D/g, "").slice(0, 4));
    const q = String(r?.[1] ?? "").match(/^(\d)/);
    const v = Number(r?.[col]);
    if (year > 2000 && q && v > 5 && v < 100) {
      const startMonth = (Number(q[1]) - 1) * 3 + 1;
      return { value: Math.round(v * 100) / 100, asOf: `${year}-${String(startMonth).padStart(2, "0")}-01`, period: `Q${q[1]} ${year}` };
    }
  }
  return null;
}

// ─── Zapmap Price Index ────────────────────────────────────────────────────

export function parseZapmap(html: string): { value: number; month: string; asOf: string } | null {
  const t = text(html);
  const m = t.match(/As of (\w+) (\d{4}), the weighted average PAYG price[^.]*?(\d+(?:\.\d+)?)p\/kWh for Standard[^.]*?(\d+(?:\.\d+)?)p\/kWh for Rapid and Ultra-rapid/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const value = Number(m[4]);
  if (!month || !(value > 20 && value < 200)) return null;
  return { value, month: `${m[1]} ${m[2]}`, asOf: `${m[2]}-${String(month).padStart(2, "0")}-01` };
}
