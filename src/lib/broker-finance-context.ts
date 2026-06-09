import "server-only";
import { db } from "@/db";
import { brokerOfpData } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findCashValue, resolveProgrammePrice, type CashValueLookup } from "./broker-cash-values";
import { findApplicableStockTurnRules } from "./broker-stock-turn";
import {
  findBusinessDiscount,
  findEvOffer,
  findTestDriveOffers,
  findTradeInOffers,
} from "./broker-incentives";
import { findBestInterestRate } from "./broker-interest-rates";
import type { CustomerTypeRate, FinanceRoute } from "./broker-interest-rates";
import { findOfpCandidates, type OfpCandidate } from "./broker-ofp-lookup";
import type { FinanceProgramme, PricingBreakdown } from "./broker-pricing";

// Vehicle class on the broker portal is always concrete — 'car' or 'van'.
// The interest-rates lookup also accepts 'all' as a scope label, but a
// real quote can never be against an 'all' vehicle, so we narrow here.
type ConcreteVehicleClass = "car" | "van";

export interface InterestRateMatchUi {
  id: string;
  label: string;
  annualAprPct: number;
  depositAllowanceGbp: number | null;
  specificity: number;
}

// Per-programme data so the form can show 1N and 1F side-by-side.
export interface ProgrammeContext {
  programme: FinanceProgramme;
  // OTR the customer pays for the vehicle on this programme. Null when
  // neither pricing components nor a legacy cash value exist.
  cashGbp: number | null;
  // Full pricing breakdown when components are set; null otherwise.
  pricingBreakdown: PricingBreakdown | null;
  // Best-matching interest rate for this programme + term + customer.
  interestRate: InterestRateMatchUi | null;
}

export interface FinanceQuoteContext {
  programmes: Record<FinanceProgramme, ProgrammeContext>;
  // True when the cash-values row drives prices via the Ford component
  // model. Used by the form to label things "Computed from pricing" vs
  // "Manual cash price" and to enable side-by-side comparison.
  hasComponentPricing: boolean;
  // OFP balloon candidates — single best match preferred, but always
  // return the top few so the form can show a chooser if needed.
  ofpCandidates: OfpCandidate[];
  // Phase 4 cross-cutting incentives the form re-uses verbatim from
  // outright. EV detection + stock-turn matching mirror outright.
  stockTurnRules: {
    id: string; label: string; bonusGbp: number; mustRegisterBy: string; notes: string | null;
  }[];
  evOffer: { id: string; label: string; cashAlternativeGbp: number; wallboxLabel: string } | null;
  tradeInOffers: { id: string; label: string; amountGbp: number; termsText: string }[];
  testDriveOffers: { id: string; label: string; amountGbp: number; termsText: string | null }[];
  businessDiscount: { id: string; label: string; extraDiscountPct: number; aprUpliftPct: number; notes: string | null } | null;
}

export interface LoadContextInput {
  vehicleClass: ConcreteVehicleClass;
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
  gateRelease: string | null;
  isEv: boolean;
  fundingRoute: FinanceRoute;          // pcp / hp / hp_balloon
  // OFP only applies to pcp + hp_balloon; for hp we skip the lookup.
  needsBalloon: boolean;
  termMonths: number;
  annualMileage: number;
  customerType: CustomerTypeRate;
  customerIsVatBusiness: boolean;
}

function buildProgrammeContext(
  cashValue: CashValueLookup | null,
  rate: InterestRateMatchUi | null,
  programme: FinanceProgramme,
): ProgrammeContext {
  if (!cashValue) {
    return { programme, cashGbp: null, pricingBreakdown: null, interestRate: rate };
  }
  const resolved = resolveProgrammePrice(cashValue, programme);
  return {
    programme,
    cashGbp: resolved.cashGbp,
    pricingBreakdown: resolved.breakdown,
    interestRate: rate,
  };
}

export async function loadFinanceContext(input: LoadContextInput): Promise<FinanceQuoteContext> {
  const ofpClass = input.vehicleClass === "van" ? "cv" : "pv";
  const ofpRoute = input.fundingRoute === "pcp" ? "pcp" : input.fundingRoute === "hp_balloon" ? "hp_balloon" : null;

  // Look up both programme rates in parallel so the form can compare.
  const rateLookup = (programme: FinanceProgramme) => findBestInterestRate({
    vehicleClass: input.vehicleClass,
    bucket: input.bucket,
    customerType: input.customerType,
    financeProgramme: programme,
    fundingRoute: input.fundingRoute,
    termMonths: input.termMonths,
  });

  const [
    cashValue,
    rate1n,
    rate1f,
    stockTurn,
    evOffer,
    tradeIn,
    testDrive,
    businessDiscount,
    ofpCandidates,
  ] = await Promise.all([
    findCashValue({
      bucket: input.bucket,
      variant: input.variant,
      derivative: input.derivative,
      modelYear: input.modelYear,
    }),
    rateLookup("1n"),
    rateLookup("1f"),
    findApplicableStockTurnRules({
      bucket: input.bucket,
      modelYear: input.modelYear,
      gateRelease: input.gateRelease,
    }),
    findEvOffer({
      vehicleClass: input.vehicleClass,
      bucket: input.bucket,
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      fundingRoute: input.fundingRoute,
      isEv: input.isEv,
    }),
    findTradeInOffers({
      vehicleClass: input.vehicleClass,
      bucket: input.bucket,
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      fundingRoute: input.fundingRoute,
      isEv: input.isEv,
    }),
    findTestDriveOffers({
      vehicleClass: input.vehicleClass,
      bucket: input.bucket,
      customerType: input.customerType,
      customerIsVatBusiness: input.customerIsVatBusiness,
      fundingRoute: input.fundingRoute,
      isEv: input.isEv,
    }),
    findBusinessDiscount({
      vehicleClass: input.vehicleClass,
      bucket: input.bucket,
      customerType: input.customerIsVatBusiness ? "business" : "retail",
      customerIsVatBusiness: input.customerIsVatBusiness,
      fundingRoute: input.fundingRoute,
      isEv: input.isEv,
    }),
    input.needsBalloon && ofpRoute
      ? findOfpCandidates({
          vehicleClass: ofpClass,
          fundingRoute: ofpRoute,
          vehicleBucket: input.bucket,
          vehicleVariant: input.variant,
          vehicleDerivative: input.derivative,
          modelYear: input.modelYear,
          termMonths: input.termMonths,
          annualMileage: input.annualMileage,
        })
      : Promise.resolve([] as OfpCandidate[]),
  ]);

  return {
    programmes: {
      "1n": buildProgrammeContext(cashValue, rate1n, "1n"),
      "1f": buildProgrammeContext(cashValue, rate1f, "1f"),
    },
    hasComponentPricing: !!cashValue?.pricing.retailPriceGbp,
    ofpCandidates,
    stockTurnRules: stockTurn.map((r) => ({
      id: r.id, label: r.label, bonusGbp: r.bonusGbp, mustRegisterBy: r.mustRegisterBy, notes: r.notes,
    })),
    evOffer,
    tradeInOffers: tradeIn,
    testDriveOffers: testDrive,
    businessDiscount,
  };
}

// Server-side: resolve an OFP id back to its row so the save action
// can trust the balloon value persisted on the quote.
export async function findOfpRowById(id: number): Promise<{ balloonGbp: number; vehicle: string; modelYear: string | null } | null> {
  const [row] = await db.select().from(brokerOfpData).where(eq(brokerOfpData.id, id)).limit(1);
  if (!row) return null;
  return { balloonGbp: row.balloonGbp, vehicle: row.vehicle, modelYear: row.modelYear };
}
