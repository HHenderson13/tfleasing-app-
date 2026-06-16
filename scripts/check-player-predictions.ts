// One-off CLI: list a player's predictions for unsettled fixtures.
// Run from the project root:
//
//   npx tsx scripts/check-player-predictions.ts malejczyk
//
// The script loads .env.production.local itself (Node ≥21.7 has
// process.loadEnvFile baked in), so you don't need any flags or shell
// magic — just have that file present, which `vercel env pull
// .env.production.local --environment=production` creates for you.
//
// Name argument is case-insensitive and matches anywhere in the stored
// user name. Skips fixtures that already have a result recorded.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

// Minimal dotenv parser. Used instead of Node's process.loadEnvFile because
// loadEnvFile silently skips any key already present in process.env — even
// when it's set to empty string (which is exactly what `source .env.…`
// leaves behind when it fails to unquote the libsql URL). This one
// unconditionally overrides, which is what we want for a one-off CLI.
function loadEnvFromFile(path: string): number {
  const text = readFileSync(path, "utf-8");
  let loaded = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding single OR double quotes (Vercel uses doubles).
    if (value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded++;
  }
  return loaded;
}

async function main() {
  const NAME = (process.argv[2] ?? "").trim();
  if (!NAME) {
    console.error("Usage: npx tsx scripts/check-player-predictions.ts <name-fragment>");
    process.exit(1);
  }

  // Load env file ourselves — see loadEnvFromFile above for why we don't
  // use process.loadEnvFile(). Prod file first; falls back to plain
  // .env.local so this also works in local dev.
  for (const c of [".env.production.local", ".env.local"]) {
    const p = resolve(process.cwd(), c);
    if (existsSync(p)) {
      const n = loadEnvFromFile(p);
      console.error(`[loaded ${n} keys from ${c}]`);
      break;
    }
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN still missing after loading env file.");
    console.error("Re-run `vercel env pull .env.production.local --environment=production` first.");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  const result = await client.execute({
    sql: `
      SELECT
        u.name                AS user_name,
        f.fixture_number      AS fixture_number,
        f.stage               AS stage,
        f.group_name          AS group_name,
        f.kickoff_at          AS kickoff_at,
        f.team1               AS team1,
        f.team2               AS team2,
        p.team1_goals         AS pick_t1,
        p.team2_goals         AS pick_t2,
        p.updated_at          AS prediction_updated_at
      FROM wc_predictions p
      JOIN wc_fixtures f ON f.fixture_number = p.fixture_number
      JOIN users u ON u.id = p.user_id
      LEFT JOIN wc_results r ON r.fixture_number = p.fixture_number
      WHERE LOWER(u.name) LIKE ?
        AND r.fixture_number IS NULL
      ORDER BY f.kickoff_at, f.fixture_number
    `,
    args: [`%${NAME.toLowerCase()}%`],
  });

  if (result.rows.length === 0) {
    console.log(`No unsettled predictions found for any user matching "${NAME}".`);
    return;
  }

  // Group by user so multiple matches print cleanly.
  const byUser = new Map<string, typeof result.rows>();
  for (const r of result.rows) {
    const key = String(r.user_name);
    const arr = byUser.get(key) ?? [];
    arr.push(r);
    byUser.set(key, arr);
  }

  // kickoff_at can come back as a number of seconds (SQLite timestamp mode)
  // OR as an ISO string depending on driver version — handle both.
  const ukFmt = (raw: unknown) => {
    let d: Date;
    if (typeof raw === "number") d = new Date(raw * (raw < 1e12 ? 1000 : 1));
    else d = new Date(String(raw));
    return d.toLocaleString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
    });
  };

  for (const [name, rows] of byUser) {
    console.log(`\n${name} — ${rows.length} unsettled prediction${rows.length === 1 ? "" : "s"}\n`);
    console.log("  #    Kickoff (UK)            Match                          Pick");
    console.log("  ──── ─────────────────────── ────────────────────────────── ──────");
    for (const r of rows) {
      const fx = String(r.fixture_number).padEnd(4);
      const ko = ukFmt(r.kickoff_at).padEnd(23);
      const match = `${r.team1} vs ${r.team2}`.padEnd(30);
      const pick = `${r.pick_t1}–${r.pick_t2}`;
      console.log(`  ${fx} ${ko} ${match} ${pick}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
