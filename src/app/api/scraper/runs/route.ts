import { NextResponse } from "next/server";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const runs = await db
      .select()
      .from(scraperRuns)
      .orderBy(desc(scraperRuns.createdAt))
      .limit(100);

    return NextResponse.json(runs);
  } catch (e) {
    console.error("Runs list error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
