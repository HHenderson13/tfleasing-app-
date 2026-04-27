import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL
  ?? `file:${process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "tf.db")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
export { schema };
