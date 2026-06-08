import "server-only";
import { db } from "@/db";
import { brokerOfpData } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findCashValue } from "./broker-cash-values";
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

// Vehicle class on the broker portal is always concrete — 'car' or 'van'.
// The interest-rates lookup also accepts 'all' as a scope label, but a
// real quote can never be against an 'all' vehicle, so we narrow here.
type ConcreteVehicleClass = "car" | "van";

// Loads every piece of data the finance form needs in parallel.
// Shared by /broker/quote/[ref]/pcp|hp|hp-balloon so all three routes
// open with identical context — only the form's prompts + balloon
// behaviour differ.

export interface FinanceQuoteContext {
  // From cash-values table (admin-set). Form pre-fills the cash field.
  defaultCashGbp: number | null;
  // Interest rate + deposit allowance for the chosen term, ranked
  // exact-bucket → class → 'all'. Null if no row matches.
  interestRate: {
    id: string;
    label: string;
    annualAprPct: number;
    depositAllowanceGbp: number | null;
    specificity: 3 | 2 | 1;
  } | null;
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

export async function loadFinanceContext(input: LoadContextInput): Promise<FinanceQuoteContext> {
  const ofpClass = input.vehicleClass === "van" ? "cv" : "pv";
  const ofpRoute = input.fundingRoute === "pcp" ? "pcp" : input.fundingRoute === "hp_balloon" ? "hp_balloon" : null;

  const [
    cashValue,
    rate,
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
    findBestInterestRate({
      vehicleClass: input.vehicleClass,
      bucket: input.bucket,
      customerType: input.customerType,
      fundingRoute: input.fundingRoute,
      termMonths: input.termMonths,
    }),
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
    defaultCashGbp: cashValue?.cashGbp ?? null,
    interestRate: rate,
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
