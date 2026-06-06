import "server-only";
import { db } from "@/db";
import { brokerQuotes } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { MappedStockRow } from "./stock-list";

// Vehicle snapshot captured at quote-save time. Stored as JSON on the
// brokerQuotes row so the quote keeps reading even after the underlying
// stockVehicles row is replaced by the next upload. We deliberately omit
// VIN here too — brokers never see it on screen, even in their saved
// quotes.
export type QuoteVehicleSnapshot = Omit<MappedStockRow, "vin">;

export function vehicleSnapshotFromMapped(row: MappedStockRow): QuoteVehicleSnapshot {
  // Strip VIN before storing so the JSON we ship to the client never
  // carries it. The raw VIN is captured on the dedicated brokerQuotes.vehicleVin
  // column for our own admin lookups.
  const { vin: _vin, ...safe } = row;
  void _vin;
  return safe;
}

export function parseVehicleSnapshot(json: string): QuoteVehicleSnapshot | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as QuoteVehicleSnapshot;
    return null;
  } catch {
    return null;
  }
}

// Every quote read is scoped on broker_id — a broker user can only see
// quotes saved by anyone at their own broker. The index on
// (broker_id, updated_at) handles the ORDER BY without a table scan.
export async function listBrokerQuotes(brokerId: string) {
  return db
    .select()
    .from(brokerQuotes)
    .where(eq(brokerQuotes.brokerId, brokerId))
    .orderBy(desc(brokerQuotes.updatedAt));
}

export async function loadBrokerQuote(brokerId: string, quoteId: string) {
  const [row] = await db
    .select()
    .from(brokerQuotes)
    .where(and(eq(brokerQuotes.id, quoteId), eq(brokerQuotes.brokerId, brokerId)))
    .limit(1);
  return row ?? null;
}
