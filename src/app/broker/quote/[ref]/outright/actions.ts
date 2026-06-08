"use server";
import { db } from "@/db";
import { brokerQuotes } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference, findVinByReference } from "@/lib/broker-vehicle";
import { computeOutright } from "@/lib/broker-quote-pricing";
import { findRuleById } from "@/lib/broker-stock-turn";
import {
  findBusinessDiscountById,
  findEvOfferById,
  findTestDriveOfferById,
  findTradeInOfferById,
} from "@/lib/broker-incentives";
import { logError } from "@/lib/logger";

// Note: findVehicleByReference is imported but not currently used in this
// file — kept for the next phase (5) that needs the full vehicle row.
void findVehicleByReference;

interface SaveInput {
  ref: string;
  snapshotJson: string;
  customerType: "retail" | "business";
  customerIsVatBusiness: boolean;
  vehicleCashGbp: number;
  commissionExVatGbp: number;
  stockTurnRuleId: string | null;
  // Phase 4e incentive selections. Server resolves each one to its
  // canonical amount so a crafted id can't claim a discount that
  // doesn't exist or use stale numbers.
  evOfferId: string | null;
  evChoice: "wallbox" | "cash" | null;
  tradeInOfferId: string | null;
  testDriveOfferId: string | null;
  businessDiscountOfferId: string | null;
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
    const vin = await findVinByReference(input.ref);
    if (!vin) return { ok: false as const, error: "We can't find that vehicle anymore — it may have been removed." };
    try { JSON.parse(input.snapshotJson); } catch {
      return { ok: false as const, error: "Vehicle snapshot was malformed. Refresh the page and try again." };
    }

    // Resolve every chosen offer server-side. Each falls back to "none"
    // if the id is missing or invalid rather than failing the whole save.
    const businessEligible = input.customerType === "business" && input.customerIsVatBusiness;
    const [stockTurn, ev, tradeIn, testDrive, businessDiscount] = await Promise.all([
      input.stockTurnRuleId ? findRuleById(input.stockTurnRuleId) : Promise.resolve(null),
      input.evOfferId && input.evChoice ? findEvOfferById(input.evOfferId) : Promise.resolve(null),
      input.tradeInOfferId ? findTradeInOfferById(input.tradeInOfferId) : Promise.resolve(null),
      input.testDriveOfferId ? findTestDriveOfferById(input.testDriveOfferId) : Promise.resolve(null),
      // Business discount only resolves when the customer is actually a
      // VAT-registered business — guards against a crafted id arriving
      // from a retail customer.
      input.businessDiscountOfferId && businessEligible
        ? findBusinessDiscountById(input.businessDiscountOfferId)
        : Promise.resolve(null),
    ]);

    const stockTurnBonus = stockTurn?.bonusGbp ?? 0;
    const evCash = (ev && input.evChoice === "cash") ? ev.cashAlternativeGbp : 0;
    const tradeInAmount = tradeIn?.amountGbp ?? 0;
    const testDriveAmount = testDrive?.amountGbp ?? 0;
    const businessDiscountPct = businessDiscount?.extraDiscountPct ?? 0;
    const aprUplift = businessDiscount?.aprUpliftPct ?? 0;

    const totals = computeOutright({
      vehicleCashGbp: input.vehicleCashGbp,
      commissionExVatGbp: input.commissionExVatGbp,
      stockTurnBonusGbp: stockTurnBonus,
      evCashGbp: evCash,
      tradeInGbp: tradeInAmount,
      testDriveGbp: testDriveAmount,
      businessDiscountPct,
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
      evOfferId: ev?.id ?? null,
      evChoice: input.evChoice,
      evCashGbp: ev && input.evChoice === "cash" ? totals.evCashGbp : null,
      tradeInOfferId: tradeIn?.id ?? null,
      tradeInGbp: tradeIn ? totals.tradeInGbp : null,
      testDriveOfferId: testDrive?.id ?? null,
      testDriveGbp: testDrive ? totals.testDriveGbp : null,
      businessDiscountOfferId: businessDiscount?.id ?? null,
      businessDiscountGbp: businessDiscount ? totals.businessDiscountGbp : null,
      businessAprUpliftPct: businessDiscount ? aprUplift : null,
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
