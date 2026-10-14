import { NextResponse } from "next/server";
import { ensureAppSchema } from "@/db/ensure-schema";
import { refreshFuelPrices } from "@/lib/fuel-prices";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Daily price check for the Fuel Cost Calculator (vercel.json, 05:15 UTC).
// Each source publishes on its own rhythm — fuel weekly, Octopus daily,
// Ofgem and DESNZ quarterly, Zapmap monthly — so checking daily keeps every
// one current within a day of publication. CRON_SECRET only: there is no
// manual bypass header; admins use "Check sources now" on the admin page.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Cron requests skip getCurrentUser(), which normally ensures the schema.
    await ensureAppSchema();
    const reports = await refreshFuelPrices();
    return NextResponse.json({ ok: reports.every((r) => r.ok), reports });
  } catch (e) {
    logError("api/cron/fuel-prices", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
