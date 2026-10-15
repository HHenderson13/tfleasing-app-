import "server-only";

// Fuel Cost Calculator: every exported PDF, kept with who it was for and who
// made it, for /fuel-calculator/exports.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface FuelExport {
  id: string;
  createdAt: string;
  customerName: string;
  execName: string;
  segment: string | null;
  iceName: string | null;
  evName: string | null;
  savingMonthly: number | null;
  filename: string;
}

export async function saveFuelExport(e: Omit<FuelExport, "id" | "createdAt"> & { pdfBase64: string }): Promise<string> {
  const id = randomUUID();
  await db.run(sql`
    INSERT INTO fuel_exports (id, created_at, customer_name, exec_name, segment, ice_name, ev_name, saving_monthly, filename, pdf_base64)
    VALUES (${id}, ${Math.floor(Date.now() / 1000)}, ${e.customerName}, ${e.execName}, ${e.segment}, ${e.iceName}, ${e.evName}, ${e.savingMonthly}, ${e.filename}, ${e.pdfBase64})
  `);
  return id;
}

/** Newest first; every word searched must appear in the customer, exec or either vehicle. */
export async function listFuelExports(query: string, limit = 200): Promise<FuelExport[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const where = words.length
    ? sql`WHERE ${sql.join(words.map((w) => sql`lower(customer_name || ' ' || exec_name || ' ' || coalesce(ice_name, '') || ' ' || coalesce(ev_name, '')) LIKE ${`%${w}%`}`), sql` AND `)}`
    : sql``;
  const rows = await db.all<{ id: string; created_at: number; customer_name: string; exec_name: string; segment: string | null; ice_name: string | null; ev_name: string | null; saving_monthly: number | null; filename: string }>(sql`
    SELECT id, created_at, customer_name, exec_name, segment, ice_name, ev_name, saving_monthly, filename
    FROM fuel_exports ${where} ORDER BY created_at DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id, createdAt: new Date(Number(r.created_at) * 1000).toISOString(), customerName: r.customer_name, execName: r.exec_name,
    segment: r.segment, iceName: r.ice_name, evName: r.ev_name, savingMonthly: r.saving_monthly == null ? null : Number(r.saving_monthly), filename: r.filename,
  }));
}

export async function loadFuelExportPdf(id: string): Promise<{ filename: string; pdf: Buffer } | null> {
  const [r] = await db.all<{ filename: string; pdf_base64: string }>(sql`SELECT filename, pdf_base64 FROM fuel_exports WHERE id = ${id}`);
  return r ? { filename: r.filename, pdf: Buffer.from(r.pdf_base64, "base64") } : null;
}
