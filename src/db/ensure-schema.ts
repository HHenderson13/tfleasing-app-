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
  await ensureColumns("customers", [
    { name: "business_name", sqlType: "TEXT" },
  ]);
  await ensureColumns("proposals", [
    // Back-loaded deals are admin-only entries with incomplete fields, kept
    // out of reports/KPIs. Existing rows default to 0 (false).
    { name: "back_loaded", sqlType: "INTEGER NOT NULL DEFAULT 0" },
  ]);
  await ensureFunderInterestRatesTable();
  await ensureScraperTables();
  await ensureLoginAttemptsTable();
  await ensureWorldCupTables();
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

// Creates the three World Cup tables and idempotently seeds wc_fixtures with
// the 104 matches from the template. Re-running on boot is safe:
//   - CREATE TABLE IF NOT EXISTS
//   - INSERT OR IGNORE on the seed (admins can edit dates/stadiums/etc later
//     without those edits being overwritten on the next deploy).
async function ensureWorldCupTables() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS wc_fixtures (
      fixture_number INTEGER PRIMARY KEY,
      stage TEXT NOT NULL,
      group_name TEXT,
      kickoff_at INTEGER NOT NULL,
      stadium TEXT,
      city TEXT,
      team1 TEXT,
      team2 TEXT,
      next_fixture_number INTEGER,
      next_slot TEXT
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_wc_fixtures_stage ON wc_fixtures(stage)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_wc_fixtures_kickoff ON wc_fixtures(kickoff_at)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS wc_results (
      fixture_number INTEGER PRIMARY KEY,
      team1_goals INTEGER NOT NULL,
      team2_goals INTEGER NOT NULL,
      et_team1_goals INTEGER,
      et_team2_goals INTEGER,
      pen_team1 INTEGER,
      pen_team2 INTEGER,
      winner_team TEXT NOT NULL,
      settled_at INTEGER NOT NULL,
      settled_by_user_id TEXT NOT NULL
    )
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS wc_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      fixture_number INTEGER NOT NULL,
      team1_goals INTEGER NOT NULL,
      team2_goals INTEGER NOT NULL,
      predicted_winner TEXT NOT NULL,
      points INTEGER,
      submitted_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_wc_predictions_user_fixture ON wc_predictions(user_id, fixture_number)`,
  ));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_wc_predictions_user ON wc_predictions(user_id)`));

  await seedWcFixturesIfEmpty();
  await bootstrapWcAdmin();
}

// Grants wc_admin to a single email on every boot — idempotent. Without this,
// nobody could administer the World Cup game on first deploy (we deliberately
// stopped global admins inheriting wc_admin). Override via env if you want to
// hand-off the main WC admin to someone else.
const DEFAULT_WC_ADMIN_EMAIL = "harry.edward.henderson@gmail.com";
async function bootstrapWcAdmin() {
  const targetEmail = (process.env.WC_BOOTSTRAP_ADMIN_EMAIL ?? DEFAULT_WC_ADMIN_EMAIL).toLowerCase().trim();
  if (!targetEmail) return;
  // Find the user by email. Email is unique in the users table.
  const rows = await db.all<{ id: string; roles: string }>(sql`
    SELECT id, roles FROM users WHERE LOWER(email) = ${targetEmail} LIMIT 1
  `);
  const u = rows[0];
  if (!u) return; // user hasn't been created yet — bootstrap runs again next boot
  let parsed: string[] = [];
  try { parsed = JSON.parse(u.roles || "[]"); } catch { parsed = []; }
  if (parsed.includes("wc_admin")) return;
  // Remove a pre-existing 'wc' (if any) before adding wc_admin so we don't
  // duplicate the player tier under the admin tier.
  const next = parsed.filter((r) => r !== "wc");
  next.push("wc_admin");
  const nowMs = Math.floor(Date.now() / 1000);
  await db.run(sql`
    UPDATE users SET roles = ${JSON.stringify(Array.from(new Set(next)))}, updated_at = ${nowMs}
    WHERE id = ${u.id}
  `);
}

async function seedWcFixturesIfEmpty() {
  // Lazy-load seed JSON via require so the (~30KB) payload isn't bundled into
  // every request — only loaded the first time the schema needs to migrate.
  const rows = await db.all<{ n: number }>(sql.raw(`SELECT COUNT(*) AS n FROM wc_fixtures`));
  const existing = Number(rows[0]?.n ?? 0);
  if (existing >= 104) return;

  type Seed = {
    fixtureNumber: number;
    stage: string;
    groupName: string | null;
    kickoffAt: string;
    stadium: string | null;
    city: string | null;
    team1: string | null;
    team2: string | null;
    nextFixtureNumber: number | null;
    nextSlot: string | null;
  };
  const seed: Seed[] = (await import("@/lib/wc-fixtures-seed.json")).default as Seed[];
  for (const f of seed) {
    const kickoffMs = Math.floor(new Date(f.kickoffAt).getTime() / 1000);
    await db.run(sql`
      INSERT OR IGNORE INTO wc_fixtures
        (fixture_number, stage, group_name, kickoff_at, stadium, city, team1, team2, next_fixture_number, next_slot)
      VALUES
        (${f.fixtureNumber}, ${f.stage}, ${f.groupName}, ${kickoffMs}, ${f.stadium}, ${f.city}, ${f.team1}, ${f.team2}, ${f.nextFixtureNumber}, ${f.nextSlot})
    `);
  }
}

async function ensureLoginAttemptsTable() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      email TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      attempted_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_recent ON login_attempts(ip, attempted_at)`
  ));
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
