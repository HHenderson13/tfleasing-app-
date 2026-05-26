import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scraperUrlLists } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { desc } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const lists = await db
      .select()
      .from(scraperUrlLists)
      .orderBy(desc(scraperUrlLists.createdAt));

    return NextResponse.json(lists.map((list) => ({
      ...list,
      urls: JSON.parse(list.urls),
    })));
  } catch (e) {
    logError("api/scraper/url-lists.GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { name, urls } = body;

    if (!name || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Name and non-empty urls array required" },
        { status: 400 }
      );
    }

    const id = crypto.randomBytes(4).toString("hex");
    const createdAt = new Date();

    await db.insert(scraperUrlLists).values({
      id,
      name,
      urls: JSON.stringify(urls),
      createdAt,
    });

    return NextResponse.json({ id, name, urls, createdAt });
  } catch (e) {
    logError("api/scraper/url-lists.POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
