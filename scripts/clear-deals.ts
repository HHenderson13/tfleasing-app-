/**
 * One-shot wipe of dummy deal data.
 *
 * Clears: proposals, proposal_events, proposal_stage_checks,
 *         proposal_eta_snapshots, customers.
 * Keeps:  funders, ratebooks, stock, sales execs, group sites,
 *         stage check defs, users.
 *
 * Run:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... \
 *     npx tsx scripts/clear-deals.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}

const client = createClient({ url, authToken });

const tables = [
  "proposal_stage_checks",
  "proposal_eta_snapshots",
  "proposal_events",
  "proposals",
  "customers",
];

async function main() {
  for (const t of tables) {
    const before = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    const n = Number(before.rows[0]?.n ?? 0);
    await client.execute(`DELETE FROM ${t}`);
    console.log(`✓ ${t}: deleted ${n} rows`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
