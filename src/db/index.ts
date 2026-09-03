import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "node:path";

// An env var set to "" is not a configured URL — treat blank as absent.
//
// `vercel env pull` writes TURSO_DATABASE_URL="" into .env.production.local
// (it won't expose a sensitive value locally), and `??` only falls back on
// null/undefined. The empty string therefore reached libsql and failed
// every local `npm run build` at the page-data step with a bare
// "URL_INVALID: The URL '' is not in a valid format".
const configuredUrl = process.env.TURSO_DATABASE_URL?.trim();
const configuredToken = process.env.TURSO_AUTH_TOKEN?.trim();

const localFile = `file:${process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "tf.db")}`;
const url = configuredUrl || localFile;

// Falling back is right locally and wrong anywhere else, so say so. This
// can't quietly serve an empty database in production: /data is gitignored
// and a deployed filesystem is read-only outside /tmp, so the fallback
// fails at open rather than pretending to work.
if (!configuredUrl) {
  console.warn(`[db] TURSO_DATABASE_URL is empty or unset — falling back to ${localFile}`);
}

const client = createClient({ url, authToken: configuredToken || undefined });

export const db = drizzle(client, { schema });
export { schema };
