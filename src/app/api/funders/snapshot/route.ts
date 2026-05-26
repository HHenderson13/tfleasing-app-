import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ratebook, vehicles, funders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Returns every ratebook rate (across all term/mileage combos) joined with
// vehicle metadata. Filters: contract (VAT toggle), maintenance, IRM.
// The client computes wins / averages / drill-downs across slots.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const u = new URL(req.url);
    const contract = u.searchParams.get("contract") === "PCH" ? "PCH" : "BCH";
    const maintenance = u.searchParams.get("maintenance") === "maintained" ? "maintained" : "customer";
    const irm = parseInt(u.searchParams.get("irm") || "6", 10);
    const isMaintained = maintenance === "maintained";
    const vatMultiplier = contract === "PCH" ? 1.2 : 1;

    const [allFunders, rows, irmOptions] = await Promise.all([
      db.select().from(funders),
      db
        .select({
          funderId: ratebook.funderId,
          capCode: ratebook.capCode,
          termMonths: ratebook.termMonths,
          annualMileage: ratebook.annualMileage,
          monthlyRental: ratebook.monthlyRental,
          monthlyMaintenance: ratebook.monthlyMaintenance,
          model: vehicles.model,
          derivative: vehicles.derivative,
          isVan: vehicles.isVan,
          fuelType: vehicles.fuelType,
          listPriceNet: vehicles.listPriceNet,
        })
        .from(ratebook)
        .innerJoin(vehicles, eq(vehicles.capCode, ratebook.capCode))
        .where(
          and(
            eq(ratebook.initialRentalMultiplier, irm),
            eq(ratebook.isBusiness, true),
            eq(ratebook.isMaintained, isMaintained),
            sql`${vehicles.model} != 'Unknown'`,
          )
        ),
      db
        .selectDistinct({ v: ratebook.initialRentalMultiplier })
        .from(ratebook)
        .orderBy(ratebook.initialRentalMultiplier),
    ]);

    const rates = rows.map((r) => ({
      funderId: r.funderId,
      capCode: r.capCode,
      termMonths: r.termMonths,
      annualMileage: r.annualMileage,
      model: r.model,
      derivative: r.derivative,
      isVan: r.isVan,
      fuelType: r.fuelType,
      listPriceNet: r.listPriceNet,
      monthlyRental: r.monthlyRental * vatMultiplier,
      monthlyMaintenance: r.monthlyMaintenance * vatMultiplier,
      totalMonthly:
        r.monthlyRental * vatMultiplier + r.monthlyMaintenance * vatMultiplier,
    }));

    return NextResponse.json({
      funders: allFunders,
      rates,
      filterOptions: {
        irms: irmOptions.map((i) => i.v),
      },
      filters: { contract, maintenance, irm },
    });
  } catch (e) {
    logError("api/funders/snapshot", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
