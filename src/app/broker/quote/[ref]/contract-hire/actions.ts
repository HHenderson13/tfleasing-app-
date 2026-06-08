"use server";
import { db } from "@/db";
import { brokerQuotes } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVinByReference } from "@/lib/broker-vehicle";
import { findContractHireOptions } from "@/lib/broker-ch-lookup";
import { findRuleById } from "@/lib/broker-stock-turn";
import {
  findBusinessDiscountById,
  findEvOfferById,
  findTestDriveOfferById,
  findTradeInOfferById,
} from "@/lib/broker-incentives";
import { logError } from "@/lib/logger";

interface SaveInput {
  ref: string;
  snapshotJson: string;
  capCode: string;
  funderId: string;
  funderName: string;
  isBusiness: boolean;
  isMaintained: boolean;
  customerType: "retail" | "business";
  customerIsVatBusiness: boolean;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  monthlyRentalGbp: number;
  monthlyMaintenanceGbp: number;
  commissionExVatGbp: number;
  stockTurnRuleId: string | null;
  evOfferId: string | null;
  evChoice: "wallbox" | "cash" | null;
  tradeInOfferId: string | null;
  testDriveOfferId: string | null;
  businessDiscountOfferId: string | null;
  notes: string | null;
}

export async function saveContractHireQuoteAction(input: SaveInput) {
  const me = await requireBrokerUser();
  try {
    const vin = await findVinByReference(input.ref);
    if (!vin) return { ok: false as const, error: "Vehicle reference doesn't resolve." };
    try { JSON.parse(input.snapshotJson); } catch {
      return { ok: false as const, error: "Vehicle snapshot was malformed. Refresh and try again." };
    }

    // Re-look up the chosen funder + spec against the ratebook so the
    // broker can't claim a monthly rental that doesn't exist. Same
    // pattern as every other route's save action.
    const options = await findContractHireOptions({
      capCode: input.capCode,
      termMonths: input.termMonths,
      annualMileage: input.annualMileage,
      isBusiness: input.isBusiness,
      isMaintained: input.isMaintained,
    });
    const matched = options.find(
      (o) => o.funderId === input.funderId && o.initialRentalMultiplier === input.initialRentalMultiplier,
    );
    if (!matched) {
      return { ok: false as const, error: "Ratebook no longer has a rental for this spec — pick again." };
    }

    const businessEligible = input.customerType === "business" && input.customerIsVatBusiness;
    const [stockTurn, ev, tradeIn, testDrive, businessDiscount] = await Promise.all([
      input.stockTurnRuleId ? findRuleById(input.stockTurnRuleId) : Promise.resolve(null),
      input.evOfferId && input.evChoice ? findEvOfferById(input.evOfferId) : Promise.resolve(null),
      input.tradeInOfferId ? findTradeInOfferById(input.tradeInOfferId) : Promise.resolve(null),
      input.testDriveOfferId ? findTestDriveOfferById(input.testDriveOfferId) : Promise.resolve(null),
      input.businessDiscountOfferId && businessEligible
        ? findBusinessDiscountById(input.businessDiscountOfferId)
        : Promise.resolve(null),
    ]);

    // CH cash rebate stacks the four cash-style incentives onto the
    // initial rental (there's no purchase price to discount on a rental).
    // Business discount is expressed as a % of monthly × term — the
    // closest analogue to "% off cash price" for a rental.
    const initialRental = matched.monthlyRentalGbp * input.initialRentalMultiplier;
    const monthly = matched.monthlyRentalGbp;
    const maintenance = input.isMaintained ? matched.monthlyMaintenanceGbp : 0;
    const totalMonthlies = (monthly + maintenance) * input.termMonths;
    const businessDiscountGbp = businessDiscount
      ? Math.round(monthly * input.termMonths * businessDiscount.extraDiscountPct / 100 * 100) / 100
      : 0;
    const stockTurnGbp = stockTurn?.bonusGbp ?? 0;
    const evCashGbp = ev && input.evChoice === "cash" ? ev.cashAlternativeGbp : 0;
    const tradeInGbp = tradeIn?.amountGbp ?? 0;
    const testDriveGbp = testDrive?.amountGbp ?? 0;
    const rebate = businessDiscountGbp + stockTurnGbp + evCashGbp + tradeInGbp + testDriveGbp;
    const customerInitialRental = Math.max(0, initialRental - rebate);

    const commissionEx = Math.max(0, input.commissionExVatGbp);
    const commissionVat = Math.round(commissionEx * 0.2 * 100) / 100;
    // "Customer total" on CH = what they pay over the full life of the
    // contract: net initial rental + remaining monthlies + maintenance +
    // commission with VAT.
    const customerTotal = Math.round(
      (customerInitialRental + monthly * (input.termMonths - input.initialRentalMultiplier) + maintenance * input.termMonths + commissionEx + commissionVat) * 100,
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
      fundingRoute: "contract_hire",
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      commissionExVatGbp: commissionEx,
      commissionVatGbp: commissionVat,
      vehicleCashGbp: 0,                 // not applicable to CH
      stockTurnRuleId: stockTurn?.id ?? null,
      stockTurnBonusGbp: stockTurn ? stockTurnGbp : null,
      evOfferId: ev?.id ?? null,
      evChoice: input.evChoice,
      evCashGbp: ev && input.evChoice === "cash" ? evCashGbp : null,
      tradeInOfferId: tradeIn?.id ?? null,
      tradeInGbp: tradeIn ? tradeInGbp : null,
      testDriveOfferId: testDrive?.id ?? null,
      testDriveGbp: testDrive ? testDriveGbp : null,
      businessDiscountOfferId: businessDiscount?.id ?? null,
      businessDiscountGbp: businessDiscount ? businessDiscountGbp : null,
      businessAprUpliftPct: null,
      customerTotalGbp: customerTotal,
      termMonths: input.termMonths,
      annualMileage: input.annualMileage,
      upfrontGbp: customerInitialRental,    // initial rental net of rebates
      monthlyRentalGbp: monthly,
      monthlyMaintenanceGbp: maintenance,
      initialRentalMultiplier: input.initialRentalMultiplier,
      isMaintained: input.isMaintained,
      funderId: matched.funderId,
      funderName: matched.funderName,
      // Finance-specific fields stay null on CH.
      balloonGbp: null,
      depositAllowanceGbp: null,
      annualAprPct: null,
      amountOfCreditGbp: null,
      totalChargeForCreditGbp: null,
      totalPayableGbp: Math.round((initialRental + monthly * (input.termMonths - input.initialRentalMultiplier) + maintenance * input.termMonths) * 100) / 100,
      interestRateRuleId: null,
      ofpRowId: null,
      notes: input.notes,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    void totalMonthlies;
    revalidatePath("/broker/quotes");
    return { ok: true as const, quoteId: id };
  } catch (e) {
    logError("broker-quotes/save-contract-hire", e);
    return { ok: false as const, error: "Couldn't save — please try again." };
  }
}
