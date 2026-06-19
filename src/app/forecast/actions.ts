"use server";
import { db } from "@/db";
import {
  forecastDealbookLines,
  forecastDealbookUploads,
  forecastActuals,
  forecastInputs,
  forecastConfig,
  forecastVehicles,
  forecastVehicleBonuses,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import {
  parseDealbookCsv,
  deriveDefaultMonth,
  loadForecastVehicles,
  DEALBOOK_SOURCES,
  type DealbookSource,
} from "@/lib/forecast";
import { classifyModel } from "@/lib/forecast-classify";
import { logError } from "@/lib/logger";

function isYyyymm(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export async function uploadDealbookAction(formData: FormData) {
  try {
    const me = await requireAdmin();
    const sourceRaw = String(formData.get("source") ?? "");
    const monthRaw = String(formData.get("month") ?? "");
    const file = formData.get("file");
    if (!DEALBOOK_SOURCES.includes(sourceRaw as DealbookSource)) {
      return { ok: false as const, error: "Pick a source." };
    }
    if (!isYyyymm(monthRaw)) {
      return { ok: false as const, error: "Pick a target month (YYYY-MM)." };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "Pick a CSV file." };
    }
    const source = sourceRaw as DealbookSource;
    const text = await file.text();
    const parsed = parseDealbookCsv(text);
    if (parsed.rows.length === 0) {
      return { ok: false as const, error: "No rows found in the CSV." };
    }

    const now = new Date();
    const uploadId = randomUUID();
    await db.insert(forecastDealbookUploads).values({
      id: uploadId,
      source,
      monthYyyymm: monthRaw,
      filename: (file as File).name || "dealbook.csv",
      rowCount: parsed.rows.length,
      uploadedAt: now,
      uploadedByUserId: me.id,
    });
    // Classify each row by its model text against the vehicle catalogue
    // so Car / Van rollups know which sheet to feed. Unknown rows surface
    // in the review window with a "needs adding" prompt.
    const vehicles = await loadForecastVehicles();
    let unknownCount = 0;
    // Insert lines in chunks to stay under SQLite variable limits.
    const CHUNK = 100;
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const slice = parsed.rows.slice(i, i + CHUNK);
      await db.insert(forecastDealbookLines).values(
        slice.map((r) => {
          const defaultMonth = deriveDefaultMonth(r, monthRaw);
          const classification = classifyModel(r.model, vehicles);
          if (classification.kind === "unknown") unknownCount++;
          return {
            id: randomUUID(),
            uploadId,
            source,
            defaultMonth,
            overrideMonth: null,
            effectiveMonth: defaultMonth,
            vehicleId: classification.vehicleId,
            kind: classification.kind,
            branch: r.branch,
            vehicleType: r.vehicleType,
            salesType: r.salesType,
            salesSubType: r.salesSubType,
            customerName: r.customerName,
            model: r.model,
            orderDate: r.orderDate,
            regDate: r.regDate,
            delivDate: r.delivDate,
            invoiceDate: r.invoiceDate,
            delivStatus: r.delivStatus,
            chassisProfit: r.chassisProfit,
            addBonus: r.addBonus,
            metalSubsidy: r.metalSubsidy,
            reconCost: r.reconCost,
            oallowDiscount: r.oallowDiscount,
            accessoryProfit: r.accessoryProfit,
            warrantyCost: r.warrantyCost,
            totalVehicleProfit: r.totalVehicleProfit,
            financeIncome: r.financeIncome,
            financeMb: r.financeMb,
            tyreInsIncome: r.tyreInsIncome,
            financeSubsidy: r.financeSubsidy,
            cpiIncome: r.cpiIncome,
            smartRepair: r.smartRepair,
            gapRtiIncome: r.gapRtiIncome,
            paintProtection: r.paintProtection,
            warranty: r.warranty,
            totalFiIncome: r.totalFiIncome,
            totalGrossProfit: r.totalGrossProfit,
            vin: r.vin,
            regNo: r.regNo,
            customerExternalId: r.customerExternalId,
            financeCo: r.financeCo,
            createdAt: now,
          };
        }),
      );
    }

    revalidatePath("/forecast");
    return {
      ok: true as const,
      uploadId,
      rowCount: parsed.rows.length,
      unknownCount,
      warnings: parsed.warnings,
    };
  } catch (e) {
    logError("forecast/uploadDealbookAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteUploadAction(uploadId: string) {
  try {
    await requireAdmin();
    // Lines first (no FK to enforce it, but logically owned).
    await db.delete(forecastDealbookLines).where(eq(forecastDealbookLines.uploadId, uploadId));
    await db.delete(forecastDealbookUploads).where(eq(forecastDealbookUploads.id, uploadId));
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/deleteUploadAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Set an override registration month on a single dealbook line. Empty
// string clears the override, returning the line to its default_month.
export async function setLineOverrideMonthAction(lineId: string, monthYyyymm: string | null) {
  try {
    await requireAdmin();
    const override = monthYyyymm && monthYyyymm.trim() ? monthYyyymm.trim() : null;
    if (override !== null && !isYyyymm(override)) {
      return { ok: false as const, error: "Month must be YYYY-MM." };
    }
    const [existing] = await db
      .select()
      .from(forecastDealbookLines)
      .where(eq(forecastDealbookLines.id, lineId))
      .limit(1);
    if (!existing) return { ok: false as const, error: "Line not found." };
    const effective = override ?? existing.defaultMonth;
    await db
      .update(forecastDealbookLines)
      .set({ overrideMonth: override, effectiveMonth: effective })
      .where(eq(forecastDealbookLines.id, lineId));
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/setLineOverrideMonthAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Bulk reassignment — useful when many lines from a single upload need
// the same override month (e.g. "all of these went into March instead").
export async function bulkOverrideMonthAction(lineIds: string[], monthYyyymm: string | null) {
  try {
    await requireAdmin();
    const override = monthYyyymm && monthYyyymm.trim() ? monthYyyymm.trim() : null;
    if (override !== null && !isYyyymm(override)) {
      return { ok: false as const, error: "Month must be YYYY-MM." };
    }
    for (const id of lineIds) {
      const [existing] = await db
        .select()
        .from(forecastDealbookLines)
        .where(eq(forecastDealbookLines.id, id))
        .limit(1);
      if (!existing) continue;
      const effective = override ?? existing.defaultMonth;
      await db
        .update(forecastDealbookLines)
        .set({ overrideMonth: override, effectiveMonth: effective })
        .where(eq(forecastDealbookLines.id, id));
    }
    revalidatePath("/forecast");
    return { ok: true as const, count: lineIds.length };
  } catch (e) {
    logError("forecast/bulkOverrideMonthAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Actuals (final accounts entry) ────────────────────────────────────────
export async function setActualAction(input: {
  monthYyyymm: string;
  sheet: "car" | "cv" | "overheads";
  lineKey: string;
  value: number | null;        // null = clear
}) {
  try {
    const me = await requireAdmin();
    if (!isYyyymm(input.monthYyyymm)) {
      return { ok: false as const, error: "Month must be YYYY-MM." };
    }
    const existingRows = await db
      .select()
      .from(forecastActuals)
      .where(and(
        eq(forecastActuals.monthYyyymm, input.monthYyyymm),
        eq(forecastActuals.sheet, input.sheet),
        eq(forecastActuals.lineKey, input.lineKey),
      ))
      .limit(1);
    const existingForSlot = existingRows[0] ?? null;
    if (input.value === null || Number.isNaN(input.value)) {
      if (existingForSlot) {
        await db.delete(forecastActuals).where(eq(forecastActuals.id, existingForSlot.id));
      }
    } else if (existingForSlot) {
      await db
        .update(forecastActuals)
        .set({ value: input.value, updatedAt: new Date(), updatedByUserId: me.id })
        .where(eq(forecastActuals.id, existingForSlot.id));
    } else {
      await db.insert(forecastActuals).values({
        id: randomUUID(),
        monthYyyymm: input.monthYyyymm,
        sheet: input.sheet,
        lineKey: input.lineKey,
        value: input.value,
        updatedAt: new Date(),
        updatedByUserId: me.id,
      });
    }
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/setActualAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Forecast scenario inputs ──────────────────────────────────────────────
// e.g. "additional_units: 12", "additional_margin_per_unit: 250".
export async function setInputAction(input: {
  monthYyyymm: string;
  sheet: "car" | "cv" | "overheads";
  scenarioKey: string;
  value: number | null;
}) {
  try {
    await requireAdmin();
    if (!isYyyymm(input.monthYyyymm)) {
      return { ok: false as const, error: "Month must be YYYY-MM." };
    }
    const existingRows = await db
      .select()
      .from(forecastInputs)
      .where(and(
        eq(forecastInputs.monthYyyymm, input.monthYyyymm),
        eq(forecastInputs.sheet, input.sheet),
        eq(forecastInputs.scenarioKey, input.scenarioKey),
      ))
      .limit(1);
    const existing = existingRows[0] ?? null;
    if (input.value === null || Number.isNaN(input.value)) {
      if (existing) await db.delete(forecastInputs).where(eq(forecastInputs.id, existing.id));
    } else if (existing) {
      await db
        .update(forecastInputs)
        .set({ value: input.value, updatedAt: new Date() })
        .where(eq(forecastInputs.id, existing.id));
    } else {
      await db.insert(forecastInputs).values({
        id: randomUUID(),
        monthYyyymm: input.monthYyyymm,
        sheet: input.sheet,
        scenarioKey: input.scenarioKey,
        value: input.value,
        updatedAt: new Date(),
      });
    }
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/setInputAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Admin config ──────────────────────────────────────────────────────────
export async function setConfigAction(key: string, value: number) {
  try {
    await requireAdmin();
    const [existing] = await db
      .select()
      .from(forecastConfig)
      .where(eq(forecastConfig.key, key))
      .limit(1);
    if (existing) {
      await db
        .update(forecastConfig)
        .set({ value, updatedAt: new Date() })
        .where(eq(forecastConfig.key, key));
    } else {
      return { ok: false as const, error: "Unknown config key." };
    }
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/setConfigAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Admin can add new config rows on the fly so they can introduce new
// percentages / multipliers without a code change.
export async function addConfigAction(input: {
  key: string;
  value: number;
  description: string;
  category: string;
}) {
  try {
    await requireAdmin();
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!key) return { ok: false as const, error: "Key required." };
    const existing = await db
      .select()
      .from(forecastConfig)
      .where(eq(forecastConfig.key, key))
      .limit(1);
    if (existing.length > 0) return { ok: false as const, error: "Key already exists." };
    await db.insert(forecastConfig).values({
      key,
      value: input.value,
      description: input.description || null,
      category: input.category || "general",
      sortOrder: 999,
      updatedAt: new Date(),
    });
    revalidatePath("/forecast");
    return { ok: true as const, key };
  } catch (e) {
    logError("forecast/addConfigAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteConfigAction(key: string) {
  try {
    await requireAdmin();
    await db.delete(forecastConfig).where(eq(forecastConfig.key, key));
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/deleteConfigAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Vehicle catalogue ─────────────────────────────────────────────────────
export async function upsertVehicleAction(input: {
  id?: string;          // optional — provided when editing existing
  name: string;
  kind: "car" | "van";
  keywords: string[];
  sortOrder?: number;
}) {
  try {
    await requireAdmin();
    const id = (input.id ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).trim();
    if (!id) return { ok: false as const, error: "Need a name or id." };
    if (input.kind !== "car" && input.kind !== "van") return { ok: false as const, error: "Kind must be car or van." };
    const keywords = input.keywords.filter((k) => k.trim().length > 0);
    const now = new Date();
    const existing = await db.select().from(forecastVehicles).where(eq(forecastVehicles.id, id)).limit(1);
    if (existing.length > 0) {
      await db.update(forecastVehicles).set({
        name: input.name.trim(),
        kind: input.kind,
        keywords: JSON.stringify(keywords),
        sortOrder: input.sortOrder ?? existing[0].sortOrder,
        updatedAt: now,
      }).where(eq(forecastVehicles.id, id));
    } else {
      await db.insert(forecastVehicles).values({
        id,
        name: input.name.trim(),
        kind: input.kind,
        keywords: JSON.stringify(keywords),
        sortOrder: input.sortOrder ?? 999,
        createdAt: now,
        updatedAt: now,
      });
    }
    revalidatePath("/forecast");
    return { ok: true as const, id };
  } catch (e) {
    logError("forecast/upsertVehicleAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteVehicleAction(id: string) {
  try {
    await requireAdmin();
    await db.delete(forecastVehicleBonuses).where(eq(forecastVehicleBonuses.vehicleId, id));
    await db.delete(forecastVehicles).where(eq(forecastVehicles.id, id));
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/deleteVehicleAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Set / clear a per-vehicle bonus value. value=null deletes the row.
export async function setVehicleBonusAction(input: {
  vehicleId: string;
  bonusKey: string;
  value: number | null;
}) {
  try {
    await requireAdmin();
    const now = new Date();
    if (input.value === null || Number.isNaN(input.value)) {
      await db.delete(forecastVehicleBonuses).where(and(
        eq(forecastVehicleBonuses.vehicleId, input.vehicleId),
        eq(forecastVehicleBonuses.bonusKey, input.bonusKey),
      ));
    } else {
      // Upsert: delete + insert (libsql doesn't support ON CONFLICT
      // cleanly with composite keys via Drizzle's API).
      await db.delete(forecastVehicleBonuses).where(and(
        eq(forecastVehicleBonuses.vehicleId, input.vehicleId),
        eq(forecastVehicleBonuses.bonusKey, input.bonusKey),
      ));
      await db.insert(forecastVehicleBonuses).values({
        vehicleId: input.vehicleId,
        bonusKey: input.bonusKey,
        value: input.value,
        updatedAt: now,
      });
    }
    revalidatePath("/forecast");
    return { ok: true as const };
  } catch (e) {
    logError("forecast/setVehicleBonusAction", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}
