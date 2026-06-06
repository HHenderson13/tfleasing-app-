import "server-only";
import { db } from "@/db";
import { brokerVehicleCashValues } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface VehicleKey {
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
}

export interface CashValueLookup {
  cashGbp: number;
  marginGbp: number | null;
  marginPct: number | null;
  capCode: string | null;
  capId: string | null;
  notes: string | null;
}

// Strict-match lookup. The cash-value row is keyed exactly on the broker-
// visible attributes — bucket / variant / derivative / model year — so
// the quote form can pre-fill the moment those four fields uniquely
// resolve. derivative and modelYear are nullable; we match nulls
// explicitly so an "unset" admin row pairs with "no derivative on the
// stock vehicle".
export async function findCashValue(key: VehicleKey): Promise<CashValueLookup | null> {
  // Equality on NULL doesn't match in SQL, so we branch the WHERE for
  // each combination. Cheap — only 4 variants and brokerVehicleCashValues
  // is indexed on the same columns.
  const whereClauses = [
    eq(brokerVehicleCashValues.bucket, key.bucket),
    eq(brokerVehicleCashValues.variant, key.variant),
    key.derivative === null
      ? // SQLite IS NULL — drizzle's eq() doesn't generate IS NULL, so
        // we re-load all rows for this bucket/variant and match in JS
        // for the null-derivative case. Tiny payload.
        undefined
      : eq(brokerVehicleCashValues.derivative, key.derivative),
    key.modelYear === null
      ? undefined
      : eq(brokerVehicleCashValues.modelYear, key.modelYear),
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const rows = await db
    .select()
    .from(brokerVehicleCashValues)
    .where(and(...whereClauses));
  const exact = rows.find((r) =>
    (r.derivative ?? null) === key.derivative &&
    (r.modelYear ?? null) === key.modelYear,
  );
  if (!exact) return null;
  return {
    cashGbp: exact.cashGbp,
    marginGbp: exact.marginGbp,
    marginPct: exact.marginPct,
    capCode: exact.capCode,
    capId: exact.capId,
    notes: exact.notes,
  };
}
