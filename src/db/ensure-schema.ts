import { sql } from "drizzle-orm";
import { db } from "./index";

type TableInfoRow = {
  name: string;
};

// Bump this every time runEnsureAppSchema() gains a new ensureColumns /
// ensureXTable / seedY call. The cold-start gate below checks this against
// the schema_version table — match means we skip ~30 DB round-trips.
//
// Keep it monotonically increasing; never reuse a number.
const SCHEMA_VERSION = 16;

// Cached per Lambda instance — the ensure pipeline runs ~30 idempotent DB
// ops (PRAGMAs, INSERT OR IGNOREs, UPDATEs); without this cache they'd
// re-run on every authenticated page load (getCurrentUser awaits it).
// Stored as a promise so concurrent cold-start requests share one run.
let ensurePromise: Promise<void> | null = null;

export async function ensureAppSchema() {
  if (!ensurePromise) {
    ensurePromise = runWithVersionCheck().catch((error) => {
      ensurePromise = null; // retry on next request rather than stay stuck
      throw error;
    });
  }
  return ensurePromise;
}

// Single SELECT to skip the full PRAGMA/ALTER cycle. When the live version
// row matches SCHEMA_VERSION, we know the schema is current — no point
// firing 30 idempotent operations every Lambda cold-start.
//
// We still ensure schema_version itself exists before reading it (cheap
// CREATE IF NOT EXISTS), so first-ever boot still works.
async function runWithVersionCheck() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  const rows = await db.all<{ version: number }>(sql.raw(
    `SELECT version FROM schema_version WHERE id = 1`,
  ));
  if (rows.length > 0 && Number(rows[0].version) === SCHEMA_VERSION) {
    return; // Schema is current — skip the full ensure pipeline.
  }
  await runEnsureAppSchema();
  const now = Math.floor(Date.now() / 1000);
  await db.run(sql.raw(`
    INSERT INTO schema_version (id, version, updated_at) VALUES (1, ${SCHEMA_VERSION}, ${now})
    ON CONFLICT(id) DO UPDATE SET version = ${SCHEMA_VERSION}, updated_at = ${now}
  `));
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
  await ensureSalesLeaderboardTables();
  await ensureBrokerPortalTables();
  await seedDefaultDeliveryChecks();
  await seedKugaEngineMappings();
  await ensureHotPathIndexes();
}

