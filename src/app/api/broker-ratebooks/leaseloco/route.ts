import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth-guard";
import {
  COMMISSION_TIERS,
  buildBrokerRows,
  commissionSheetLabel,
  loadBrokerSourceRows,
} from "@/lib/broker-ratebooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// LeaseLoco-style column set, trimmed per spec:
//   - A SiteID, B Reference removed
//   - O MaintenanceType removed (MaintenanceValue alone distinguishes maintained vs not)
//   - Q DocumentFee removed
//   - S:W (Stock, ExpiryDate, StartDate, Tags, Funder) removed
//   - R ExcessMileage left blank (not tracked in our DB)
const HEADER = [
  "CAP Code",
  "CAPType",
  "CAP ID",
  "Manufacturer",
  "Range",
  "Derivative",
  "FinanceType",
  "DepositType",
  "DepositValue",
  "Term",
  "MonthlyPayment",
  "AnnualMileage",
  "MaintenanceValue",
  "ExcessMileage",
];

export async function GET() {
  try {
    await requireAdmin();
    const source = await loadBrokerSourceRows();
    if (source.length === 0) {
      return NextResponse.json({ error: "No ratebook data found" }, { status: 404 });
    }

    const wb = XLSX.utils.book_new();

    for (const commission of COMMISSION_TIERS) {
      const rows = buildBrokerRows(source, commission);
      const aoa: (string | number)[][] = [HEADER];
      for (const r of rows) {
        aoa.push([
          r.capCode,
          r.isVan ? "LIGHT" : "CAR",
          r.capId ?? "",
          r.manufacturer,
          r.model,
          r.derivative,
          "B", // BCH only for now (PCH not requested)
          "M", // multiplier-style deposit
          r.initialRentalMultiplier,
          r.termMonths,
          r.monthlyRental,
          r.annualMileage,
          r.monthlyMaintenance, // 0 → non-maintained
          r.excessMileage ?? "",
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, commissionSheetLabel(commission));
    }

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="TrustFord Broker Ratebooks - LeaseLoco.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Broker LeaseLoco export error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
