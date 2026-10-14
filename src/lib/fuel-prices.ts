import "server-only";

// Fuel Cost Calculator: prices and the vehicle library on the server.
// refreshFuelPrices() checks every source (daily, from /api/cron/fuel-prices,
// or "Check sources now" on the admin page). Each source stands alone: one
// failing keeps its last good price, marked with the error, and never blocks
// the others. A manager's override wins while it's set.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PriceKey } from "./fuel-calc";
import {
  OCTOPUS_REGIONS, desnzWeeklyCsvUrl, octopusOffPeak, parseDesnzNonDomestic, parseDesnzWeeklyCsv, parseOfgemCap, parseZapmap,
} from "./fuel-price-parsers";
import { fuelVehicleId } from "./fuel-vehicle-id";
import { logError } from "./logger";

const HEADERS = { "user-agent": "TF Leasing fuel cost calculator (daily price check)" };
const get = (url: string) => fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000), cache: "no-store" });

interface Fetched { key: PriceKey; value: number; asOf: string; period: string; source: string; sourceUrl: string }

const SOURCES: { name: string; keys: PriceKey[]; run: (today: string) => Promise<Fetched[] | null> }[] = [
  {
    name: "DESNZ weekly road fuel prices",
    keys: ["petrol", "diesel"],
    run: async () => {
      const page = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";
      const csvUrl = desnzWeeklyCsvUrl(await (await get("https://www.gov.uk/api/content/government/statistics/weekly-road-fuel-prices")).json());
      if (!csvUrl) return null;
      const r = parseDesnzWeeklyCsv(await (await get(csvUrl)).text());
      if (!r) return null;
      const period = `week of ${new Date(`${r.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}`;
      return [
        { key: "petrol", value: r.petrol, asOf: r.asOf, period, source: "DESNZ weekly road fuel prices", sourceUrl: page },
        { key: "diesel", value: r.diesel, asOf: r.asOf, period, source: "DESNZ weekly road fuel prices", sourceUrl: page },
      ];
    },
  },
  {
    name: "Ofgem energy price cap",
    keys: ["home_standard"],
    run: async (today) => {
      const url = "https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges";
      const r = parseOfgemCap(await (await get(url)).text(), today);
      return r ? [{ key: "home_standard", value: r.value, asOf: r.asOf, period: r.period, source: "Ofgem energy price cap", sourceUrl: url }] : null;
    },
  },
  {
    name: "Octopus Go",
    keys: ["home_overnight"],
    run: async (today) => {
      const product = "GO-VAR-22-10-14";
      const now = new Date().toISOString();
      const values = (await Promise.all(OCTOPUS_REGIONS.map(async (r) => {
        try {
          const res = await get(`https://api.octopus.energy/v1/products/${product}/electricity-tariffs/E-1R-${product}-${r}/standard-unit-rates/?page_size=10`);
          return octopusOffPeak((await res.json()).results ?? [], now);
        } catch { return null; }
      }))).filter((v): v is number => v != null);
      if (values.length < OCTOPUS_REGIONS.length / 2) return null; // too few regions to call it an average
      const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      const period = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
      return [{ key: "home_overnight", value: avg, asOf: today, period, source: "Octopus Go off-peak, GB average", sourceUrl: "https://octopus.energy/smart/go/" }];
    },
  },
  {
    name: "DESNZ non-domestic electricity",
    keys: ["depot"],
    run: async () => {
      const page = "https://www.gov.uk/government/statistical-data-sets/gas-and-electricity-prices-in-the-non-domestic-sector";
      const rec = await (await get("https://www.gov.uk/api/content/government/statistical-data-sets/gas-and-electricity-prices-in-the-non-domestic-sector")).json();
      const xlsx = (rec.details?.attachments ?? []).find((a: { url?: string }) => /table_341\.xlsx$/i.test(a.url ?? ""))?.url;
      if (!xlsx) return null;
      const r = parseDesnzNonDomestic(Buffer.from(await (await get(xlsx)).arrayBuffer()));
      return r ? [{ key: "depot", value: r.value, asOf: r.asOf, period: r.period, source: "DESNZ non-domestic electricity, small business (incl. CCL, ex VAT)", sourceUrl: page }] : null;
    },
  },
  {
    name: "Zapmap Price Index",
    keys: ["public_rapid"],
    run: async () => {
      const url = "https://www.zapmap.com/ev-stats/charging-price-index";
      const r = parseZapmap(await (await get(url)).text());
      return r ? [{ key: "public_rapid", value: r.value, asOf: r.asOf, period: r.month, source: "Zapmap Price Index, rapid / ultra-rapid PAYG", sourceUrl: url }] : null;
    },
  },
];