// Broker portal — completely separate auth from the TF leasing app. See
// src/db/schema.ts for the Drizzle definitions and src/lib/broker-auth.ts
// for the parallel session/cookie helpers.
async function ensureBrokerPortalTables() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS brokers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_users (
      id TEXT PRIMARY KEY,
      broker_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      setup_token TEXT,
      setup_token_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_users_broker ON broker_users(broker_id)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_sessions (
      id TEXT PRIMARY KEY,
      broker_user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_quotes (
      id TEXT PRIMARY KEY,
      broker_id TEXT NOT NULL,
      created_by_broker_user_id TEXT NOT NULL,
      vehicle_ref TEXT NOT NULL,
      vehicle_vin TEXT NOT NULL,
      vehicle_snapshot TEXT NOT NULL,
      funding_route TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      customer_is_vat_business INTEGER NOT NULL DEFAULT 0,
      commission_ex_vat_gbp REAL NOT NULL,
      commission_vat_gbp REAL NOT NULL,
      vehicle_cash_gbp REAL NOT NULL,
      customer_total_gbp REAL NOT NULL,
      term_months INTEGER,
      annual_mileage INTEGER,
      upfront_gbp REAL,
      monthly_rental_gbp REAL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_quotes_broker ON broker_quotes(broker_id)`,
  ));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_quotes_broker_updated ON broker_quotes(broker_id, updated_at)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_vehicle_cash_values (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      variant TEXT NOT NULL,
      derivative TEXT,
      model_year TEXT,
      cap_code TEXT,
      cap_id TEXT,
      cash_gbp REAL NOT NULL,
      margin_gbp REAL,
      margin_pct REAL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_cash_values_key ON broker_vehicle_cash_values(bucket, variant, derivative, model_year)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_stock_turn_rules (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      bucket TEXT,
      model_year TEXT,
      gate_release_from INTEGER,
      gate_release_to INTEGER,
      must_register_by INTEGER NOT NULL,
      bonus_gbp REAL NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  // broker_quotes gains two columns to record any stock-turn bonus the
  // broker picked up. Using ensureColumns so an existing table from
  // SCHEMA_VERSION 9/10 gets the columns ALTER'd in.
  await ensureColumns("broker_quotes", [
    { name: "stock_turn_rule_id", sqlType: "TEXT" },
    { name: "stock_turn_bonus_gbp", sqlType: "REAL" },
  ]);
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_interest_rates (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      vehicle_class TEXT NOT NULL,
      bucket TEXT,
      customer_type TEXT NOT NULL,
      funding_route TEXT NOT NULL,
      term_months INTEGER NOT NULL,
      annual_apr_pct REAL NOT NULL,
      deposit_allowance_gbp REAL,
      valid_from INTEGER,
      valid_until INTEGER,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_interest_rates_key ON broker_interest_rates(vehicle_class, customer_type, funding_route, term_months)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_ofp_uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      vehicle_class TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL,
      uploaded_by_user_id TEXT NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_ofp_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL,
      vehicle_class TEXT NOT NULL,
      funding_route TEXT NOT NULL,
      vehicle TEXT NOT NULL,
      model_year TEXT,
      term_months INTEGER NOT NULL,
      annual_mileage INTEGER NOT NULL,
      balloon_gbp REAL NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_ofp_lookup ON broker_ofp_data(vehicle_class, funding_route, vehicle, model_year, term_months, annual_mileage)`,
  ));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_broker_ofp_upload ON broker_ofp_data(upload_id)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_ev_offers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      cash_alternative_gbp REAL NOT NULL,
      wallbox_label TEXT NOT NULL,
      valid_from INTEGER,
      valid_until INTEGER,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_trade_in_offers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      amount_gbp REAL NOT NULL,
      terms_text TEXT NOT NULL,
      vehicle_class TEXT,
      bucket TEXT,
      valid_from INTEGER,
      valid_until INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_test_drive_offers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      amount_gbp REAL NOT NULL,
      terms_text TEXT,
      vehicle_class TEXT,
      bucket TEXT,
      valid_from INTEGER,
      valid_until INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_business_discounts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      vehicle_class TEXT,
      bucket TEXT,
      funding_route TEXT,
      extra_discount_pct REAL NOT NULL,
      apr_uplift_pct REAL NOT NULL DEFAULT 0,
      notes TEXT,
      valid_from INTEGER,
      valid_until INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await ensureColumns("broker_quotes", [
    { name: "ev_offer_id", sqlType: "TEXT" },
    { name: "ev_choice", sqlType: "TEXT" },
    { name: "ev_cash_gbp", sqlType: "REAL" },
    { name: "trade_in_offer_id", sqlType: "TEXT" },
    { name: "trade_in_gbp", sqlType: "REAL" },
    { name: "test_drive_offer_id", sqlType: "TEXT" },
    { name: "test_drive_gbp", sqlType: "REAL" },
    { name: "business_discount_offer_id", sqlType: "TEXT" },
    { name: "business_discount_gbp", sqlType: "REAL" },
    { name: "business_apr_uplift_pct", sqlType: "REAL" },
    // Phase 5 finance columns. All nullable so existing outright
    // quotes (which leave them null) read identically.
    { name: "balloon_gbp", sqlType: "REAL" },
    { name: "deposit_allowance_gbp", sqlType: "REAL" },
    { name: "annual_apr_pct", sqlType: "REAL" },
    { name: "amount_of_credit_gbp", sqlType: "REAL" },
    { name: "total_charge_for_credit_gbp", sqlType: "REAL" },
    { name: "total_payable_gbp", sqlType: "REAL" },
    { name: "interest_rate_rule_id", sqlType: "TEXT" },
    { name: "ofp_row_id", sqlType: "INTEGER" },
    // Phase 5d Contract Hire columns. Null on every other route.
    { name: "monthly_maintenance_gbp", sqlType: "REAL" },
    { name: "initial_rental_multiplier", sqlType: "INTEGER" },
    { name: "is_maintained", sqlType: "INTEGER" },
    { name: "funder_id", sqlType: "TEXT" },
    { name: "funder_name", sqlType: "TEXT" },
  ]);
}

