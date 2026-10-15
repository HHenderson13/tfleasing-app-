"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireQuoteAccess } from "@/lib/auth-guard";
import { saveFuelExport } from "@/lib/fuel-exports";
import { logError } from "@/lib/logger";
import { deleteFuelVehicle, refreshFuelPrices, setPriceOverride, upsertFuelVehicles, type RefreshReport } from "@/lib/fuel-prices";
import { parseVehiclePaste, type PasteResult } from "@/lib/fuel-vehicle-paste";

const revalidate = () => { revalidatePath("/fuel-calculator"); revalidatePath("/fuel-calculator/admin"); };

/** Check every price source now, rather than waiting for the daily run. Admin only. */
export async function refreshFuelPricesAction(): Promise<{ ok: boolean; reports?: RefreshReport[]; error?: string }> {
  await requireAdmin();
  try {
    const reports = await refreshFuelPrices();
    revalidate();
    return { ok: true, reports };
  } catch (e) {
    logError("fuel-calculator/refresh", e);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't check the sources." };
  }
}

const overrideSchema = z.object({
  key: z.enum(["petrol", "diesel", "home_overnight", "home_standard", "depot", "public_rapid"]),
  value: z.number().positive().max(500).nullable(),
});

/** A manager's own figure for a price (pence), or null to go back to the source. Admin only. */
export async function setPriceOverrideAction(input: { key: string; value: number | null }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAdmin();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a price in pence, more than 0." };
  await setPriceOverride(parsed.data.key, parsed.data.value, user.name || user.email);
  revalidate();
  return { ok: true };
}

/** Add or update vehicles from pasted rows. Nothing is saved if any row is wrong. Admin only. */
export async function importFuelVehiclesAction(input: { text: string; powertrain: "ice" | "ev"; source: string }): Promise<{ ok: boolean; parsed?: PasteResult; added?: number; updated?: number; error?: string }> {
  await requireAdmin();
  if (input.powertrain !== "ice" && input.powertrain !== "ev") return { ok: false, error: "Choose petrol / diesel or electric." };
  if (typeof input.text !== "string" || input.text.length > 500_000) return { ok: false, error: "That paste is too large." };
  const parsed = parseVehiclePaste(input.text, input.powertrain);
  if (parsed.errors.length) return { ok: false, parsed, error: `${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} need fixing, so nothing was saved.` };
  if (!parsed.rows.length) return { ok: false, parsed, error: "No vehicles found in that paste." };
  const source = String(input.source ?? "").trim().slice(0, 200) || (input.powertrain === "ev" ? "WLTP miles per kWh" : "WLTP combined MPG");
  try {
    const { added, updated } = await upsertFuelVehicles(parsed.rows.map((r) => ({ ...r, source })));
    revalidate();
    return { ok: true, parsed, added, updated };
  } catch (e) {
    logError("fuel-calculator/import", e);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the vehicles." };
  }
}

export async function deleteFuelVehicleAction(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  if (!/^[0-9a-f]{16}$/.test(id)) return { ok: false };
  await deleteFuelVehicle(id);
  revalidate();
  return { ok: true };
}

/** Keep a copy of an exported PDF. Anyone who can use the calculator. */
export async function saveFuelExportAction(input: {
  filename: string; customerName: string; segment: string; iceName: string; evName: string; savingMonthly: number; pdfBase64: string;
}): Promise<{ ok: boolean }> {
  const user = await requireQuoteAccess();
  if (typeof input.pdfBase64 !== "string" || !input.pdfBase64.startsWith("JVBER") || input.pdfBase64.length > 4_000_000) return { ok: false };
  const t = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
  try {
    await saveFuelExport({
      filename: t(input.filename), customerName: t(input.customerName), execName: user.name || user.email,
      segment: t(input.segment, 10) || null, iceName: t(input.iceName) || null, evName: t(input.evName) || null,
      savingMonthly: Number.isFinite(input.savingMonthly) ? input.savingMonthly : null, pdfBase64: input.pdfBase64,
    });
    revalidatePath("/fuel-calculator/exports");
    return { ok: true };
  } catch (e) {
    logError("fuel-calculator/save-export", e);
    return { ok: false };
  }
}