export interface RefreshReport { source: string; ok: boolean; changed: PriceKey[]; error?: string }

/** Check every source; store what's new. Safe to run as often as you like. */
export async function refreshFuelPrices(): Promise<RefreshReport[]> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const now = Math.floor(Date.now() / 1000);
  const reports: RefreshReport[] = [];
  for (const src of SOURCES) {
    try {
      const got = await src.run(today);
      if (!got) throw new Error("The source didn't look as expected, so the last good price is kept.");
      const changed: PriceKey[] = [];
      for (const f of got) {
        const [cur] = await db.all<{ value: number; as_of: string | null }>(sql`SELECT value, as_of FROM fuel_prices WHERE key = ${f.key}`);
        if (!cur || Number(cur.value) !== f.value || cur.as_of !== f.asOf) changed.push(f.key);
        await db.run(sql`
          INSERT INTO fuel_prices (key, value, as_of, period, source, source_url, fetched_at, checked_at, last_error)
          VALUES (${f.key}, ${f.value}, ${f.asOf}, ${f.period}, ${f.source}, ${f.sourceUrl}, ${now}, ${now}, NULL)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value, as_of = excluded.as_of, period = excluded.period, source = excluded.source,
            source_url = excluded.source_url, checked_at = excluded.checked_at, last_error = NULL,
            fetched_at = CASE WHEN fuel_prices.value = excluded.value AND fuel_prices.as_of IS excluded.as_of THEN fuel_prices.fetched_at ELSE excluded.fetched_at END
        `);
        await db.run(sql`INSERT OR REPLACE INTO fuel_price_history (key, as_of, value, fetched_at) VALUES (${f.key}, ${f.asOf}, ${f.value}, ${now})`);
      }
      reports.push({ source: src.name, ok: true, changed });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Check failed";
      logError("fuel-prices/refresh", e, { source: src.name });
      for (const key of src.keys) await db.run(sql`UPDATE fuel_prices SET last_error = ${message} WHERE key = ${key}`);
      reports.push({ source: src.name, ok: false, changed: [], error: message });
    }
  }
  return reports;
}

// ─── Reading ───────────────────────────────────────────────────────────────

/** How old a price can be before it's flagged, by how often its source publishes. */
const STALE_AFTER_DAYS: Record<PriceKey, number> = {
  petrol: 14, diesel: 14, home_overnight: 7, home_standard: 100, depot: 220, public_rapid: 70,
};

export interface FuelPrice {
  key: PriceKey;
  /** The figure in use: a manager's override while set, else the source's. */
  value: number;
  sourceValue: number;
  asOf: string | null;
  period: string | null;
  source: string;
  sourceUrl: string | null;
  checkedAt: string;
  lastError: string | null;
  override: { value: number; by: string | null; at: string | null } | null;
  stale: boolean;
}

export async function loadFuelPrices(): Promise<FuelPrice[]> {
  const rows = await db.all<{
    key: string; value: number; as_of: string | null; period: string | null; source: string; source_url: string | null;
    checked_at: number; last_error: string | null; override_value: number | null; override_by: string | null; override_at: number | null;
  }>(sql`SELECT key, value, as_of, period, source, source_url, checked_at, last_error, override_value, override_by, override_at FROM fuel_prices`);
  const today = Date.now();
  return rows.map((r) => {
    const key = r.key as PriceKey;
    const ageDays = r.as_of ? (today - Date.parse(`${r.as_of}T00:00:00Z`)) / 86_400_000 : Infinity;
    return {
      key,
      value: r.override_value != null ? Number(r.override_value) : Number(r.value),
      sourceValue: Number(r.value),
      asOf: r.as_of,
      period: r.period,
      source: r.source,
      sourceUrl: r.source_url,
      checkedAt: new Date(Number(r.checked_at) * 1000).toISOString(),
      lastError: r.last_error,
      override: r.override_value != null
        ? { value: Number(r.override_value), by: r.override_by, at: r.override_at ? new Date(Number(r.override_at) * 1000).toISOString() : null }
        : null,
      stale: r.override_value == null && ageDays > (STALE_AFTER_DAYS[key] ?? 30),
    };
  });
}

