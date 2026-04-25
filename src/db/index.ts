import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";

const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "tf.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Ensure additive columns exist (SQLite ADD COLUMN is safe/idempotent when guarded).
const vehicleCols = sqlite.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[];
const haveV = new Set(vehicleCols.map((c) => c.name));
if (vehicleCols.length && !haveV.has("fuel_type")) sqlite.exec("ALTER TABLE vehicles ADD COLUMN fuel_type TEXT");

const mdCols = sqlite.prepare("PRAGMA table_info(model_discounts)").all() as { name: string }[];
const haveMD = new Set(mdCols.map((c) => c.name));
if (mdCols.length && !haveMD.has("additional_discounts_gbp")) {
  sqlite.exec("ALTER TABLE model_discounts ADD COLUMN additional_discounts_gbp REAL NOT NULL DEFAULT 0");
}
if (mdCols.length && !haveMD.has("novuna_chip_3yr")) {
  sqlite.exec("ALTER TABLE model_discounts ADD COLUMN novuna_chip_3yr REAL");
}
if (mdCols.length && !haveMD.has("novuna_chip_4yr")) {
  sqlite.exec("ALTER TABLE model_discounts ADD COLUMN novuna_chip_4yr REAL");
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS saved_discount_keys (
  cap_code TEXT PRIMARY KEY,
  discount_key TEXT NOT NULL
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS sales_execs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS group_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'car',
  created_at INTEGER NOT NULL
)`);
const gsCols = sqlite.prepare("PRAGMA table_info(group_sites)").all() as { name: string }[];
const haveGS = new Set(gsCols.map((c) => c.name));
if (gsCols.length && !haveGS.has("kind")) {
  sqlite.exec("ALTER TABLE group_sites ADD COLUMN kind TEXT NOT NULL DEFAULT 'car'");
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  sales_exec_id TEXT,
  cap_code TEXT NOT NULL,
  model TEXT NOT NULL,
  derivative TEXT NOT NULL,
  contract TEXT NOT NULL,
  maintenance TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  annual_mileage INTEGER NOT NULL,
  initial_rental_multiplier INTEGER NOT NULL,
  funder_id TEXT NOT NULL,
  funder_name TEXT NOT NULL,
  funder_rank INTEGER NOT NULL,
  monthly_rental REAL NOT NULL,
  parent_proposal_id TEXT,
  status TEXT NOT NULL DEFAULT 'proposal_received',
  underwriting_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_customer ON proposals(customer_id)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)`);

const propCols = sqlite.prepare("PRAGMA table_info(proposals)").all() as { name: string }[];
const haveP = new Set(propCols.map((c) => c.name));
const addCol = (name: string, def: string) => { if (!haveP.has(name)) sqlite.exec(`ALTER TABLE proposals ADD COLUMN ${name} ${def}`); };
if (propCols.length) {
  addCol("finance_proposal_number", "TEXT");
  addCol("accepted_at", "INTEGER");
  addCol("chip_confirmed", "INTEGER NOT NULL DEFAULT 0");
  addCol("motor_complete_signed", "INTEGER NOT NULL DEFAULT 0");
  addCol("finance_agreement_signed", "INTEGER NOT NULL DEFAULT 0");
  addCol("order_number", "TEXT");
  addCol("vin", "TEXT");
  addCol("is_broker", "INTEGER NOT NULL DEFAULT 0");
  addCol("broker_name", "TEXT");
  addCol("broker_email", "TEXT");
  addCol("is_group_bq", "INTEGER NOT NULL DEFAULT 0");
  addCol("group_site_id", "TEXT");
}

