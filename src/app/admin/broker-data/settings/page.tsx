import Link from "next/link";
import { getBrokerSettings, listCarRflBands } from "@/lib/vehicle-master";
import { CarRflBandsCard, GlobalSettingsCard } from "./forms";

export const dynamic = "force-dynamic";

export default async function BrokerSettingsPage() {
  const [settings, bands] = await Promise.all([
    getBrokerSettings(),
    listCarRflBands(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Global figures used by every vehicle. First reg fee and PDI are flat. CV RFL is split by fuel type;
          car RFL is band-based on CO2.
        </p>
      </div>

      <GlobalSettingsCard
        settings={{
          firstRegFeeGbp: settings.firstRegFeeGbp,
          pdiPlatesGbp: settings.pdiPlatesGbp,
          cvRflIcePhevGbp: settings.cvRflIcePhevGbp,
          cvRflBevGbp: settings.cvRflBevGbp,
        }}
      />

      <CarRflBandsCard
        bands={bands.map((b) => ({ id: b.id, co2From: b.co2From, co2To: b.co2To, rflGbp: b.rflGbp }))}
      />
    </div>
  );
}