/** A manager's own figure for a price, or null to go back to the source. */
export async function setPriceOverride(key: PriceKey, value: number | null, by: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (value == null) await db.run(sql`UPDATE fuel_prices SET override_value = NULL, override_by = NULL, override_at = NULL WHERE key = ${key}`);
  else await db.run(sql`UPDATE fuel_prices SET override_value = ${value}, override_by = ${by}, override_at = ${now} WHERE key = ${key}`);
}

// ─── The vehicle library ───────────────────────────────────────────────────

export interface FuelVehicle {
  id: string;
  powertrain: "ice" | "ev";
  segment: "car" | "van";
  make: string;
  model: string;
  derivative: string;
  fuel: "petrol" | "diesel" | "electric";
  efficiency: number;
  source: string | null;
  /** Electric only, and only where the maker publishes them. */
  batteryKwh: number | null;
  rangeMiles: number | null;
  motorwayMiles: number | null;
  dcKw: number | null;
  dcMinutes: number | null;
}

const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

// Within a model, in the order they were added: the seed follows the price
// lists, which start each model at its entry trim.
export async function loadFuelVehicles(): Promise<FuelVehicle[]> {
  const rows = await db.all<{
    id: string; powertrain: string; segment: string; make: string; model: string; derivative: string; fuel: string; efficiency: number; source: string | null;
    battery_kwh: number | null; range_miles: number | null; range_motorway_miles: number | null; dc_kw: number | null; dc_minutes: number | null;
  }>(sql`
    SELECT id, powertrain, segment, make, model, derivative, fuel, efficiency, source, battery_kwh, range_miles, range_motorway_miles, dc_kw, dc_minutes
    FROM fuel_vehicles ORDER BY segment, make, model, rowid
  `);
  return rows.map((r) => ({
    id: r.id, powertrain: r.powertrain, segment: r.segment, make: r.make, model: r.model, derivative: r.derivative, fuel: r.fuel,
    efficiency: Number(r.efficiency), source: r.source,
    batteryKwh: numOrNull(r.battery_kwh), rangeMiles: numOrNull(r.range_miles), motorwayMiles: numOrNull(r.range_motorway_miles),
    dcKw: numOrNull(r.dc_kw), dcMinutes: numOrNull(r.dc_minutes),
  }) as FuelVehicle);
}

/** Add or update vehicles. The same vehicle pasted twice updates its row. */
export async function upsertFuelVehicles(rows: (Omit<FuelVehicle, "id" | "batteryKwh" | "rangeMiles" | "motorwayMiles" | "dcKw" | "dcMinutes"> & Partial<FuelVehicle>)[]): Promise<{ added: number; updated: number }> {
  const now = Math.floor(Date.now() / 1000);
  let added = 0, updated = 0;
  for (const v of rows) {
    const id = fuelVehicleId(v);
    const [cur] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM fuel_vehicles WHERE id = ${id}`);
    if (Number(cur?.n ?? 0) > 0) updated++; else added++;
    // A re-paste without the optional electric columns keeps what was there.
    await db.run(sql`
      INSERT INTO fuel_vehicles (id, powertrain, segment, make, model, derivative, fuel, efficiency, source, battery_kwh, range_miles, range_motorway_miles, dc_kw, dc_minutes, updated_at)
      VALUES (${id}, ${v.powertrain}, ${v.segment}, ${v.make}, ${v.model}, ${v.derivative}, ${v.fuel}, ${v.efficiency}, ${v.source},
        ${v.batteryKwh ?? null}, ${v.rangeMiles ?? null}, ${v.motorwayMiles ?? null}, ${v.dcKw ?? null}, ${v.dcMinutes ?? null}, ${now})
      ON CONFLICT(id) DO UPDATE SET efficiency = excluded.efficiency, source = excluded.source, updated_at = excluded.updated_at,
        battery_kwh = COALESCE(excluded.battery_kwh, fuel_vehicles.battery_kwh),
        range_miles = COALESCE(excluded.range_miles, fuel_vehicles.range_miles),
        range_motorway_miles = COALESCE(excluded.range_motorway_miles, fuel_vehicles.range_motorway_miles),
        dc_kw = COALESCE(excluded.dc_kw, fuel_vehicles.dc_kw),
        dc_minutes = COALESCE(excluded.dc_minutes, fuel_vehicles.dc_minutes)
    `);
  }
  return { added, updated };
}

export async function deleteFuelVehicle(id: string): Promise<void> {
  await db.run(sql`DELETE FROM fuel_vehicles WHERE id = ${id}`);
}
