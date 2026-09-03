import { db } from "@/db";
import { preRegVehicles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { loadMappedStock } from "@/lib/stock-list";
import { PreRegForm, type Choices } from "./form";
import { PreRegList, type PreRegRow } from "./list";

export const dynamic = "force-dynamic";

// The dropdowns are built from the mapped stock list rather than the raw
// feed, so what you pick is already in the tidied vocabulary the stock list
// displays — choosing "1.0L EcoBoost 125PS" gives a vehicle that groups with
// every other one of those, instead of a near-miss spelling that filters
// as its own value.
export default async function PreRegPage() {
  await requireAdmin();
  const [{ rows }, existing] = await Promise.all([
    loadMappedStock(),
    db.select().from(preRegVehicles).orderBy(desc(preRegVehicles.createdAt)),
  ]);

  const distinct = (pick: (r: (typeof rows)[number]) => string | null | undefined) =>
    [...new Set(rows.map(pick).filter((v): v is string => !!v && v !== "—"))].sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
    );

  const choices: Choices = {
    bucket:       distinct((r) => r.bucket),
    variant:      distinct((r) => r.variant),
    derivative:   distinct((r) => r.derivative),
    bodyStyle:    distinct((r) => r.bodyStyle),
    engine:       distinct((r) => r.engine),
    transmission: distinct((r) => r.transmission),
    drive:        distinct((r) => r.drive),
    colour:       distinct((r) => r.colour),
    modelYear:    distinct((r) => r.modelYear),
    dealer:       distinct((r) => r.dealer),
    destination:  distinct((r) => r.destination),
  };

  const vehicles: PreRegRow[] = existing.map((v) => ({
    id: v.id,
    bucket: v.bucket,
    variant: v.variant,
    derivative: v.derivative,
    colour: v.colour,
    engine: v.engine,
    regNumber: v.regNumber,
    registeredAt: v.registeredAt.toISOString(),
    dealer: v.dealer,
    status: v.status,
    soldAt: v.soldAt ? v.soldAt.toISOString() : null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Pre-registered vehicles</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Entered by hand and merged into both stock lists, tagged{" "}
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">Pre-registered</span>.
        They live outside the uploaded stock, so a stock upload never wipes them.
      </p>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        Every dropdown is built from what the current stock actually contains, so a pre-reg groups and filters with
        everything else. Pick <span className="font-medium">Other</span> on any of them to type a value that is not
        there yet. Brokers see the registration date but never the reg number or VIN.
      </p>

      <div className="mt-6">
        <PreRegForm choices={choices} />
      </div>

      <PreRegList vehicles={vehicles} />
    </div>
  );
}
