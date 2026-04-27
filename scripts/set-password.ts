import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error("Usage: tsx scripts/set-password.ts <email> <password>");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const r = await c.execute({
    sql: "UPDATE users SET password_hash = ?, setup_token = NULL, setup_token_expires_at = NULL WHERE email = ?",
    args: [hash, email],
  });
  console.log(`Updated ${r.rowsAffected} row(s) for ${email}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
