import "server-only";
import { db } from "@/db";
import { scraperResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { segmentOf, type Listing } from "./market-slots";

// The columns Market Analysis reads, in one place, so the Intelligence
// payload and the Trends summaries can't drift apart.
//
// source_url and body_style are read only to classify car vs van — the range
// can't ("Explorer" is both) — and are dropped before anything leaves the
// server. deal_identifier IS kept: it's what drops a deal two overlapping
// search URLs both returned. See lib/market-slots.ts.
export const LISTING_COLUMNS = {
  id: scraperResults.id,
  sourceUrl: scraperResults.sourceUrl,
  bodyStyle: scraperResults.bodyStyle,
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
  dealIdentifier: scraperResults.dealIdentifier,
};

type ListingRow = Listing & { sourceUrl: string | null; bodyStyle: string | null };

export function toListing({ sourceUrl, bodyStyle, ...r }: ListingRow): Listing {
  return { ...r, segment: segmentOf(sourceUrl, bodyStyle) };
}

export async function loadRunListings(runId: string): Promise<Listing[]> {
  const rows = await db
    .select(LISTING_COLUMNS)
    .from(scraperResults)
    .where(eq(scraperResults.runId, runId))
    .orderBy(scraperResults.id);
  return rows.map(toListing);
}
