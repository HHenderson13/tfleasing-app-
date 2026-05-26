import { sql } from "drizzle-orm";
import { db } from "./index";

type TableInfoRow = {
  name: string;
};

let ensurePromise: Promise<void> | null = null;

export async function ensureAppSchema() {
  if (!ensurePromise) {
    ensurePromise = runEnsureAppSchema().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

async function runEnsureAppSchema() {
  await ensureRatebookRemoteSettingsTable();
  await ensureColumns("proposals", [
    { name: "delivery_booked_at", sqlType: "INTEGER" },
    { name: "reg_number", sqlType: "TEXT" },
    { name: "delivered_at", sqlType: "INTEGER" },
  ]);
  await ensureColumns("stage_check_defs", [
    { name: "stage", sqlType: "TEXT NOT NULL DEFAULT 'order'" },
  ]);
  await ensureColumns("vehicles", [
    { name: "cap_id", sqlType: "TEXT" },
  ]);
  await ensureColumns("ratebook", [
    { name: "excess_mileage", sqlType: "REAL" },
  ]);
  await ensureFunderInterestRatesTable();
  await ensureScraperTables();
  await seedDefaultDeliveryChecks();
  await seedKugaEngineMappings();
}

// Auto-creates the scraper tables on first request so deploys don't need a
// manual migration step. Idempotent — CREATE TABLE IF NOT EXISTS.
async function ensureScraperTables() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS scraper_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      urls TEXT NOT NULL,
      label TEXT,
      total_urls INTEGER NOT NULL DEFAULT 0,
      urls_completed INTEGER NOT NULL DEFAULT 0,
      total_results INTEGER NOT NULL DEFAULT 0,
      workflow_id TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS scraper_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      source_url TEXT,
      manufacturer TEXT,
      range TEXT,
      model TEXT,
      derivative TEXT,
      fuel_type TEXT,
      transmission TEXT,
      body_style TEXT,
      trim TEXT,
      monthly_price_gbp REAL,
      initial_rental_gbp REAL,
      total_lease_cost_gbp REAL,
      additional_fees_gbp REAL,
      contract_length_months INTEGER,
      annual_mileage INTEGER,
      deposit_months INTEGER,
      broker_dealer_name TEXT,
      advertiser_category TEXT,
      in_stock TEXT,
      finance_type TEXT,
      deal_identifier TEXT,
      leasing_url TEXT,
      scraped_at INTEGER
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_scraper_results_run ON scraper_results(run_id)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS scraper_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_scraper_logs_run ON scraper_logs(run_id)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS scraper_url_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      urls TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `));
}

async function seedKugaEngineMappings() {
  const seeds: { rawKey: string; displayName: string }[] = [
    { rawKey: "STAGE 6.2 FHEV EMISSIONS", displayName: "2.5L PHEV" },
    { rawKey: "STAGE 6.2 PHEV EMISSIONS", displayName: "2.5L PHEV" },
    { rawKey: "EURO 6.2 EMISSIONS",       displayName: "1.5L EcoBoost" },
  ];
  for (const s of seeds) {
    await db.run(sql`
      INSERT OR IGNORE INTO stock_mappings (kind, raw_key, display_name, group_site_id, hidden, promote_to_variant)
      VALUES ('engine', ${s.rawKey}, ${s.displayName}, NULL, 0, 0)
    `);
  }
}

async function seedDefaultDeliveryChecks() {
  const rows = await db.all<{ n: number }>(
    sql.raw(`SELECT COUNT(*) AS n FROM stage_check_defs WHERE stage = 'delivery'`),
  );
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) return;

  const now = Math.floor(Date.now() / 1000);
  const seeds = [
    { id: "invoiced", label: "Invoiced", sort: 10 },
    { id: "taxed", label: "Taxed", sort: 20 },
    { id: "pdi-plates", label: "PDI + Plates pushed", sort: 30 },
    { id: "delivery-pack", label: "Delivery pack submitted to funder", sort: 40 },
  ];
  for (const s of seeds) {
    await db.run(sql`
      INSERT OR IGNORE INTO stage_check_defs (id, label, sort_order, applies_to_bq, stage, created_at)
      VALUES (${s.id}, ${s.label}, ${s.sort}, 1, 'delivery', ${now})
    `);
  }
}

// Per-funder, per-term annual interest rates. Seeded from the Ratebook Pricing
// Engine settings.json on first init — edit the table directly to change rates.
// termFollowOns is termMonths - 1 (so 23/35/47 for 2yr/3yr/4yr contracts).
async function ensureFunderInterestRatesTable() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS funder_interest_rates (
      funder_id TEXT NOT NULL,
      term_follow_ons INTEGER NOT NULL,
      annual_rate REAL NOT NULL,
      PRIMARY KEY (funder_id, term_follow_ons)
    )
  `));
  await ensureColumns("funder_interest_rates", [
    { name: "rental_1adv", sqlType: "REAL" },
    { name: "rental_12adv", sqlType: "REAL" },
    { name: "updated_at", sqlType: "INTEGER" },
  ]);

  const seeds: Array<{ funderId: string; rates: Record<23 | 35 | 47, number> }> = [
    { funderId: "ald",    rates: { 23: 0.067378, 35: 0.067547, 47: 0.068448 } },
    { funderId: "novuna", rates: { 23: 0.071602, 35: 0.070469, 47: 0.069665 } },
    { funderId: "arval",  rates: { 23: 0.092834, 35: 0.07137,  47: 0.059322 } },
    { funderId: "lex",    rates: { 23: 0.058581, 35: 0.051387, 47: 0.047729 } },
  ];
  for (const s of seeds) {
    for (const [followOns, rate] of Object.entries(s.rates)) {
      // INSERT OR IGNORE leaves any admin edits intact on subsequent boots.
      await db.run(sql`
        INSERT OR IGNORE INTO funder_interest_rates (funder_id, term_follow_ons, annual_rate)
        VALUES (${s.funderId}, ${parseInt(followOns, 10)}, ${rate})
      `);
    }
  }
}

async function ensureRatebookRemoteSettingsTable() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ratebook_remote_settings (
      id text PRIMARY KEY NOT NULL,
      protocol text NOT NULL DEFAULT 'sftp',
      host text NOT NULL,
      port integer,
      username text NOT NULL,
      password text NOT NULL,
      remote_path text NOT NULL DEFAULT '',
      updated_at integer NOT NULL
    )
  `));
}

async function ensureColumns(
  tableName: string,
  columns: { name: string; sqlType: string }[],
) {
  const existing = await db.all<TableInfoRow>(sql.raw(`PRAGMA table_info(${tableName})`));
  const names = new Set(existing.map((column) => column.name));

  for (const column of columns) {
    if (names.has(column.name)) continue;
    await db.run(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.sqlType}`));
    names.add(column.name);
  }
}
