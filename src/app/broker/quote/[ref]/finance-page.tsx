import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference } from "@/lib/broker-vehicle";
import { loadMappedStock, isEvBucket, isVanBucket } from "@/lib/stock-list";
import { vehicleSnapshotFromMapped } from "@/lib/broker-quotes";
import { loadFinanceContext } from "@/lib/broker-finance-context";
import { BrokerHeader } from "../../header";
import { FinanceQuoteForm, type FinanceRouteForm } from "./finance-form";

interface RouteCopy {
  title: string;
  blurb: string;
  needsBalloon: boolean;
  defaultTerm: number;
  defaultMileage: number;
}

const ROUTE_COPY: Record<FinanceRouteForm, RouteCopy> = {
  pcp: {
    title: "Personal Contract Purchase (PCP)",
    blurb: "Deposit + monthly payments + optional final payment (balloon). Customer can return, retain or part-exchange at the end.",
    needsBalloon: true,
    defaultTerm: 36,
    defaultMileage: 9000,
  },
  hp: {
    title: "Hire Purchase (HP)",
    blurb: "Deposit + equal monthly payments over the term. Customer owns the vehicle at the end.",
    needsBalloon: false,
    defaultTerm: 36,
    defaultMileage: 12000,
  },
  hp_balloon: {
    title: "Hire Purchase with Balloon",
    blurb: "Deposit + monthly payments + a final balloon payment the customer commits to.",
    needsBalloon: true,
    defaultTerm: 36,
    defaultMileage: 9000,
  },
};

const TERM_OPTIONS = new Set([24, 26, 36, 38, 48, 60]);
const MILEAGE_OPTIONS_PV = new Set([6000, 9000, 12000, 15000, 18000, 24000]);
const MILEAGE_OPTIONS_CV = new Set([9000, 12000, 18000, 24000, 30000, 36000]);

interface PageProps {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ term?: string; mileage?: string }>;
  route: FinanceRouteForm;
}

export async function renderFinanceQuotePage({ params, searchParams, route }: PageProps) {
  const me = await requireBrokerUser();
  const { ref } = await params;
  const sp = await searchParams;
  const vehicle = await findVehicleByReference(ref);
  if (!vehicle) notFound();
  const { rows } = await loadMappedStock();
  const mapped = rows.find((r) => r.vin === vehicle.vin);
  if (!mapped) notFound();

  const copy = ROUTE_COPY[route];
  const vehicleClass: "car" | "van" = isVanBucket(mapped.bucket) ? "van" : "car";
  const mileageSet = vehicleClass === "van" ? MILEAGE_OPTIONS_CV : MILEAGE_OPTIONS_PV;

  // searchParams override the defaults so the broker can adjust term /
  // mileage and have the server pre-load the right OFP + interest row.
  const requestedTerm = parseInt(sp.term ?? "", 10);
  const requestedMileage = parseInt(sp.mileage ?? "", 10);
  const term = TERM_OPTIONS.has(requestedTerm) ? requestedTerm : copy.defaultTerm;
  const mileage = mileageSet.has(requestedMileage) ? requestedMileage : copy.defaultMileage;

  const snapshot = vehicleSnapshotFromMapped(mapped);
  const context = await loadFinanceContext({
    vehicleClass,
    bucket: mapped.bucket,
    variant: mapped.variant,
    derivative: mapped.derivative,
    modelYear: mapped.modelYear,
    gateRelease: mapped.gateRelease,
    isEv: isEvBucket(mapped.bucket),
    fundingRoute: route,
    needsBalloon: copy.needsBalloon,
    termMonths: term,
    annualMileage: mileage,
    // Phase 5 doesn't switch business lookups based on customer toggle —
    // we surface the rule for the eligible (business + VAT) case and the
    // form decides whether to apply.
    customerType: "business",
    customerIsVatBusiness: true,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quote" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/broker/quote/${ref}`} className="text-xs text-slate-500 hover:text-slate-900">← Pick a different route</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{copy.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{copy.blurb}</p>
        <div className="mt-1 text-xs text-slate-400">
          Reference <span className="font-mono font-semibold text-slate-700">{ref}</span>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-slate-900">{snapshot.bucket}</span>
            <span className="text-base text-slate-700">{snapshot.variant}</span>
            {snapshot.derivative && <span className="text-xs text-slate-500">· {snapshot.derivative}</span>}
            {snapshot.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{snapshot.modelYear}</span>}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 space-x-2">
            {snapshot.bodyStyle && <span>{snapshot.bodyStyle}</span>}
            {snapshot.engine && <span>· {snapshot.engine}</span>}
            {snapshot.transmission && <span>· {snapshot.transmission}</span>}
            {snapshot.drive && <span>· {snapshot.drive}</span>}
            <span>· {snapshot.colour}</span>
          </div>
        </section>

        <FinanceQuoteForm
          ref={ref}
          route={route}
          snapshotJson={JSON.stringify(snapshot)}
          defaultCashGbp={context.defaultCashGbp}
          interestRate={context.interestRate}
          ofpCandidates={context.ofpCandidates}
          stockTurnRules={context.stockTurnRules}
          evOffer={context.evOffer}
          tradeInOffers={context.tradeInOffers}
          testDriveOffers={context.testDriveOffers}
          businessDiscount={context.businessDiscount}
          vehicleLookup={{
            vehicleClass,
            bucket: mapped.bucket,
            variant: mapped.variant,
            derivative: mapped.derivative,
            modelYear: mapped.modelYear,
            isEv: isEvBucket(mapped.bucket),
            gateRelease: mapped.gateRelease,
          }}
          initialTermMonths={term}
          initialAnnualMileage={mileage}
        />
      </main>
    </div>
  );
}
