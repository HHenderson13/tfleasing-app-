/**
 * One-shot migration: local SQLite (data/tf.db) → Turso.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://...turso.io \
 *   TURSO_AUTH_TOKEN=eyJ... \
 *   npx tsx scripts/migrate-to-turso.ts
 *
 * Reads the schema directly from the local DB (sqlite_master) so it always
 * matches whatever has been added by recent migrations. Re-running is safe:
 * each table is dropped and recreated on Turso before data is copied in.
 *
 * Also seeds an initial admin user (Harry Henderson) with a setup token
 * printed to the terminal — visit /setup?token=... to set the first password.
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const LOCAL = process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "tf.db");

if (!TURSO_URL) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const local = new Database(LOCAL, { readonly: true });

interface MasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

function getMaster(): MasterRow[] {
  return local
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL",
    )
    .all() as MasterRow[];
}

async function applySchema(master: MasterRow[]) {
  // Drop existing objects first so re-runs are clean. Order: indexes → tables.
  const tables = master.filter((m) => m.type === "table").map((m) => m.name);
  const indexes = master.filter((m) => m.type === "index").map((m) => m.name);
  for (const idx of indexes) await turso.execute(`DROP INDEX IF EXISTS ${idx}`);
  for (const tbl of tables) await turso.execute(`DROP TABLE IF EXISTS ${tbl}`);
  // Recreate. Tables before indexes.
  for (const m of master) {
    if (m.type === "table" && m.sql) await turso.execute(m.sql);
  }
  for (const m of master) {
    if (m.type === "index" && m.sql) await turso.execute(m.sql);
  }
}

async function copyTable(name: string) {
  const rows = local.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${name} (${cols.join(",")}) VALUES (${placeholders})`;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await turso.batch(
      slice.map((r) => ({ sql, args: cols.map((c) => r[c] as never) })),
      "write",
    );
  }
  console.log(`  ${name}: ${rows.length} rows`);
}

async function seedAdmin() {
  const email = "harry.henderson@trustford.co.uk";
  const existing = await turso.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email],
  });
  if (existing.rows.length > 0) {
    console.log(`Admin ${email} already exists, skipping seed.`);
    return;
  }
  const id = randomUUID();
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const expires = now + 1000 * 60 * 60 * 24 * 7; // 7 days
  await turso.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, roles, sales_exec_id, created_at, updated_at, setup_token, setup_token_expires_at)
          VALUES (?, ?, ?, '', ?, NULL, ?, ?, ?, ?)`,
    args: [id, "Harry Henderson", email, JSON.stringify(["admin"]), now, now, token, expires],
  });
  console.log(`\nSeeded admin: ${email}`);
  console.log(`Setup link:    /setup?token=${token}`);
  console.log(`(valid 7 days)`);
}

async function main() {
  console.log(`Local:  ${LOCAL}`);
  console.log(`Turso:  ${TURSO_URL}\n`);

  const master = getMaster();
  const tables = master.filter((m) => m.type === "table").map((m) => m.name);

  console.log(`Applying schema (${tables.length} tables)…`);
  await applySchema(master);

  console.log("Copying data…");
  for (const t of tables) await copyTable(t);

  console.log("\nSeeding admin…");
  await seedAdmin();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