// Drop NOT NULL from proposals.sales_exec_id on existing DBs (BQ deals have no exec).
{
  const info = sqlite.prepare("PRAGMA table_info(proposals)").all() as { name: string; notnull: number }[];
  const sec = info.find((c) => c.name === "sales_exec_id");
  if (sec && sec.notnull === 1) {
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(`CREATE TABLE proposals_new (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        sales_exec_id TEXT,
        cap_code TEXT NOT NULL,
        model TEXT NOT NULL,
        derivative TEXT NOT NULL,
        contract TEXT NOT NULL,
        maintenance TEXT NOT NULL,
        term_months INTEGER NOT NULL,
        annual_mileage INTEGER NOT NULL,
        initial_rental_multiplier INTEGER NOT NULL,
        funder_id TEXT NOT NULL,
        funder_name TEXT NOT NULL,
        funder_rank INTEGER NOT NULL,
        monthly_rental REAL NOT NULL,
        parent_proposal_id TEXT,
        status TEXT NOT NULL DEFAULT 'proposal_received',
        underwriting_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finance_proposal_number TEXT,
        accepted_at INTEGER,
        chip_confirmed INTEGER NOT NULL DEFAULT 0,
        motor_complete_signed INTEGER NOT NULL DEFAULT 0,
        finance_agreement_signed INTEGER NOT NULL DEFAULT 0,
        order_number TEXT,
        vin TEXT,
        is_broker INTEGER NOT NULL DEFAULT 0,
        broker_name TEXT,
        broker_email TEXT,
        is_group_bq INTEGER NOT NULL DEFAULT 0,
        group_site_id TEXT
      )`);
      sqlite.exec(`INSERT INTO proposals_new (
        id, customer_id, sales_exec_id, cap_code, model, derivative, contract, maintenance,
        term_months, annual_mileage, initial_rental_multiplier, funder_id, funder_name, funder_rank,
        monthly_rental, parent_proposal_id, status, underwriting_notes, created_at, updated_at,
        finance_proposal_number, accepted_at, chip_confirmed, motor_complete_signed,
        finance_agreement_signed, order_number, vin, is_broker, broker_name, broker_email,
        is_group_bq, group_site_id
      ) SELECT
        id, customer_id, sales_exec_id, cap_code, model, derivative, contract, maintenance,
        term_months, annual_mileage, initial_rental_multiplier, funder_id, funder_name, funder_rank,
        monthly_rental, parent_proposal_id, status, underwriting_notes, created_at, updated_at,
        finance_proposal_number, accepted_at, chip_confirmed, motor_complete_signed,
        finance_agreement_signed, order_number, vin, is_broker, broker_name, broker_email,
        is_group_bq, group_site_id
      FROM proposals`);
      sqlite.exec("DROP TABLE proposals");
      sqlite.exec("ALTER TABLE proposals_new RENAME TO proposals");
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_proposals_customer ON proposals(customer_id)");
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)");
      sqlite.exec("COMMIT");
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  }
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS proposal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal ON proposal_events(proposal_id)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS stage_check_defs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  applies_to_bq INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS proposal_stage_checks (
  proposal_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, check_id)
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS stock_settings (
  id TEXT PRIMARY KEY,
  workbook_password TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);
sqlite.prepare(
  "INSERT OR IGNORE INTO stock_settings (id, workbook_password, updated_at) VALUES ('default', 'Ftru', ?)"
).run(Date.now());

sqlite.exec(`CREATE TABLE IF NOT EXISTS stock_uploads (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  vehicle_count INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS stock_vehicles (
  vin TEXT PRIMARY KEY,
  model_raw TEXT,
  model_year TEXT,
  body_style TEXT,
  series_raw TEXT,
  engine TEXT,
  transmission TEXT,
  drive TEXT,
  colour_raw TEXT,
  options TEXT,
  order_no TEXT,
  location_status TEXT,
  gate_release_at INTEGER,
  eta_at INTEGER,
  dealer_raw TEXT,
  destination_raw TEXT,
  source_sheet TEXT,
  upload_id TEXT NOT NULL
)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_stock_vehicles_model ON stock_vehicles(model_raw)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_stock_vehicles_dealer ON stock_vehicles(dealer_raw)`);
{
  const cols = sqlite.prepare("PRAGMA table_info(stock_vehicles)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("derivative_raw")) sqlite.exec("ALTER TABLE stock_vehicles ADD COLUMN derivative_raw TEXT");
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS stock_mappings (
  kind TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  group_site_id TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, raw_key)
)`);
{
  const cols = sqlite.prepare("PRAGMA table_info(stock_mappings)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("promote_to_variant")) {
    sqlite.exec("ALTER TABLE stock_mappings ADD COLUMN promote_to_variant INTEGER NOT NULL DEFAULT 0");
  }
}

export const db = drizzle(sqlite, { schema });
export { schema };
