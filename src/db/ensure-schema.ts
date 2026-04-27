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
  await seedDefaultDeliveryChecks();
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
