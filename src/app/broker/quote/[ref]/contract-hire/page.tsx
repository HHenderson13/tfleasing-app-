import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference } from "@/lib/broker-vehicle";
import { isEvBucket, isVanBucket, loadMappedStock } from "@/lib/stock-list";
import { vehicleSnapshotFromMapped } from "@/lib/broker-quotes";
import { findCashValue } from "@/lib/broker-cash-values";
import { findContractHireAvailability, findContractHireOptions } from "@/lib/broker-ch-lookup";
import { findApplicableStockTurnRules } from "@/lib/broker-stock-turn";
import {
  findBusinessDiscount,
  findEvOffer,
  findTestDriveOffers,
  findTradeInOffers,
} from "@/lib/broker-incentives";
import { BrokerHeader } from "../../../header";
import { ContractHireForm } from "./form";

export const dynamic = "force-dynamic";

interface ChSearchParams {
  term?: string;
  mileage?: string;
  irm?: string;
  business?: string;
  maintained?: string;
}

export default async function ContractHireQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<ChSearchParams>;
}) {
  const me = await requireBrokerUser();
  const { ref } = await params;
  const sp = await searchParams;
  const vehicle = await findVehicleByReference(ref);
  if (!vehicle) notFound();
  const { rows } = await loadMappedStock();
  const mapped = rows.find((r) => r.vin === vehicle.vin);
  if (!mapped) notFound();
  const snapshot = vehicleSnapshotFromMapped(mapped);

  // Cap code lives on the cash-value row admins maintain in
  // Broker data → Cash values. Without it we can't bridge to ratebook,
  // and the form renders a "ask admin to set a cap code" prompt.
  const cashValue = await findCashValue({
    bucket: mapped.bucket,
    variant: mapped.variant,
    derivative: mapped.derivative,
    modelYear: mapped.modelYear,
  });
  const capCode = cashValue?.capCode ?? null;
  const vehicleClass: "car" | "van" = isVanBucket(mapped.bucket) ? "van" : "car";

  // Defaults — we'll override from query params when the broker clicks
  // a different combination on the form. isBusiness drives PCH (false)
  // vs BCH (true) ratebook lookup; isMaintained toggles the maintained
  // version of the ratebook.
  const requestedIsBusiness = sp.business === "1";
  const requestedIsMaintained = sp.maintained === "1";
  const requestedTerm = parseInt(sp.term ?? "", 10);
  const requestedMileage = parseInt(sp.mileage ?? "", 10);
  const requestedIrm = parseInt(sp.irm ?? "", 10);

  const availability = capCode
    ? await findContractHireAvailability(capCode, requestedIsBusiness, requestedIsMaintained)
    : { irms: [], terms: [], mileages: [] };

  // If the user-requested combo isn't in the ratebook we silently fall
  // back to a default that IS in there so the form renders something
  // useful instead of an empty table.
  const term = availability.terms.includes(requestedTerm)
    ? requestedTerm
    : (availability.terms.find((t) => t === 36) ?? availability.terms[0] ?? 36);
  const mileage = availability.mileages.includes(requestedMileage)
    ? requestedMileage
    : (availability.mileages.find((m) => m === 10000 || m === 12000) ?? availability.mileages[0] ?? 10000);
  const irm = availability.irms.includes(requestedIrm)
    ? requestedIrm
    : (availability.irms.find((i) => i === 6 || i === 9) ?? availability.irms[0] ?? 6);

  const [chOptions, stockTurnRules, evOffer, tradeInOffers, testDriveOffers, businessDiscount] = await Promise.all([
    capCode
      ? findContractHireOptions({
          capCode,
          termMonths: term,
          annualMileage: mileage,
          isBusiness: requestedIsBusiness,
          isMaintained: requestedIsMaintained,
        })
      : Promise.resolve([]),
    findApplicableStockTurnRules({ bucket: mapped.bucket, modelYear: mapped.modelYear, gateRelease: mapped.gateRelease }),
    findEvOffer({ vehicleClass, bucket: mapped.bucket, customerType: "retail", customerIsVatBusiness: false, fundingRoute: "contract_hire", isEv: isEvBucket(mapped.bucket) }),
    findTradeInOffers({ vehicleClass, bucket: mapped.bucket, customerType: "retail", customerIsVatBusiness: false, fundingRoute: "contract_hire", isEv: isEvBucket(mapped.bucket) }),
    findTestDriveOffers({ vehicleClass, bucket: mapped.bucket, customerType: "retail", customerIsVatBusiness: false, fundingRoute: "contract_hire", isEv: isEvBucket(mapped.bucket) }),
    findBusinessDiscount({ vehicleClass, bucket: mapped.bucket, customerType: "business", customerIsVatBusiness: true, fundingRoute: "contract_hire", isEv: isEvBucket(mapped.bucket) }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quote" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/broker/quote/${ref}`} className="text-xs text-slate-500 hover:text-slate-900">← Pick a different route</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Contract Hire</h1>
        <p className="mt-1 text-xs text-slate-500">Long-term rental — initial rental + monthly rentals, customer hands the vehicle back at the end.</p>
        <div className="mt-1 text-xs text-slate-400">Reference <span className="font-mono font-semibold text-slate-700">{ref}</span></div>

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
          <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
            Cap code: <span className="font-mono text-slate-700">{capCode ?? "— not set"}</span>
          </div>
        </section>

        {!capCode ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
            <div className="text-3xl">🔧</div>
            <h2 className="mt-2 text-sm font-semibold text-amber-900">No cap code mapped for this vehicle yet</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-amber-900/80">
              Contract Hire pricing comes from the funder ratebook keyed on Ford&apos;s cap code.
              Ask your TrustFord contact to set a cap code on this vehicle in <strong>Broker data → Pricing</strong>, then refresh this page.
            </p>
          </div>
        ) : availability.terms.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
            <div className="text-3xl">📭</div>
            <h2 className="mt-2 text-sm font-semibold text-amber-900">No Contract Hire rentals loaded for cap code {capCode}</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-amber-900/80">
              The ratebook doesn&apos;t cover this vehicle on the current maintenance / customer type yet — try toggling the buttons,
              or ask admin to confirm the latest ratebook upload.
            </p>
          </div>
        ) : (
          <ContractHireForm
            ref={ref}
            snapshotJson={JSON.stringify(snapshot)}
            capCode={capCode}
            availability={availability}
            options={chOptions}
            initialIsBusiness={requestedIsBusiness}
            initialIsMaintained={requestedIsMaintained}
            initialTerm={term}
            initialMileage={mileage}
            initialIrm={irm}
            stockTurnRules={stockTurnRules.map((r) => ({
              id: r.id, label: r.label, bonusGbp: r.bonusGbp, mustRegisterBy: r.mustRegisterBy, notes: r.notes,
            }))}
            evOffer={evOffer}
            tradeInOffers={tradeInOffers}
            testDriveOffers={testDriveOffers}
            businessDiscount={businessDiscount}
          />
        )}
      </main>
    </div>
  );
}
