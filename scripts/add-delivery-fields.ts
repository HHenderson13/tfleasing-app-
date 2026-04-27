/**
 * One-shot DDL migration to add the customer-handover fields.
 *
 * Adds:
 *   - proposals.delivery_booked_at (timestamp, nullable)
 *   - proposals.reg_number (text, nullable)
 *   - proposals.delivered_at (timestamp, nullable)
 *   - stage_check_defs.stage (text, default 'order')
 * Seeds default delivery-stage checks (Invoiced, Taxed, PDI + Plates pushed,
 * Delivery pack submitted to funder) — only if no delivery checks already
 * exist.
 *
 * Run against Turso:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... \
 *     npx tsx scripts/add-delivery-fields.ts
 *
 * Re-running is safe: each ALTER is wrapped in a try/catch so existing columns
 * don't fail the script, and the seed step skips if delivery checks exist.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function tryExec(sql: string, label: string) {
  try {
    await client.execute(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate column|already exists/i.test(msg)) {
      console.log(`· ${label} (already applied)`);
    } else {
      console.error(`✗ ${label}: ${msg}`);
      throw e;
    }
  }
}

async function main() {
  await tryExec(
    "ALTER TABLE proposals ADD COLUMN delivery_booked_at INTEGER",
    "Add proposals.delivery_booked_at",
  );
  await tryExec(
    "ALTER TABLE proposals ADD COLUMN reg_number TEXT",
    "Add proposals.reg_number",
  );
  await tryExec(
    "ALTER TABLE proposals ADD COLUMN delivered_at INTEGER",
    "Add proposals.delivered_at",
  );
  await tryExec(
    "ALTER TABLE stage_check_defs ADD COLUMN stage TEXT NOT NULL DEFAULT 'order'",
    "Add stage_check_defs.stage",
  );

  // Seed default delivery checks if none exist.
  const existing = await client.execute(
    "SELECT COUNT(*) AS n FROM stage_check_defs WHERE stage = 'delivery'",
  );
  const n = Number(existing.rows[0]?.n ?? 0);
  if (n > 0) {
    console.log(`· Delivery checks already seeded (${n} rows) — skipping.`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const seeds = [
    { id: "invoiced", label: "Invoiced", sort: 10 },
    { id: "taxed", label: "Taxed", sort: 20 },
    { id: "pdi-plates", label: "PDI + Plates pushed", sort: 30 },
    { id: "delivery-pack", label: "Delivery pack submitted to funder", sort: 40 },
  ];
  for (const s of seeds) {
    await client.execute({
      sql: "INSERT INTO stage_check_defs (id, label, sort_order, applies_to_bq, stage, created_at) VALUES (?, ?, ?, 1, 'delivery', ?)",
      args: [s.id, s.label, s.sort, now],
    });
    console.log(`✓ Seed: ${s.label}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
