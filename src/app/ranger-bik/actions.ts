"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { saveRangerExport } from "@/lib/ranger-exports";
import { canWork, getProfile } from "@/lib/customer-profiles-store";

/** Keep a copy of an exported PDF. Any signed-in user. */
export async function saveRangerExportAction(input: {
  filename: string; customerName: string; vehicles: string; bestName: string | null; savingAnnual: number | null; savingMonthly: number | null; pdfBase64: string; profileId?: string | null;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (typeof input.pdfBase64 !== "string" || !input.pdfBase64.startsWith("JVBER") || input.pdfBase64.length > 4_000_000) return { ok: false };
  const t = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
  const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  try {
    // Saved to the Customer Profile it came from, if they can work on that profile.
    const p = typeof input.profileId === "string" && /^[0-9a-f-]{36}$/.test(input.profileId) ? await getProfile(input.profileId) : null;
    await saveRangerExport({
      profileId: p && canWork(user, p.ownerId) ? p.id : null,
      filename: t(input.filename), customerName: t(input.customerName), execName: user.name || user.email,
      vehicles: t(input.vehicles, 600), bestName: t(input.bestName) || null,
      savingAnnual: finite(input.savingAnnual), savingMonthly: finite(input.savingMonthly),
      pdfBase64: input.pdfBase64,
    });
    revalidatePath("/ranger-bik/exports");
    return { ok: true };
  } catch (e) {
    logError("ranger-bik/save-export", e);
    return { ok: false };
  }
}
