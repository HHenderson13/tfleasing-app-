import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scraperRuns, scraperResults } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CSVRow {
  [key: string]: string | undefined;
}

// Proper CSV parser that handles quoted fields and embedded commas.
function parseCSV(content: string): CSVRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (ch === "\r") {
        // ignore
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.length === headers.length)
    .map((r) => {
      const obj: CSVRow = {};
      headers.forEach((h, i) => {
        obj[h] = r[i];
      });
      return obj;
    });
}

function toNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function toDate(v: string | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function POST(req: NextRequest) {
  try {
    // Accept either: session cookie (UI uploads) OR API key header (desktop Flask sync)
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.SCRAPER_API_KEY;
    const hasValidApiKey = !!(apiKey && expectedKey && apiKey === expectedKey);
    if (!hasValidApiKey) await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const label = (formData.get("label") as string) || "CSV Upload";
    const incomingRunId = (formData.get("runId") as string) || null;
    const finalize = formData.get("finalize") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "File must be a CSV" }, { status: 400 });
    }

    const content = await file.text();
    const rows = parseCSV(content);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });
    }

    const now = new Date();
    let runId = incomingRunId;
    let isNewRun = false;

    if (!runId) {
      // Create a new run
      runId = crypto.randomBytes(4).toString("hex");
      isNewRun = true;
      await db.insert(scraperRuns).values({
        id: runId,
        status: finalize ? "done" : "running",
        urls: JSON.stringify([]),
        label,
        totalUrls: 0,
        urlsCompleted: 0,
        totalResults: 0,
        startedAt: now,
        finishedAt: finalize ? now : null,
        createdAt: now,
      });
    } else {
      // Append to existing run — verify it exists
      const [existing] = await db
        .select()
        .from(scraperRuns)
        .where(eq(scraperRuns.id, runId))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: `Run ${runId} not found` }, { status: 404 });
      }
    }

    const resultsToInsert = rows.map((row) => ({
      runId: runId!,
      sourceUrl: row.source_url || null,
      manufacturer: row.manufacturer || null,
      range: row.range || null,
      model: row.model || null,
      derivative: row.derivative || null,
      fuelType: row.fuel_type || null,
      transmission: row.transmission || null,
      bodyStyle: row.body_style || null,
      trim: row.trim || null,
      monthlyPriceGbp: toNum(row.monthly_price_gbp),
      initialRentalGbp: toNum(row.initial_rental_gbp),
      totalLeaseCostGbp: toNum(row.total_lease_cost_gbp),
      additionalFeesGbp: toNum(row.additional_fees_gbp),
      contractLengthMonths: toInt(row.contract_length_months),
      annualMileage: toInt(row.annual_mileage),
      depositMonths: toInt(row.deposit_months),
      brokerDealerName: row.broker_dealer_name || null,
      advertiserCategory: row.advertiser_category || null,
      inStock: row.in_stock || null,
      financeType: row.finance_type || null,
      dealIdentifier: row.deal_identifier || null,
      leasingUrl: row.leasing_url || null,
      scrapedAt: toDate(row.scraped_at, now),
    }));

    for (let i = 0; i < resultsToInsert.length; i += 100) {
      await db.insert(scraperResults).values(resultsToInsert.slice(i, i + 100));
    }

    // Update totalResults counter (increment for chunks, set for new)
    if (isNewRun) {
      await db
        .update(scraperRuns)
        .set({
          totalResults: resultsToInsert.length,
          status: finalize ? "done" : "running",
          finishedAt: finalize ? now : null,
        })
        .where(eq(scraperRuns.id, runId));
    } else {
      await db
        .update(scraperRuns)
        .set({
          totalResults: sql`${scraperRuns.totalResults} + ${resultsToInsert.length}`,
          status: finalize ? "done" : "running",
          finishedAt: finalize ? now : null,
        })
        .where(eq(scraperRuns.id, runId));
    }

    return NextResponse.json({
      runId,
      total: resultsToInsert.length,
      label,
      finalized: finalize,
    });
  } catch (e) {
    console.error("Upload CSV error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
