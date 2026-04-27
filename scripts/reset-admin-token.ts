import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";

async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const email = process.argv[2] ?? "harry.henderson@trustford.co.uk";
  const token = randomBytes(24).toString("hex");
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
  await c.execute({
    sql: "UPDATE users SET setup_token = ?, setup_token_expires_at = ?, password_hash = '' WHERE email = ?",
    args: [token, expires, email],
  });
  console.log(`Setup link:  /setup?token=${token}`);
  console.log(`(${email}, valid 7 days)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
