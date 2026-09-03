/**
 * One-shot drop of the tables left behind by the broker quote engine.
 *
 * The portal was rebuilt as stock-only (see AGENTS.md). The code went in
 * that change, but schema changes here are additive-only, so the tables
 * stayed in the database, inert. This is the deliberate cleanup.
 *
 * Drops (nothing in src/ references any of them):
 *   broker_business_discounts   broker_ofp_uploads          car_rfl_bands
 *   broker_ev_offers            broker_quotes               margin_buckets
 *   broker_interest_rates       broker_settings             margin_bucket_rules
 *   broker_ofp_data             broker_stock_turn_rules     vehicle_master
 *   broker_test_drive_offers    broker_trade_in_offers      vehicle_options
 *   broker_vehicle_cash_values
 *
 * KEEPS brokers / broker_users / broker_sessions — those are the live
 * broker auth stack and still very much in use.
 *
 * Dry run by default: it prints a row count per table and drops nothing.
 * A table holding rows is skipped even with --commit unless you also pass
 * --force, because a non-empty table here means production had data the
 * local copy never saw, and that is worth looking at before it is gone.
 *
 * Run against local dev:
 *   npx tsx scripts/drop-legacy-broker-tables.ts                # report
 *   npx tsx scripts/drop-legacy-broker-tables.ts --commit
 *
 * Run against production — take a Turso backup first:
 *   turso db shell <db> .dump > backup.sql
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... \
 *     npx tsx scripts/drop-legacy-broker-tables.ts --commit
 */
import { createClient } from "@libsql/client";

const TABLES = [
  "broker_business_discounts",
  "broker_ev_offers",
  "broker_interest_rates",
  "broker_ofp_data",
  "broker_ofp_uploads",
  "broker_quotes",
  "broker_settings",
  "broker_stock_turn_rules",
  "broker_test_drive_offers",
  "broker_trade_in_offers",
  "broker_vehicle_cash_values",
  "car_rfl_bands",
  "margin_buckets",
  "margin_bucket_rules",
  "vehicle_master",
  "vehicle_options",
];

// Belt and braces: the live broker auth tables share the prefix, and a
// typo above must never be able to take one out.
const NEVER_DROP = new Set(["brokers", "broker_users", "broker_sessions"]);

const commit = process.argv.includes("--commit");
const force = process.argv.includes("--force");

const url = process.env.TURSO_DATABASE_URL ?? "file:data/tf.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

async function main() {
  console.log(`Database: ${url}`);
  console.log(commit ? (force ? "Mode: COMMIT (forced)" : "Mode: COMMIT") : "Mode: dry run — nothing will be dropped");
  console.log("");

  const existing = new Set(
    (await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => String(r.name)),
  );

  let dropped = 0;
  let skipped = 0;
  for (const t of TABLES) {
    if (NEVER_DROP.has(t)) throw new Error(`Refusing to drop live table ${t}`);
    if (!existing.has(t)) {
      console.log(`  ${t.padEnd(30)} absent`);
      continue;
    }
    const rows = Number((await client.execute(`SELECT COUNT(*) c FROM "${t}"`)).rows[0].c);
    if (rows > 0 && !force) {
      console.log(`  ${t.padEnd(30)} ${String(rows).padStart(6)} rows  ← SKIPPED, has data (re-run with --force)`);
      skipped++;
      continue;
    }
    if (!commit) {
      console.log(`  ${t.padEnd(30)} ${String(rows).padStart(6)} rows  would drop`);
      continue;
    }
    await client.execute(`DROP TABLE IF EXISTS "${t}"`);
    console.log(`  ${t.padEnd(30)} ${String(rows).padStart(6)} rows  dropped`);
    dropped++;
  }

  console.log("");
  if (!commit) console.log("Dry run. Re-run with --commit to apply.");
  else console.log(`Dropped ${dropped} table(s)${skipped ? `, skipped ${skipped} holding data` : ""}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
