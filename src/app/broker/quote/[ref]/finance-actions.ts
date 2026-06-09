"use server";
import { db } from "@/db";
import { brokerInterestRates, brokerQuotes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVinByReference } from "@/lib/broker-vehicle";
import { computeFinance } from "@/lib/broker-finance-calc";
import { computeOutright } from "@/lib/broker-quote-pricing";
import { findOfpRowById } from "@/lib/broker-finance-context";
import { findCashValue, resolveProgrammePrice } from "@/lib/broker-cash-values";
import { findRuleById } from "@/lib/broker-stock-turn";
import {
  findBusinessDiscountById,
  findEvOfferById,
  findTestDriveOfferById,
  findTradeInOfferById,
} from "@/lib/broker-incentives";
import { logError } from "@/lib/logger";
import type { FinanceProgramme } from "@/lib/broker-pricing";

type Route = "pcp" | "hp" | "hp_balloon";

interface SaveInput {
  ref: string;
  snapshotJson: string;
  route: Route;
  financeProgramme: FinanceProgramme;
  customerType: "retail" | "business";
  customerIsVatBusiness: boolean;
  vehicleCashGbp: number;                    // 0 when component pricing — server re-derives
  commissionExVatGbp: number;
  depositGbp: number;
  termMonths: number;
  annualMileage: number;
  stockTurnRuleId: string | null;
  evOfferId: string | null;
  evChoice: "wallbox" | "cash" | null;
  tradeInOfferId: string | null;
  testDriveOfferId: string | null;
  businessDiscountOfferId: string | null;
  interestRateRuleId: string | null;     // must resolve — required for finance
  ofpRowId: number | null;                // required for PCP / HP-Balloon
  notes: string | null;
}

