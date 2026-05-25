import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scraperRuns, scraperResults } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const runId = url.searchParams.get("runId");
    const format = url.searchParams.get("format") || "json"; // json | csv
    const slim = url.searchParams.get("slim") === "true";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const perPage = Math.min(
      50000,
      Math.max(1, parseInt(url.searchParams.get("per_page") || "50", 10))
    );

    if (!runId) {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }

    const [run] = await db
      .select()
      .from(scraperRuns)
      .where(eq(scraperRuns.id, runId))
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // CSV download: always export everything (full fields)
    if (format === "csv") {
      const allRows = await db
        .select()
        .from(scraperResults)
        .where(eq(scraperResults.runId, runId));

      const headers = [
        "source_url", "manufacturer", "range", "model", "derivative",
        "fuel_type", "transmission", "body_style", "trim",
        "monthly_price_gbp", "initial_rental_gbp", "total_lease_cost_gbp",
        "additional_fees_gbp", "contract_length_months", "annual_mileage",
        "deposit_months", "broker_dealer_name", "advertiser_category",
        "in_stock", "finance_type", "deal_identifier", "leasing_url", "scraped_at",
      ];

      const escape = (cell: unknown): string => {
        if (cell === null || cell === undefined) return "";
        const str = String(cell);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvLines = [headers.join(",")];
      for (const r of allRows) {
        csvLines.push([
          r.sourceUrl, r.manufacturer, r.range, r.model, r.derivative,
          r.fuelType, r.transmission, r.bodyStyle, r.trim,
          r.monthlyPriceGbp, r.initialRentalGbp, r.totalLeaseCostGbp,
          r.additionalFeesGbp, r.contractLengthMonths, r.annualMileage,
          r.depositMonths, r.brokerDealerName, r.advertiserCategory,
          r.inStock, r.financeType, r.dealIdentifier, r.leasingUrl,
          r.scrapedAt ? new Date(r.scrapedAt).toISOString() : "",
        ].map(escape).join(","));
      }

      return new NextResponse(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="leasing-scrape-${runId}.csv"`,
        },
      });
    }

    // JSON queries: get total count + paginate
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(scraperResults)
      .where(eq(scraperResults.runId, runId));

    const totalNum = Number(total);
    const pages = Math.max(1, Math.ceil(totalNum / perPage));

    // Slim mode returns the columns needed for the Intelligence panel
    // (including drill-down broker table). Drops body_style, trim, fuel_type,
    // transmission, source_url, scraped_at, deal_identifier, leasing_url,
    // additional_fees_gbp, deposit_months — none of which the intel views render.
    if (slim) {
      const rows = await db
        .select({
          id: scraperResults.id,
          range: scraperResults.range,
          model: scraperResults.model,
          derivative: scraperResults.derivative,
          contractLengthMonths: scraperResults.contractLengthMonths,
          annualMileage: scraperResults.annualMileage,
          monthlyPriceGbp: scraperResults.monthlyPriceGbp,
          initialRentalGbp: scraperResults.initialRentalGbp,
          totalLeaseCostGbp: scraperResults.totalLeaseCostGbp,
          depositMonths: scraperResults.depositMonths,
          brokerDealerName: scraperResults.brokerDealerName,
          advertiserCategory: scraperResults.advertiserCategory,
          inStock: scraperResults.inStock,
          financeType: scraperResults.financeType,
        })
        .from(scraperResults)
        .where(eq(scraperResults.runId, runId))
        .limit(perPage)
        .offset((page - 1) * perPage);

      return NextResponse.json({
        results: rows,
        total: totalNum,
        page,
        pages,
        per_page: perPage,
      });
    }

    const rows = await db
      .select()
      .from(scraperResults)
      .where(eq(scraperResults.runId, runId))
      .limit(perPage)
      .offset((page - 1) * perPage);

    return NextResponse.json({
      run,
      results: rows,
      total: totalNum,
      page,
      pages,
      per_page: perPage,
      count: rows.length,
    });
  } catch (e) {
    console.error("Results query error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
