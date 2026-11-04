import "server-only";

// Ranger BIK Calculator: every exported PDF, kept with who it was for and who
// made it, for /ranger-bik/exports. Same shape as fuel-exports.ts.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface RangerExport {
  id: string;
  createdAt: string;
  customerName: string;
  execName: string;
  /** Every Ranger compared, in order, comma separated. */
  vehicles: string;
  /** The one saving the most against the first, if any. */
  bestName: string | null;
  savingAnnual: number | null;
  savingMonthly: number | null;
  filename: string;
}

export async function saveRangerExport(e: Omit<RangerExport, "id" | "createdAt"> & { pdfBase64: string }): Promise<string> {
  const id = randomUUID();
  await db.run(sql`
    INSERT INTO ranger_exports (id, created_at, customer_name, exec_name, vehicles, best_name, saving_annual, saving_monthly, filename, pdf_base64)
    VALUES (${id}, ${Math.floor(Date.now() / 1000)}, ${e.customerName}, ${e.execName}, ${e.vehicles}, ${e.bestName}, ${e.savingAnnual}, ${e.savingMonthly}, ${e.filename}, ${e.pdfBase64})
  `);
  return id;
}

/** Newest first; every word searched must appear in the customer, exec or vehicles. */
export async function listRangerExports(query: string, limit = 200): Promise<RangerExport[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const where = words.length
    ? sql`WHERE ${sql.join(words.map((w) => sql`lower(customer_name || ' ' || exec_name || ' ' || vehicles) LIKE ${`%${w}%`}`), sql` AND `)}`
    : sql``;
  const rows = await db.all<{ id: string; created_at: number; customer_name: string; exec_name: string; vehicles: string; best_name: string | null; saving_annual: number | null; saving_monthly: number | null; filename: string }>(sql`
    SELECT id, created_at, customer_name, exec_name, vehicles, best_name, saving_annual, saving_monthly, filename
    FROM ranger_exports ${where} ORDER BY created_at DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id, createdAt: new Date(Number(r.created_at) * 1000).toISOString(), customerName: r.customer_name, execName: r.exec_name,
    vehicles: r.vehicles, bestName: r.best_name, savingAnnual: r.saving_annual == null ? null : Number(r.saving_annual),
    savingMonthly: r.saving_monthly == null ? null : Number(r.saving_monthly), filename: r.filename,
  }));
}

export async function loadRangerExportPdf(id: string): Promise<{ filename: string; pdf: Buffer } | null> {
  const [r] = await db.all<{ filename: string; pdf_base64: string }>(sql`SELECT filename, pdf_base64 FROM ranger_exports WHERE id = ${id}`);
  return r ? { filename: r.filename, pdf: Buffer.from(r.pdf_base64, "base64") } : null;
}
