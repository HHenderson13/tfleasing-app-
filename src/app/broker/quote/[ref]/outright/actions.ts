"use server";
import { db } from "@/db";
import { brokerQuotes } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVinByReference } from "@/lib/broker-vehicle";
import { computeOutright } from "@/lib/broker-quote-pricing";
import { findRuleById } from "@/lib/broker-stock-turn";
import { logError } from "@/lib/logger";

interface SaveInput {
  ref: string;
  snapshotJson: string;
  customerType: "retail" | "business";
  customerIsVatBusiness: boolean;
  vehicleCashGbp: number;
  commissionExVatGbp: number;
  // Stock-turn programme the broker picked, or null for none. Re-validated
  // server-side — a crafted id silently degrades to no-bonus rather than
  // letting the broker spend a bonus that doesn't exist.
  stockTurnRuleId: string | null;
  notes: string | null;
}

export async function saveOutrightQuoteAction(input: SaveInput) {
  const me = await requireBrokerUser();
  try {
    if (typeof input.vehicleCashGbp !== "number" || input.vehicleCashGbp <= 0) {
      return { ok: false as const, error: "Vehicle cash price is required." };
    }
    if (input.customerType !== "retail" && input.customerType !== "business") {
      return { ok: false as const, error: "Pick a customer type." };
    }
    // Validate the vehicle reference resolves before we save — stops a
    // crafted ref persisting a meaningless quote row.
    const vin = await findVinByReference(input.ref);
    if (!vin) return { ok: false as const, error: "We can't find that vehicle anymore — it may have been removed." };

    // Snapshot is opaque JSON from the form. We don't trust the structure
    // beyond "valid JSON". It's stored as text and only re-parsed for
    // display, so a malformed string here is the broker's mistake to
    // notice on the saved-quote page.
    try { JSON.parse(input.snapshotJson); } catch {
      return { ok: false as const, error: "Vehicle snapshot was malformed. Refresh the page and try again." };
    }

    // Resolve the chosen stock-turn rule server-side so the broker can't
    // claim a bonus value that wasn't actually offered.
    const stockTurn = input.stockTurnRuleId ? await findRuleById(input.stockTurnRuleId) : null;
    const stockTurnBonus = stockTurn?.bonusGbp ?? 0;

    const totals = computeOutright({
      vehicleCashGbp: input.vehicleCashGbp,
      commissionExVatGbp: input.commissionExVatGbp,
      stockTurnBonusGbp: stockTurnBonus,
    });

    const id = randomUUID();
    const now = new Date();
    await db.insert(brokerQuotes).values({
      id,
      brokerId: me.brokerId,
      createdByBrokerUserId: me.id,
      vehicleRef: input.ref,
      vehicleVin: vin,
      vehicleSnapshot: input.snapshotJson,
      fundingRoute: "outright",
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      commissionExVatGbp: totals.commissionExVatGbp,
      commissionVatGbp: totals.commissionVatGbp,
      vehicleCashGbp: totals.vehicleCashGbp,
      stockTurnRuleId: stockTurn?.id ?? null,
      stockTurnBonusGbp: stockTurn ? totals.stockTurnBonusGbp : null,
      customerTotalGbp: totals.customerTotalGbp,
      termMonths: null,
      annualMileage: null,
      upfrontGbp: null,
      monthlyRentalGbp: null,
      notes: input.notes,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    revalidatePath("/broker/quotes");
    return { ok: true as const, quoteId: id };
  } catch (e) {
    logError("broker-quotes/save-outright", e);
    return { ok: false as const, error: "Couldn't save — please try again." };
  }
}
