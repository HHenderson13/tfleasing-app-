import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scraperUrlLists } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;

    await db.delete(scraperUrlLists).where(eq(scraperUrlLists.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Delete URL list error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
