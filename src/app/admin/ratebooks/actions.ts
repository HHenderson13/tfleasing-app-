"use server";

import { db } from "@/db";
import { ratebook, ratebookRemoteSettings, ratebookUploads, savedDiscountKeys, vehicles } from "@/db/schema";
import { downloadRatebookRemoteFile, ensureRatebookRemoteSettingsTable, parseRatebookRemoteSettings, testRatebookRemoteConnection, type RatebookRemoteSettingsInput } from "@/lib/ratebook-remote";
import { parseRatebookBuffer } from "@/lib/ratebook-parse";
import { del } from "@vercel/blob";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type RatebookImportInput = {
  funderId: string;
  isMaintained: boolean;
  filename: string;
  buffer: Buffer;
};

type RemoteImportInput = RatebookRemoteSettingsInput & {
  funderId: string;
  isMaintained: boolean;
};

export async function uploadRatebook(formData: FormData) {
  const file = formData.get("file") as File | null;
  const funderId = String(formData.get("funderId") ?? "").trim();
  const isMaintained = String(formData.get("isMaintained") ?? "") === "true";

  if (!file || !funderId) return { ok: false as const, error: "Missing file or funder." };
  const buffer = Buffer.from(await file.arrayBuffer());
  return importRatebookBuffer({
    funderId,
    isMaintained,
    filename: file.name,
    buffer,
  });
}

export async function processRatebookBlobAction(input: {
  blobUrl: string;
  filename: string;
  funderId: string;
  isMaintained: boolean;
}) {
  const res = await fetch(input.blobUrl);
  if (!res.ok) {
    return { ok: false as const, error: `Failed to fetch uploaded file (${res.status}).` };
  }

  try {
    const buffer = Buffer.from(await res.arrayBuffer());
    return await importRatebookBuffer({
      funderId: input.funderId,
      isMaintained: input.isMaintained,
      filename: input.filename,
      buffer,
    });
  } finally {
    try {
      await del(input.blobUrl);
    } catch {
      // Ignore cleanup failures. The blob is only a temporary staging file.
    }
  }
}

export async function saveRatebookRemoteSettingsAction(input: RatebookRemoteSettingsInput) {
  await ensureRatebookRemoteSettingsTable();

  let settings;
  try {
    settings = parseRatebookRemoteSettings(input);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Invalid remote settings." };
  }

  const updatedAt = new Date();
  await db.insert(ratebookRemoteSettings).values({
    id: "default",
    protocol: settings.protocol,
    host: settings.host,
    port: settings.port,
    username: settings.username,
    password: settings.password,
    remotePath: settings.remotePath,
    updatedAt,
  }).onConflictDoUpdate({
    target: ratebookRemoteSettings.id,
    set: {
      protocol: settings.protocol,
      host: settings.host,
      port: settings.port,
      username: settings.username,
      password: settings.password,
      remotePath: settings.remotePath,
      updatedAt,
    },
  });

  revalidatePath("/admin/ratebooks");
  return {
    ok: true as const,
    updatedAt: updatedAt.toISOString(),
  };
}

export async function testRatebookRemoteConnectionAction(input: RatebookRemoteSettingsInput) {
  try {
    const result = await testRatebookRemoteConnection(input);
    return { ok: true as const, message: result.message };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Connection test failed." };
  }
}