// Indexes for the hottest WHERE / ORDER BY clauses on the request path.
// Idempotent — IF NOT EXISTS means re-running is a no-op.
//
// Why each one:
//   • proposals.delivered_detected_at — getRecentlyDelivered filters on
//     this with a 7-day cutoff. Without an index it scans every row.
//   • proposals.updated_at DESC      — listProposals orders by this; an
//     index lets SQLite skip the sort entirely.
//   • sessions.expires_at            — cookie lookups join on id, but
//     pruning expired sessions reads this regularly.
//   • users.sales_exec_id            — getCurrentUser → user record lookup
//     also resolves the exec link; indexed lookups stay O(log n).
async function ensureHotPathIndexes() {
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_proposals_delivered_detected_at ON proposals(delivered_detected_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_proposals_updated_at ON proposals(updated_at DESC)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_users_sales_exec_id ON users(sales_exec_id)`));
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

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS wc_payments (
      user_id TEXT PRIMARY KEY,
      paid_at INTEGER NOT NULL,
      marked_by_user_id TEXT NOT NULL
    )
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS wc_live_scores (
      fixture_number INTEGER PRIMARY KEY,
      team1_goals INTEGER NOT NULL,
      team2_goals INTEGER NOT NULL,
      minute INTEGER,
      status TEXT,
      first_final_at INTEGER,
      updated_at INTEGER NOT NULL,
      updated_by_user_id TEXT NOT NULL
    )
  `));
  // Migrations for existing wc_live_scores rows from before the ESPN feed.
  await ensureColumns("wc_live_scores", [
    { name: "status", sqlType: "TEXT" },
    { name: "first_final_at", sqlType: "INTEGER" },
  ]);

  await seedWcFixturesIfEmpty();
  await bootstrapWcAdmin();
}

// Self-healing wc_admin bootstrap. Three strategies, tried in order:
//   1. The email in WC_BOOTSTRAP_ADMIN_EMAIL (or the hard-coded default).
//   2. If that user doesn't exist OR has a different email casing — search
//      for any existing wc_admin in the system. If at least one exists,
//      we're good; stop.
//   3. Last resort: if no wc_admin exists ANYWHERE, promote the first user
//      with the global 'admin' role so the office sweepstake can be set
//      up after deploy. This *is* a one-time auto-grant but only fires
//      when nobody else can administer the game (deliberate safety net).
const DEFAULT_WC_ADMIN_EMAIL = "harry.edward.henderson@gmail.com";
async function bootstrapWcAdmin() {
  const targetEmail = (process.env.WC_BOOTSTRAP_ADMIN_EMAIL ?? DEFAULT_WC_ADMIN_EMAIL).toLowerCase().trim();

  // Strategy 1: explicit email match.
  if (targetEmail) {
    const rows = await db.all<{ id: string; roles: string }>(sql`
      SELECT id, roles FROM users WHERE LOWER(email) = ${targetEmail} LIMIT 1
    `);
    if (rows[0]) {
      await ensureWcAdminForUser(rows[0].id, rows[0].roles);
      return;
    }
  }

  // Strategy 2: is there ANY wc_admin in the system? If so we're done.
  const existing = await db.all<{ id: string }>(sql`
    SELECT id FROM users WHERE roles LIKE '%"wc_admin"%' LIMIT 1
  `);
  if (existing.length > 0) return;

  // Strategy 3 (safety net): no wc_admin exists, so promote the first site
  // admin we find. Logs prominently so it shows up in operational alerts.
  const firstAdmin = await db.all<{ id: string; roles: string }>(sql`
    SELECT id, roles FROM users WHERE roles LIKE '%"admin"%' ORDER BY created_at ASC LIMIT 1
  `);
  if (firstAdmin[0]) {
    await ensureWcAdminForUser(firstAdmin[0].id, firstAdmin[0].roles);
  }
}

