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
const SCHEMA_VERSION = 38;

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
    // Delivery tracker columns — mirror Lou's Excel "2026" tab. All
    // optional except the final pack-submission gate.
    { name: "vehicle_colour", sqlType: "TEXT" },
    { name: "factory_options", sqlType: "TEXT" },
    { name: "pdi_done", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    { name: "invoiced", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    { name: "itc_complete", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    { name: "gap_policy_status", sqlType: "TEXT NOT NULL DEFAULT 'none'" },
    { name: "gap_policy_number", sqlType: "TEXT" },
    { name: "tfp_policy_status", sqlType: "TEXT NOT NULL DEFAULT 'none'" },
    { name: "tfp_policy_number", sqlType: "TEXT" },
    { name: "taxed", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    { name: "delivery_notes", sqlType: "TEXT" },
    { name: "delivery_pack_submitted", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    { name: "delivery_details_checked", sqlType: "INTEGER NOT NULL DEFAULT 0" },
    // YYYY-MM coarse delivery estimate — see schema.ts for the rationale.
    { name: "estimated_delivery_month", sqlType: "TEXT" },
  ]);
  // Dealer-fit options table — one row per item on a proposal.
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS dealer_fit_options (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      label TEXT NOT NULL,
      fitted INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_dealer_fit_options_proposal ON dealer_fit_options(proposal_id)`,
  ));
  await ensureFunderInterestRatesTable();
  await ensureScraperTables();
  await ensureLoginAttemptsTable();
  await ensureWorldCupTables();
  await ensureSalesLeaderboardTables();
  await ensureBrokerPortalTables();
  await ensureForecastTables();
  await seedDefaultDeliveryChecks();
  await seedKugaEngineMappings();
  await ensureHotPathIndexes();
}

async function ensureForecastTables() {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_dealbook_uploads (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      month_yyyymm TEXT NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by_user_id TEXT NOT NULL
    )
  `));
  // Snapshot of live config + vehicles + bonuses captured at upload
  // time. Lets the monthly view compute forecasts off the values that
  // were live when the month was first uploaded, so admin edits don't
  // retroactively shift older months.
  await ensureColumns("forecast_dealbook_uploads", [
    { name: "settings_snapshot", sqlType: "TEXT" },
  ]);
  // Old test rows used the previous 3-source enum (lease_new_cars /
  // lease_new_commercial / salary_sacrifice). Map both lease values to
  // the consolidated "lease" tag so we don't strand them.
  await db.run(sql.raw(`UPDATE forecast_dealbook_uploads SET source = 'lease' WHERE source IN ('lease_new_cars', 'lease_new_commercial', 'leasing')`));
  await db.run(sql.raw(`UPDATE forecast_dealbook_lines SET source = 'lease' WHERE source IN ('lease_new_cars', 'lease_new_commercial', 'leasing')`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_dealbook_lines (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      source TEXT NOT NULL,
      default_month TEXT NOT NULL,
      override_month TEXT,
      effective_month TEXT NOT NULL,
      branch TEXT,
      vehicle_type TEXT,
      sales_type TEXT,
      sales_sub_type TEXT,
      customer_name TEXT,
      model TEXT,
      order_date TEXT,
      reg_date TEXT,
      deliv_date TEXT,
      invoice_date TEXT,
      deliv_status TEXT,
      chassis_profit REAL NOT NULL DEFAULT 0,
      add_bonus REAL NOT NULL DEFAULT 0,
      metal_subsidy REAL NOT NULL DEFAULT 0,
      recon_cost REAL NOT NULL DEFAULT 0,
      oallow_discount REAL NOT NULL DEFAULT 0,
      accessory_profit REAL NOT NULL DEFAULT 0,
      warranty_cost REAL NOT NULL DEFAULT 0,
      total_vehicle_profit REAL NOT NULL DEFAULT 0,
      finance_income REAL NOT NULL DEFAULT 0,
      finance_mb REAL NOT NULL DEFAULT 0,
      tyre_ins_income REAL NOT NULL DEFAULT 0,
      finance_subsidy REAL NOT NULL DEFAULT 0,
      cpi_income REAL NOT NULL DEFAULT 0,
      smart_repair REAL NOT NULL DEFAULT 0,
      gap_rti_income REAL NOT NULL DEFAULT 0,
      paint_protection REAL NOT NULL DEFAULT 0,
      warranty REAL NOT NULL DEFAULT 0,
      total_fi_income REAL NOT NULL DEFAULT 0,
      total_gross_profit REAL NOT NULL DEFAULT 0,
      vin TEXT,
      reg_no TEXT,
      customer_external_id TEXT,
      finance_co TEXT,
      created_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_forecast_lines_upload ON forecast_dealbook_lines(upload_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_forecast_lines_month ON forecast_dealbook_lines(effective_month)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_forecast_lines_source ON forecast_dealbook_lines(source)`));

  // Backfill kind + vehicle_id + basic columns onto existing line rows.
  await ensureColumns("forecast_dealbook_lines", [
    { name: "kind", sqlType: "TEXT NOT NULL DEFAULT 'unknown'" },
    { name: "vehicle_id", sqlType: "TEXT" },
    { name: "basic", sqlType: "REAL NOT NULL DEFAULT 0" },
  ]);
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_forecast_lines_kind ON forecast_dealbook_lines(kind)`));
  // Volume placement is now permanently the upload's target month —
  // override_month only steers DPA bucketing. Restore effective_month
  // for any historic rows where it was shifted off default_month.
  await db.run(sql.raw(`UPDATE forecast_dealbook_lines SET effective_month = default_month WHERE effective_month != default_month`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_actuals (
      id TEXT PRIMARY KEY,
      month_yyyymm TEXT NOT NULL,
      sheet TEXT NOT NULL,
      line_key TEXT NOT NULL,
      value REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by_user_id TEXT NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_actuals_slot ON forecast_actuals(month_yyyymm, sheet, line_key)`,
  ));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_inputs (
      id TEXT PRIMARY KEY,
      month_yyyymm TEXT NOT NULL,
      sheet TEXT NOT NULL,
      scenario_key TEXT NOT NULL,
      value REAL NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_inputs_slot ON forecast_inputs(month_yyyymm, sheet, scenario_key)`,
  ));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_config (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `));
  // Newer columns: how this row should be applied, and which line key
  // it drives. Existing rows get sensible defaults via backfill.
  await ensureColumns("forecast_config", [
    { name: "applies", sqlType: "TEXT NOT NULL DEFAULT 'special'" },
    { name: "applies_to_line_key", sqlType: "TEXT" },
  ]);

  // Vehicle catalogue + per-vehicle bonus values.
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      fuel_type TEXT NOT NULL DEFAULT 'ice',
      keywords TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  // Existing rows might pre-date the fuel_type column.
  await ensureColumns("forecast_vehicles", [
    { name: "fuel_type", sqlType: "TEXT NOT NULL DEFAULT 'ice'" },
  ]);
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_vehicle_bonuses (
      vehicle_id TEXT NOT NULL,
      bonus_key TEXT NOT NULL,
      value REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (vehicle_id, bonus_key)
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS forecast_scenarios (
      id TEXT PRIMARY KEY,
      month_yyyymm TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      chassis_gp_per_unit REAL NOT NULL,
      units INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_month ON forecast_scenarios(month_yyyymm)`));

  // Seed the catalogue. INSERT OR IGNORE so admin edits aren't trampled.
  // Keywords are picked to match Dealbook "Model" text, with the more
  // specific compound names (e.g. "Puma Gen-E") landing in their own
  // vehicle so the classifier doesn't fall back to plain "Puma".
  const nowSec = Math.floor(Date.now() / 1000);
  const vehicleSeeds: Array<{
    id: string; name: string; kind: "car" | "van"; fuel: "ice" | "bev"; keywords: string[]; sort: number;
  }> = [
    // ── Cars ──
    { id: "puma-gen-e",      name: "Puma Gen-E",      kind: "car", fuel: "bev", keywords: ["Puma Gen-E"],                  sort: 10 },
    { id: "explorer",        name: "Explorer",        kind: "car", fuel: "bev", keywords: ["Explorer"],                    sort: 20 },
    { id: "capri",           name: "Capri",           kind: "car", fuel: "bev", keywords: ["Capri"],                       sort: 30 },
    { id: "mustang-mach-e",  name: "Mustang Mach-E",  kind: "car", fuel: "bev", keywords: ["Mustang Mach-E", "Mach-E"],    sort: 40 },
    { id: "kuga-phev",       name: "Kuga PHEV",       kind: "car", fuel: "ice", keywords: ["Kuga PHEV", "Kuga Phev"],      sort: 50 },
    { id: "kuga",            name: "Kuga",            kind: "car", fuel: "ice", keywords: ["Kuga"],                        sort: 60 },
    { id: "puma",            name: "Puma",            kind: "car", fuel: "ice", keywords: ["Puma"],                        sort: 70 },
    { id: "focus",           name: "Focus",           kind: "car", fuel: "ice", keywords: ["Focus"],                       sort: 80 },
    // ── Vans ── (kind=van vehicles ignore fuel_type for now)
    { id: "ranger",                 name: "Ranger",                 kind: "van", fuel: "ice", keywords: ["Ranger"],                       sort: 110 },
    { id: "e-transit-custom",       name: "E-Transit Custom",       kind: "van", fuel: "bev", keywords: ["E-Transit Custom"],             sort: 120 },
    { id: "transit-custom",         name: "Transit Custom",         kind: "van", fuel: "ice", keywords: ["Transit Custom"],               sort: 130 },
    { id: "e-transit-courier",      name: "E-Transit Courier",      kind: "van", fuel: "bev", keywords: ["E-Transit Courier"],            sort: 140 },
    { id: "transit-courier",        name: "Transit Courier",        kind: "van", fuel: "ice", keywords: ["Transit Courier"],              sort: 150 },
    { id: "transit-connect-phev",   name: "Transit Connect PHEV",   kind: "van", fuel: "ice", keywords: ["Transit Connect PHEV"],         sort: 160 },
    { id: "transit-connect",        name: "Transit Connect",        kind: "van", fuel: "ice", keywords: ["Transit Connect"],              sort: 170 },
    { id: "transit-city",           name: "Transit City",           kind: "van", fuel: "ice", keywords: ["Transit City"],                 sort: 180 },
    { id: "e-transit",              name: "E-Transit",              kind: "van", fuel: "bev", keywords: ["E-Transit"],                    sort: 190 },
    { id: "transit",                name: "Transit",                kind: "van", fuel: "ice", keywords: ["Transit"],                      sort: 200 },
  ];
  for (const v of vehicleSeeds) {
    await db.run(sql`
      INSERT OR IGNORE INTO forecast_vehicles (id, name, kind, fuel_type, keywords, sort_order, created_at, updated_at)
      VALUES (${v.id}, ${v.name}, ${v.kind}, ${v.fuel}, ${JSON.stringify(v.keywords)}, ${v.sort}, ${nowSec}, ${nowSec})
    `);
  }

  // Seed sensible defaults so the admin tab isn't empty on first boot.
  // INSERT OR IGNORE so any value the admin has already edited stays put.
  const now = Math.floor(Date.now() / 1000);
  // Nominal £ costs that drive the monthly Lease New Cars math. Each
  // row is keyed in Admin → Costs with a "per unit / per month" flag so
  // the user can plug in a cost without touching code. The hardcoded
  // formulas (Chassis GP, Standards margin, etc.) reference `applies =
  // 'special'` rows directly by key.
  const seeds: Array<{
    key: string; value: number; description: string; category: string;
    applies: "per_unit" | "per_month" | "special"; appliesTo: string | null;
    sort: number;
  }> = [
    // ── Lease New Cars — nominal costs ──
    { key: "car_house_charge_per_unit", value: 175, description: "House charge per unit — drives Other income (£ × total units).", category: "car", applies: "special", appliesTo: null, sort: 10 },
    { key: "car_chassis_per_unit",     value: 150, description: "Chassis constant per unit. SalSac + BEV chassis = U + this; ICE chassis = U + this − (Basic × Guarantee B %).", category: "car", applies: "special", appliesTo: null, sort: 11 },
    { key: "car_dcr_per_product", value: 15, description: "DCR rate per F&I product (Alloy / GAP / Warranty) sold in the quarter.", category: "car", applies: "special", appliesTo: null, sort: 12 },
    // ── Lease New Commercial ──
    { key: "cv_house_charge_per_unit", value: 175, description: "House charge per unit — drives CV Other income.", category: "cv", applies: "special", appliesTo: null, sort: 10 },
    { key: "cv_chassis_per_unit",     value: 150, description: "Chassis constant per CV unit. Chassis = U − (Basic × Standards %) − (Basic × VETS %) + this.", category: "cv", applies: "special", appliesTo: null, sort: 11 },
    { key: "cv_dcr_per_product",     value: 15,  description: "DCR rate per F&I product (Alloy / GAP / Warranty) sold in the quarter on CV.", category: "cv", applies: "special", appliesTo: null, sort: 12 },
    { key: "cv_cspa_pct_of_prev_q_dpa", value: 10, description: "CSPA paid in Jan / Apr / Jul / Oct as a % of the previous quarter's CV DPA total.", category: "cv", applies: "special", appliesTo: null, sort: 13 },
    { key: "cv_pdi_prep_per_unit",          value: 135, description: "PDI & Prep cost per CV unit.",        category: "cv", applies: "per_unit", appliesTo: "cv_pdi_prep",         sort: 20 },
    { key: "cv_cleaning_per_unit",          value: 35,  description: "Cleaning cost per CV unit.",          category: "cv", applies: "per_unit", appliesTo: "cv_cleaning",         sort: 30 },
    { key: "cv_sales_commission_per_unit",  value: 80,  description: "Sales commission per CV unit.",       category: "cv", applies: "per_unit", appliesTo: "cv_sales_commissions",sort: 40 },
    { key: "cv_collection_delivery_per_unit", value: 200, description: "Collection & Delivery per CV unit.", category: "cv", applies: "per_unit", appliesTo: "cv_collection_delivery", sort: 50 },
    { key: "cv_personnel_per_month",        value: 0, description: "Personnel costs per month (CV).",     category: "cv", applies: "per_month", appliesTo: "cv_personnel",        sort: 110 },
    { key: "cv_sales_promotion_per_month",  value: 0, description: "Sales promotion costs per month (CV).", category: "cv", applies: "per_month", appliesTo: "cv_sales_promotion",sort: 120 },
    { key: "cv_vehicle_costs_per_month",    value: 0, description: "Vehicle costs per month (CV).",       category: "cv", applies: "per_month", appliesTo: "cv_vehicle_costs",    sort: 130 },
    { key: "cv_equipment_per_month",        value: 0, description: "Equipment costs per month (CV).",     category: "cv", applies: "per_month", appliesTo: "cv_equipment",        sort: 140 },
    { key: "cv_stock_control_per_month",    value: 0, description: "Stock control costs per month (CV).", category: "cv", applies: "per_month", appliesTo: "cv_stock_control",    sort: 150 },
    { key: "cv_other_direct_per_month",     value: 0, description: "Other direct costs per month (CV).",  category: "cv", applies: "per_month", appliesTo: "cv_other_direct",     sort: 160 },
    { key: "cv_property_per_month",         value: 0, description: "Property costs per month (CV).",      category: "cv", applies: "per_month", appliesTo: "cv_property",         sort: 170 },
    { key: "cv_total_interest_per_month",   value: 0, description: "Total interest per month (CV).",      category: "cv", applies: "per_month", appliesTo: "cv_total_interest",   sort: 180 },
    { key: "car_pdi_prep_per_unit", value: 135, description: "PDI & Prep cost per unit.", category: "car", applies: "per_unit", appliesTo: "pdi_prep", sort: 20 },
    { key: "car_cleaning_per_unit", value: 35, description: "Cleaning cost per unit.", category: "car", applies: "per_unit", appliesTo: "cleaning", sort: 30 },
    { key: "car_sales_commission_per_unit", value: 80, description: "Sales commission per unit.", category: "car", applies: "per_unit", appliesTo: "sales_commissions", sort: 40 },
    { key: "car_collection_delivery_per_unit", value: 200, description: "Collection & Delivery per unit (excludes Salary Sacrifice).", category: "car", applies: "per_unit", appliesTo: "collection_delivery", sort: 50 },
    // ── Overheads (Car sheet expenses block) — defaults to 0 so the
    // user can fill in once they know the monthly figure. ──
    { key: "car_personnel_per_month", value: 0, description: "Personnel costs per month.", category: "car", applies: "per_month", appliesTo: "personnel", sort: 110 },
    { key: "car_sales_promotion_per_month", value: 0, description: "Sales promotion costs per month.", category: "car", applies: "per_month", appliesTo: "sales_promotion", sort: 120 },
    { key: "car_vehicle_costs_per_month", value: 0, description: "Vehicle costs per month.", category: "car", applies: "per_month", appliesTo: "vehicle_costs", sort: 130 },
    { key: "car_equipment_per_month", value: 0, description: "Equipment costs per month.", category: "car", applies: "per_month", appliesTo: "equipment", sort: 140 },
    { key: "car_stock_control_per_month", value: 0, description: "Stock control costs per month.", category: "car", applies: "per_month", appliesTo: "stock_control", sort: 150 },
    { key: "car_other_direct_per_month", value: 0, description: "Other direct costs (incl. bad debt) per month.", category: "car", applies: "per_month", appliesTo: "other_direct", sort: 160 },
    { key: "car_property_per_month", value: 0, description: "Property costs per month.", category: "car", applies: "per_month", appliesTo: "property", sort: 170 },
    { key: "car_total_interest_per_month", value: 0, description: "Total interest per month.", category: "car", applies: "per_month", appliesTo: "total_interest", sort: 180 },
    // ── Overheads sheet ──
    { key: "overheads_monthly_budget", value: 2014.61, description: "Default monthly General Overheads budget.", category: "overheads", applies: "special", appliesTo: null, sort: 10 },
  ];
  for (const s of seeds) {
    await db.run(sql`
      INSERT OR IGNORE INTO forecast_config (key, value, description, category, sort_order, updated_at, applies, applies_to_line_key)
      VALUES (${s.key}, ${s.value}, ${s.description}, ${s.category}, ${s.sort}, ${now}, ${s.applies}, ${s.appliesTo})
    `);
  }
  // Backfill the apply config on rows that pre-date the new columns
  // (in case the table was created before this seed change landed).
  await db.run(sql.raw(`UPDATE forecast_config SET applies = 'special' WHERE applies = ''`));

  // SalSac no longer needs its own chassis constant — it uses the
  // house charge directly (same as BEV).
  await db.run(sql.raw(`DELETE FROM forecast_config WHERE key = 'car_salsac_chassis_constant'`));

  // Percentages now live exclusively on the Vehicles tab — drop the
  // legacy seeded rows so they don't clutter the Costs tab.
  await db.run(sql.raw(`
    DELETE FROM forecast_config
    WHERE key IN (
      'car_dpa_pct',
      'car_dpa_half_year_pct',
      'car_guaranteed_margin_pct',
      'car_stocking_credits_pct',
      'cv_dpa_pct',
      'cv_frpa_pct',
      'cv_guaranteed_margin_pct',
      'cv_standards_pct',
      'cv_stocking_credits_pct',
      'cv_house_charge_per_unit'
    )
  `));

  // Older `special` rows for the per-unit/per-month cost set need
  // proper applies + line-key wiring so the Costs tab can toggle them.
  // Idempotent — re-running is safe; rows already correct don't change.
  const wires: Array<[string, "per_unit" | "per_month", string]> = [
    ["car_pdi_prep_per_unit",            "per_unit",  "pdi_prep"],
    ["car_cleaning_per_unit",            "per_unit",  "cleaning"],
    ["car_sales_commission_per_unit",    "per_unit",  "sales_commissions"],
    ["car_collection_delivery_per_unit", "per_unit",  "collection_delivery"],
    ["car_personnel_per_month",          "per_month", "personnel"],
    ["car_sales_promotion_per_month",    "per_month", "sales_promotion"],
    ["car_vehicle_costs_per_month",      "per_month", "vehicle_costs"],
    ["car_equipment_per_month",          "per_month", "equipment"],
    ["car_stock_control_per_month",      "per_month", "stock_control"],
    ["car_other_direct_per_month",       "per_month", "other_direct"],
    ["car_property_per_month",           "per_month", "property"],
    ["car_total_interest_per_month",     "per_month", "total_interest"],
  ];
  for (const [key, applies, lineKey] of wires) {
    await db.run(sql`
      UPDATE forecast_config
      SET applies = ${applies}, applies_to_line_key = ${lineKey}
      WHERE key = ${key}
    `);
  }
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
    // Phase 7 — Ford 1N/1F finance programme + computed pricing
    // breakdown that drove the quote. Null on legacy rows.
    { name: "finance_programme", sqlType: "TEXT" },
    { name: "retail_price_gbp", sqlType: "REAL" },
    { name: "customer_discount_gbp", sqlType: "REAL" },
    { name: "delivery_costs_gbp", sqlType: "REAL" },
    { name: "dealer_profit_gbp", sqlType: "REAL" },
  ]);
  // Phase 7 pricing components on cash-values, finance programme on rates.
  await ensureColumns("broker_vehicle_cash_values", [
    { name: "retail_price_gbp", sqlType: "REAL" },
    { name: "delivery_gbp", sqlType: "REAL" },
    { name: "pdi_plates_gbp", sqlType: "REAL" },
    { name: "first_reg_fee_gbp", sqlType: "REAL" },
    { name: "rfl_gbp", sqlType: "REAL" },
    { name: "trading_margin_pct", sqlType: "REAL" },
    { name: "standards_pct", sqlType: "REAL" },
    { name: "vets_pct", sqlType: "REAL" },
    { name: "one_f_discount_pct", sqlType: "REAL" },
    { name: "dealer_profit_gbp", sqlType: "REAL" },
  ]);
  await ensureColumns("broker_interest_rates", [
    { name: "finance_programme", sqlType: "TEXT" },
  ]);

  // Phase 8 — universal pricing model. New tables that supersede
  // broker_vehicle_cash_values. Quote engine still reads the legacy table
  // until everything is migrated; admin builds the new model in parallel.
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS vehicle_master (
      id TEXT PRIMARY KEY,
      model_year TEXT NOT NULL,
      model TEXT NOT NULL,
      bodystyle TEXT NOT NULL,
      derivative TEXT NOT NULL,
      engine TEXT NOT NULL,
      drive TEXT NOT NULL,
      transmission TEXT NOT NULL,
      cap_code TEXT,
      cap_id TEXT,
      basic_list_price_gbp REAL NOT NULL,
      manufacturer_delivery_gbp REAL NOT NULL DEFAULT 0,
      fuel_type TEXT NOT NULL,
      is_van INTEGER NOT NULL,
      co2_g_km INTEGER,
      pivg_grant_gbp REAL NOT NULL DEFAULT 0,
      olev_grant_gbp REAL NOT NULL DEFAULT 0,
      one_f_discount_pct REAL NOT NULL DEFAULT 0,
      margin_bucket_id TEXT,
      profit_mode TEXT NOT NULL DEFAULT 'gbp',
      profit_value REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_vehicle_master_lookup ON vehicle_master(model_year, model, bodystyle, derivative, engine, transmission)`,
  ));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_vehicle_master_model ON vehicle_master(model, model_year)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS vehicle_options (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      option_code TEXT,
      label TEXT NOT NULL,
      price_gbp REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_vehicle_options_vehicle ON vehicle_options(vehicle_id)`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS margin_buckets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS margin_bucket_rules (
      id TEXT PRIMARY KEY,
      bucket_id TEXT NOT NULL,
      label TEXT NOT NULL,
      pct REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
  await db.run(sql.raw(
    `CREATE INDEX IF NOT EXISTS idx_margin_bucket_rules_bucket ON margin_bucket_rules(bucket_id)`,
  ));
  // Singleton settings — INSERT OR IGNORE seeds row id = 1 with the
  // standard defaults from the Stock List Generator. Admin edits in-place.
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS broker_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_reg_fee_gbp REAL NOT NULL DEFAULT 55,
      pdi_plates_gbp REAL NOT NULL DEFAULT 135,
      cv_rfl_ice_phev_gbp REAL NOT NULL DEFAULT 335,
      cv_rfl_bev_gbp REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `));
  const nowSec = Math.floor(Date.now() / 1000);
  await db.run(sql.raw(
    `INSERT OR IGNORE INTO broker_settings (id, first_reg_fee_gbp, pdi_plates_gbp, cv_rfl_ice_phev_gbp, cv_rfl_bev_gbp, updated_at) VALUES (1, 55, 135, 335, 0, ${nowSec})`,
  ));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS car_rfl_bands (
      id TEXT PRIMARY KEY,
      co2_from INTEGER NOT NULL,
      co2_to INTEGER NOT NULL,
      rfl_gbp REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `));
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
  // Seed strings for auto-population from group standings (R32 only;
  // R16 onwards already chains via next_fixture_number on settlement).
  await ensureColumns("wc_fixtures", [
    { name: "team1_seed", sqlType: "TEXT" },
    { name: "team2_seed", sqlType: "TEXT" },
  ]);

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
  await backfillR32FromGroupsIfNeeded();
}

// One-shot backfill for the case where group results were settled
// BEFORE the auto-propagation code shipped. Idempotent: maybePopulateR32
// short-circuits when the group stage isn't complete, or when all R32
// slots are already filled.
async function backfillR32FromGroupsIfNeeded() {
  try {
    const { maybePopulateR32 } = await import("@/lib/world-cup-settle");
    await maybePopulateR32("system:backfill");
  } catch (e) {
    // Never let the backfill break boot — the worst case is admin has
    // to re-enter a group result to re-trigger propagation manually.
    // eslint-disable-next-line no-console
    console.warn("world-cup R32 backfill skipped:", e instanceof Error ? e.message : e);
  }
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
    team1Seed?: string | null;
    team2Seed?: string | null;
  };
  const seed: Seed[] = (await import("@/lib/wc-fixtures-seed.json")).default as Seed[];
  for (const f of seed) {
    const kickoffMs = Math.floor(new Date(f.kickoffAt).getTime() / 1000);
    const t1Seed = f.team1Seed ?? null;
    const t2Seed = f.team2Seed ?? null;
    // Insert if missing (first boot).
    await db.run(sql`
      INSERT OR IGNORE INTO wc_fixtures
        (fixture_number, stage, group_name, kickoff_at, stadium, city, team1, team2, next_fixture_number, next_slot, team1_seed, team2_seed)
      VALUES
        (${f.fixtureNumber}, ${f.stage}, ${f.groupName}, ${kickoffMs}, ${f.stadium}, ${f.city}, ${f.team1}, ${f.team2}, ${f.nextFixtureNumber}, ${f.nextSlot}, ${t1Seed}, ${t2Seed})
    `);
    // When a seed string moves between boots (e.g. R32 scheme tweak),
    // clear the corresponding auto-populated team field so the next
    // propagation pass writes the new placement. We only do this when
    // the OLD seed was set AND the row currently has a result row —
    // wait, no: blank the slot whenever the seed differs. We're not
    // touching wc_results, so settled matches are untouched even if
    // the seed-driven name disappears for a moment.
    await db.run(sql`
      UPDATE wc_fixtures
      SET team1 = NULL
      WHERE fixture_number = ${f.fixtureNumber}
        AND team1_seed IS NOT NULL
        AND team1_seed != ${t1Seed ?? ""}
    `);
    await db.run(sql`
      UPDATE wc_fixtures
      SET team2 = NULL
      WHERE fixture_number = ${f.fixtureNumber}
        AND team2_seed IS NOT NULL
        AND team2_seed != ${t2Seed ?? ""}
    `);
    // Force-sync static metadata on every boot (cheap; UPDATE is a no-op
    // when the values already match). Doesn't touch team1/team2 itself.
    await db.run(sql`
      UPDATE wc_fixtures
      SET stage = ${f.stage},
          group_name = ${f.groupName},
          kickoff_at = ${kickoffMs},
          stadium = ${f.stadium},
          city = ${f.city},
          next_fixture_number = ${f.nextFixtureNumber},
          next_slot = ${f.nextSlot},
          team1_seed = ${t1Seed},
          team2_seed = ${t2Seed}
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
