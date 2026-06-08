import "server-only";
import { db } from "@/db";
import { brokerOfpData } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// Look up the OFP balloon value for a given vehicle / route / term /
// mileage. Vehicle descriptions in the OFP table come from Ford's
// quarterly export (verbatim strings like "Focus ST-Line 1.0 EcoBoost
// MHEV 125ps 5dr") whereas stock vehicles arrive via Dealerweb with
// separate bucket / variant / derivative fields. We fuzzy-match by
// requiring every "word" from the stock-vehicle description to appear
// (case-insensitive) in the OFP vehicle string.
//
// If multiple OFP rows match the same vehicle + term + mileage, we
// return them all so the caller can show a picker — admins occasionally
// upload duplicate trims that differ only in option pack.

export interface OfpLookupContext {
  vehicleClass: "cv" | "pv";
  fundingRoute: "pcp" | "hp_balloon";
  vehicleBucket: string;
  vehicleVariant: string;
  vehicleDerivative: string | null;
  modelYear: string | null;
  termMonths: number;
  annualMileage: number;
}

export interface OfpCandidate {
  id: number;
  vehicle: string;
  modelYear: string | null;
  balloonGbp: number;
  matchScore: number;          // higher = better match
}

const COMMON_NOISE = new Set([
  "the", "and", "for", "with", "of", "ford",
  // engine spec noise that varies frequently between descriptions:
  "ps", "cc",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !COMMON_NOISE.has(w));
}

export async function findOfpCandidates(ctx: OfpLookupContext): Promise<OfpCandidate[]> {
  const rows = await db
    .select()
    .from(brokerOfpData)
    .where(and(
      eq(brokerOfpData.vehicleClass, ctx.vehicleClass),
      eq(brokerOfpData.fundingRoute, ctx.fundingRoute),
      eq(brokerOfpData.termMonths, ctx.termMonths),
      eq(brokerOfpData.annualMileage, ctx.annualMileage),
    ));

  const stockTokens = new Set([
    ...tokens(ctx.vehicleBucket),
    ...tokens(ctx.vehicleVariant),
    ...(ctx.vehicleDerivative ? tokens(ctx.vehicleDerivative) : []),
  ]);
  if (stockTokens.size === 0) return [];

  const candidates: OfpCandidate[] = [];
  for (const r of rows) {
    // Model year mismatch is allowed but penalised — Ford OFP tables
    // sometimes lag the stock list by a quarter.
    const ofpTokens = new Set(tokens(r.vehicle));
    let matched = 0;
    for (const t of stockTokens) if (ofpTokens.has(t)) matched++;
    // Require at least 2 token matches so a generic "Focus" doesn't pull
    // in every Focus row.
    if (matched < 2) continue;
    let score = matched;
    if (ctx.modelYear && r.modelYear === ctx.modelYear) score += 5;
    candidates.push({
      id: r.id,
      vehicle: r.vehicle,
      modelYear: r.modelYear,
      balloonGbp: r.balloonGbp,
      matchScore: score,
    });
  }
  candidates.sort((a, b) => b.matchScore - a.matchScore || a.vehicle.localeCompare(b.vehicle));
  return candidates;
}

// Convenience: returns the single best candidate if there's one clear
// winner (score 2+ ahead of the runner-up), otherwise null. Use the
// fuller findOfpCandidates() when you want to surface a chooser.
export async function findBestOfp(ctx: OfpLookupContext): Promise<OfpCandidate | null> {
  const all = await findOfpCandidates(ctx);
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  if (all[0].matchScore - all[1].matchScore >= 2) return all[0];
  return null;
}