async function ensureWcAdminForUser(userId: string, rolesJson: string) {
  let parsed: string[] = [];
  try { parsed = JSON.parse(rolesJson || "[]"); } catch { parsed = []; }
  if (parsed.includes("wc_admin")) return;
  // Drop a pre-existing 'wc' so we don't have both 'wc' and 'wc_admin'.
  const next = Array.from(new Set([...parsed.filter((r) => r !== "wc"), "wc_admin"]));
  const nowSeconds = Math.floor(Date.now() / 1000);
  await db.run(sql`
    UPDATE users SET roles = ${JSON.stringify(next)}, updated_at = ${nowSeconds}
    WHERE id = ${userId}
  `);
}

async function seedWcFixturesIfEmpty() {
  // Seed-syncs the 104 fixtures from src/lib/wc-fixtures-seed.json. Static
  // metadata (kickoff time, stage, group, stadium, next-match wiring) is
  // force-synced on every boot — corrections in the seed file propagate to
  // already-deployed rows without needing a one-shot migration.
  //
  // Team names are NOT force-synced: admins may have manually advanced
  // bracket teams, and we don't want to clobber those edits. New rows get
  // teams from the seed (groups have the 48 known teams; knockouts start
  // blank).
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
    // Insert if missing (first boot).
    await db.run(sql`
      INSERT OR IGNORE INTO wc_fixtures
        (fixture_number, stage, group_name, kickoff_at, stadium, city, team1, team2, next_fixture_number, next_slot)
      VALUES
        (${f.fixtureNumber}, ${f.stage}, ${f.groupName}, ${kickoffMs}, ${f.stadium}, ${f.city}, ${f.team1}, ${f.team2}, ${f.nextFixtureNumber}, ${f.nextSlot})
    `);
    // Force-sync static metadata on every boot (cheap; UPDATE is a no-op
    // when the values already match). Don't touch team1/team2.
    await db.run(sql`
      UPDATE wc_fixtures
      SET stage = ${f.stage},
          group_name = ${f.groupName},
          kickoff_at = ${kickoffMs},
          stadium = ${f.stadium},
          city = ${f.city},
          next_fixture_number = ${f.nextFixtureNumber},
          next_slot = ${f.nextSlot}
      WHERE fixture_number = ${f.fixtureNumber}
    `);
  }
}

// Sales-exec leaderboard tables — created idempotently per usual.
async function ensureSalesLeaderboardTables() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS sales_leaderboard_participants (
      sales_exec_id TEXT PRIMARY KEY,
      photo_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS sales_leaderboard_name_map (
      report_code TEXT PRIMARY KEY,
      sales_exec_id TEXT NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS sales_leaderboard_monthly (
      year_month TEXT NOT NULL,
      sales_exec_id TEXT NOT NULL,
      order_count INTEGER,
      delivery_count INTEGER,
      insurance_count INTEGER,
      enquiry_count INTEGER,
      sales_count INTEGER,
      latest_vehicle TEXT,
      orders_updated_at INTEGER,
      deliveries_updated_at INTEGER,
      enquiries_updated_at INTEGER,
      PRIMARY KEY (year_month, sales_exec_id)
    )
  `));
  await db.run(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_sales_leaderboard_monthly_month
      ON sales_leaderboard_monthly(year_month)
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS sales_leaderboard_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_month TEXT NOT NULL,
      report_type TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL,
      uploaded_by_user_id TEXT NOT NULL
    )
  `));
  // Store the parser output (per report-code aggregates) so we can
  // re-attribute to execs when the name map or participant list changes.
  // Without this, an upload that happens BEFORE the map is set would freeze
  // zero values until the admin re-uploaded — see the rebuild helper in
  // src/app/sales-leaderboard/admin/actions.ts.
  await ensureColumns("sales_leaderboard_uploads", [
    { name: "parsed_data", sqlType: "TEXT" },
  ]);
  await db.run(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_sales_leaderboard_uploads_slot
      ON sales_leaderboard_uploads(year_month, report_type, uploaded_at DESC)
  `));
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
