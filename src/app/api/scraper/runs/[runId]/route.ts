import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scraperRuns, scraperResults, scraperLogs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await requireAdmin();

    const { runId } = await params;

    await db.delete(scraperLogs).where(eq(scraperLogs.runId, runId));
    await db.delete(scraperResults).where(eq(scraperResults.runId, runId));
    await db.delete(scraperRuns).where(eq(scraperRuns.id, runId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Delete run error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
