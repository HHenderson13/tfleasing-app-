import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import {
  COMMISSION_TIERS,
  buildBrokerRows,
  commissionFileLabel,
  loadBrokerSourceRows,
  loadInterestRates,
} from "@/lib/broker-ratebooks";
import { buildZip } from "@/lib/mini-zip";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADER = [
  "CapId",
  "AnnualMileage",
  "InitialRentalMultiplier",
  "TermLength",
  "MonthlyRentalPrice",
  "MonthlyMaintenancePrice",
  "InStock",
  "SpecialOffer",
  "IncludesMetallicPaint",
  "PreRegistered",
  "BalloonPayment",
  "Tags",
  "OutrightPurchasePrice",
  "OutrightPurchaseBusinessPrice",
  "OutrightPurchaseDeliveryCost",
  "OutrightPurchaseRegistrationFee",
  "OutrightPurchaseRoadTax",
  "ExcessMileage",
  "Funder",
];

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    await requireAdmin();
    const [source, rates] = await Promise.all([loadBrokerSourceRows(), loadInterestRates()]);
    if (source.length === 0) {
      return NextResponse.json({ error: "No ratebook data found" }, { status: 404 });
    }

    // Per-tier rows are built once, then split into cars vs vans so each
    // tier produces two CSVs (Cars + Vans). MotorComplete loads them into
    // separate catalogues on their side, so they want them as separate
    // files rather than a single mixed CSV.
    const entries = COMMISSION_TIERS.flatMap((commission) => {
      const rows = buildBrokerRows(source, commission, rates);
      const cars = rows.filter((r) => !r.isVan);
      const vans = rows.filter((r) => r.isVan);
      return [
        { kind: "Cars" as const, rows: cars },
        { kind: "Vans" as const, rows: vans },
      ].map(({ kind, rows: subset }) => {
        const lines: string[] = [HEADER.join(",")];
        for (const r of subset) {
          lines.push(
            [
              // MotorComplete's CapId expects the numeric CAP master ID (col E of
              // source); fall back to capCode if a vehicle hasn't been re-ingested
              // since the cap_id column was added.
              csvEscape(r.capId ?? r.capCode),
              r.annualMileage,
              r.initialRentalMultiplier,
              r.termMonths,
              r.monthlyRental.toFixed(2),
              r.monthlyMaintenance.toFixed(2),
              "", // InStock
              "", // SpecialOffer
              "", // IncludesMetallicPaint
              "", // PreRegistered
              "", // BalloonPayment
              "", // Tags
              "", // OutrightPurchasePrice
              "", // OutrightPurchaseBusinessPrice
              "", // OutrightPurchaseDeliveryCost
              "", // OutrightPurchaseRegistrationFee
              "", // OutrightPurchaseRoadTax
              r.excessMileage ?? "",
              csvEscape(r.funderName),
            ].join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";
        return {
          name: `TrustFord Broker Ratebook - ${commissionFileLabel(commission)} - ${kind}.csv`,
          data: Buffer.from(csv, "utf8"),
        };
      });
    });

    const zip = buildZip(entries);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="TrustFord Broker Ratebooks - MotorComplete.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logError("api/broker-ratebooks/motorcomplete", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