export async function saveFinanceQuoteAction(input: SaveInput) {
  const me = await requireBrokerUser();
  try {
    if (!input.interestRateRuleId) return { ok: false as const, error: "No interest rate selected — add a matching grid row first." };
    if ((input.route === "pcp" || input.route === "hp_balloon") && !input.ofpRowId) {
      return { ok: false as const, error: "Pick an OFP balloon row for this term + mileage." };
    }
    if (!["1n", "1f"].includes(input.financeProgramme)) {
      return { ok: false as const, error: "Pick a finance programme." };
    }
    const vin = await findVinByReference(input.ref);
    if (!vin) return { ok: false as const, error: "Vehicle reference doesn't resolve." };
    let snap: { bucket?: unknown; variant?: unknown; derivative?: unknown; modelYear?: unknown };
    try { snap = JSON.parse(input.snapshotJson); } catch {
      return { ok: false as const, error: "Vehicle snapshot was malformed. Refresh and try again." };
    }
    if (typeof snap.bucket !== "string" || typeof snap.variant !== "string") {
      return { ok: false as const, error: "Vehicle snapshot is missing bucket / variant." };
    }

    const businessEligible = input.customerType === "business" && input.customerIsVatBusiness;
    const [stockTurn, ev, tradeIn, testDrive, businessDiscount, interestRow, ofp, cashValue] = await Promise.all([
      input.stockTurnRuleId ? findRuleById(input.stockTurnRuleId) : Promise.resolve(null),
      input.evOfferId && input.evChoice ? findEvOfferById(input.evOfferId) : Promise.resolve(null),
      input.tradeInOfferId ? findTradeInOfferById(input.tradeInOfferId) : Promise.resolve(null),
      input.testDriveOfferId ? findTestDriveOfferById(input.testDriveOfferId) : Promise.resolve(null),
      input.businessDiscountOfferId && businessEligible
        ? findBusinessDiscountById(input.businessDiscountOfferId)
        : Promise.resolve(null),
      db.select().from(brokerInterestRates).where(eq(brokerInterestRates.id, input.interestRateRuleId)).limit(1).then((rs) => rs[0] ?? null),
      input.ofpRowId ? findOfpRowById(input.ofpRowId) : Promise.resolve(null),
      findCashValue({
        bucket: snap.bucket as string,
        variant: snap.variant as string,
        derivative: (snap.derivative as string | null) ?? null,
        modelYear: (snap.modelYear as string | null) ?? null,
      }),
    ]);

    if (!interestRow) return { ok: false as const, error: "Interest rate rule has been removed by admin — pick again." };
    // Guard the rate against programme spoofing — if the rule is keyed
    // to a specific programme, it must match what the broker submitted.
    if (interestRow.financeProgramme !== null && interestRow.financeProgramme !== input.financeProgramme) {
      return { ok: false as const, error: "That interest rate belongs to a different finance programme — pick again." };
    }
    if ((input.route === "pcp" || input.route === "hp_balloon") && !ofp) {
      return { ok: false as const, error: "OFP row has been replaced by admin — pick again." };
    }

    // Authoritative cash price. When the pricing row has components,
    // we compute from them — the broker's input is ignored, preventing
    // a tampered cash value from creeping into a quote. When the row is
    // legacy / flat, we use the broker's value but require it > 0.
    let vehicleCashGbp: number;
    let pricingBreakdown: ReturnType<typeof resolveProgrammePrice>["breakdown"] = null;
    if (cashValue) {
      const resolved = resolveProgrammePrice(cashValue, input.financeProgramme);
      vehicleCashGbp = resolved.cashGbp;
      pricingBreakdown = resolved.breakdown;
    } else {
      vehicleCashGbp = input.vehicleCashGbp;
    }
    if (vehicleCashGbp <= 0) return { ok: false as const, error: "Vehicle cash price required." };

    // Apply the same cash-deduction stack outright uses, then run the
    // finance calc against the effective cash price.
    const outright = computeOutright({
      vehicleCashGbp,
      commissionExVatGbp: 0,
      stockTurnBonusGbp: stockTurn?.bonusGbp ?? 0,
      evCashGbp: ev && input.evChoice === "cash" ? ev.cashAlternativeGbp : 0,
      tradeInGbp: tradeIn?.amountGbp ?? 0,
      testDriveGbp: testDrive?.amountGbp ?? 0,
      businessDiscountPct: businessDiscount?.extraDiscountPct ?? 0,
    });

    const baseApr = interestRow.annualAprPct;
    const aprUplift = businessDiscount?.aprUpliftPct ?? 0;
    const effectiveApr = baseApr + aprUplift;
    const finance = computeFinance({
      effectiveCashGbp: outright.effectiveCashGbp,
      depositGbp: input.depositGbp,
      depositAllowanceGbp: interestRow.depositAllowanceGbp ?? 0,
      termMonths: input.termMonths,
      annualAprPct: effectiveApr,
      balloonGbp: input.route === "hp" ? 0 : (ofp?.balloonGbp ?? 0),
    });

    const commissionEx = Math.max(0, input.commissionExVatGbp);
    const commissionVat = Math.round(commissionEx * 0.2 * 100) / 100;
    const customerTotal = Math.round(
      (finance.totalPayableGbp + commissionEx + commissionVat) * 100,
    ) / 100;

    const id = randomUUID();
    const now = new Date();
    await db.insert(brokerQuotes).values({
      id,
      brokerId: me.brokerId,
      createdByBrokerUserId: me.id,
      vehicleRef: input.ref,
      vehicleVin: vin,
      vehicleSnapshot: input.snapshotJson,
      fundingRoute: input.route,
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      commissionExVatGbp: commissionEx,
      commissionVatGbp: commissionVat,
      vehicleCashGbp: outright.vehicleCashGbp,
      stockTurnRuleId: stockTurn?.id ?? null,
      stockTurnBonusGbp: stockTurn ? outright.stockTurnBonusGbp : null,
      evOfferId: ev?.id ?? null,
      evChoice: input.evChoice,
      evCashGbp: ev && input.evChoice === "cash" ? outright.evCashGbp : null,
      tradeInOfferId: tradeIn?.id ?? null,
      tradeInGbp: tradeIn ? outright.tradeInGbp : null,
      testDriveOfferId: testDrive?.id ?? null,
      testDriveGbp: testDrive ? outright.testDriveGbp : null,
      businessDiscountOfferId: businessDiscount?.id ?? null,
      businessDiscountGbp: businessDiscount ? outright.businessDiscountGbp : null,
      businessAprUpliftPct: businessDiscount ? aprUplift : null,
      customerTotalGbp: customerTotal,
      termMonths: input.termMonths,
      annualMileage: input.route === "hp" ? null : input.annualMileage,
      upfrontGbp: finance.depositGbp,
      monthlyRentalGbp: finance.monthlyGbp,
      balloonGbp: input.route === "hp" ? null : finance.balloonGbp,
      depositAllowanceGbp: finance.depositAllowanceGbp,
      annualAprPct: effectiveApr,
      amountOfCreditGbp: finance.amountOfCreditGbp,
      totalChargeForCreditGbp: finance.totalChargeForCreditGbp,
      totalPayableGbp: finance.totalPayableGbp,
      interestRateRuleId: interestRow.id,
      ofpRowId: ofp ? input.ofpRowId : null,
      // Phase 7 — programme + pricing breakdown for the quote detail page
      financeProgramme: input.financeProgramme,
      retailPriceGbp: pricingBreakdown?.retailPriceGbp ?? null,
      customerDiscountGbp: pricingBreakdown?.customerDiscountGbp ?? null,
      deliveryCostsGbp: pricingBreakdown?.deliveryCostsGbp ?? null,
      dealerProfitGbp: pricingBreakdown?.dealerProfitGbp ?? null,
      notes: input.notes,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    revalidatePath("/broker/quotes");
    return { ok: true as const, quoteId: id };
  } catch (e) {
    logError("broker-quotes/save-finance", e);
    return { ok: false as const, error: "Couldn't save — please try again." };
  }
}