export async function importRatebookFromRemoteAction(input: RemoteImportInput) {
  const funderId = input.funderId.trim();
  if (!funderId) return { ok: false as const, error: "Choose a funder before importing." };

  try {
    const remote = await downloadRatebookRemoteFile(input);
    return await importRatebookBuffer({
      funderId,
      isMaintained: input.isMaintained,
      filename: remote.remotePath,
      buffer: remote.buffer,
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Remote import failed." };
  }
}

async function importRatebookBuffer(input: RatebookImportInput) {
  const { rows, vehicles: parsedVehicles, warnings, diagnostics } = parseRatebookBuffer(input.buffer, input.filename);
  if (!rows.length) {
    return { ok: false as const, error: warnings.join("; ") || "No rows parsed.", diagnostics };
  }

  await db.delete(ratebook).where(and(
    eq(ratebook.funderId, input.funderId),
    eq(ratebook.isBusiness, true),
    eq(ratebook.isMaintained, input.isMaintained),
  ));

  const chunkSize = 500;
  const allCapCodes = parsedVehicles.map((vehicle) => vehicle.capCode);

  const savedMappings = allCapCodes.length
    ? await db.select().from(savedDiscountKeys).where(inArray(savedDiscountKeys.capCode, allCapCodes))
    : [];
  const savedMap = new Map(savedMappings.map((row) => [row.capCode, row.discountKey]));

  const withData = parsedVehicles.filter((vehicle) => vehicle.model && vehicle.derivative);
  const placeholders = parsedVehicles.filter((vehicle) => !(vehicle.model && vehicle.derivative));

  for (let i = 0; i < withData.length; i += chunkSize) {
    const slice = withData.slice(i, i + chunkSize).map((vehicle) => ({
      capCode: vehicle.capCode,
      model: vehicle.model!,
      derivative: vehicle.derivative!,
      fuelType: vehicle.fuelType,
      listPriceNet: vehicle.listPriceNet,
      isVan: false,
      discountKey: savedMap.get(vehicle.capCode) ?? null,
    }));
    await db.insert(vehicles).values(slice).onConflictDoUpdate({
      target: vehicles.capCode,
      set: {
        model: sql`excluded.model`,
        derivative: sql`excluded.derivative`,
        fuelType: sql`COALESCE(excluded.fuel_type, vehicles.fuel_type)`,
        listPriceNet: sql`COALESCE(excluded.list_price_net, vehicles.list_price_net)`,
        discountKey: sql`COALESCE(vehicles.discount_key, excluded.discount_key)`,
      },
    });
  }

  for (let i = 0; i < placeholders.length; i += chunkSize) {
    const slice = placeholders.slice(i, i + chunkSize).map((vehicle) => ({
      capCode: vehicle.capCode,
      model: vehicle.model ?? "Unknown",
      derivative: vehicle.derivative ?? vehicle.capCode,
      fuelType: vehicle.fuelType,
      listPriceNet: vehicle.listPriceNet,
      isVan: false,
      discountKey: savedMap.get(vehicle.capCode) ?? null,
    }));
    await db.insert(vehicles).values(slice).onConflictDoNothing();
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize).map((row) => ({
      funderId: input.funderId,
      ...row,
      isBusiness: true,
      isMaintained: input.isMaintained,
    }));
    await db.insert(ratebook).values(slice).onConflictDoNothing();
    inserted += slice.length;
  }

  const orphans = await db
    .select({ capCode: vehicles.capCode, discountKey: vehicles.discountKey })
    .from(vehicles)
    .where(sql`cap_code NOT IN (SELECT DISTINCT cap_code FROM ratebook)`);

  if (orphans.length) {
    const toSave = orphans.filter((row) => row.discountKey);
    if (toSave.length) {
      for (let i = 0; i < toSave.length; i += chunkSize) {
        const slice = toSave.slice(i, i + chunkSize).map((row) => ({
          capCode: row.capCode,
          discountKey: row.discountKey!,
        }));
        await db.insert(savedDiscountKeys).values(slice).onConflictDoUpdate({
          target: savedDiscountKeys.capCode,
          set: { discountKey: sql`excluded.discount_key` },
        });
      }
    }

    const orphanCodes = orphans.map((row) => row.capCode);
    for (let i = 0; i < orphanCodes.length; i += chunkSize) {
      await db.delete(vehicles).where(inArray(vehicles.capCode, orphanCodes.slice(i, i + chunkSize)));
    }
  }

  if (allCapCodes.length) {
    for (let i = 0; i < allCapCodes.length; i += chunkSize) {
      await db.delete(savedDiscountKeys).where(
        inArray(savedDiscountKeys.capCode, allCapCodes.slice(i, i + chunkSize)),
      );
    }
  }

  await db.insert(ratebookUploads).values({
    funderId: input.funderId,
    isMaintained: input.isMaintained,
    filename: input.filename,
    rowCount: inserted,
    uploadedAt: new Date(),
  });

  revalidatePath("/admin/ratebooks");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/discounts");

  return {
    ok: true as const,
    inserted,
    removed: orphans.length,
    warnings,
    diagnostics,
  };
}
