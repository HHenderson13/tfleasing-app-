import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  loadForecastActuals,
  loadForecastConfig,
  loadForecastVehicles,
  loadVehicleBonuses,
} from "@/lib/forecast";
import { AdminClient } from "./admin-client";
import type { SheetKey } from "../line-definitions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string; sheet?: string; month?: string }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const VALID_TABS = ["math", "baselines", "published", "vehicles"] as const;
type Tab = (typeof VALID_TABS)[number];

export default async function ForecastAdminPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = VALID_TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "math";
  const sheet: SheetKey = sp.sheet === "cv" ? "cv" : sp.sheet === "overheads" ? "overheads" : "car";
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth();

  const needsActuals = tab === "baselines" || tab === "published";
  const needsVehicles = tab === "vehicles";

  const [config, actuals, vehicles, bonuses] = await Promise.all([
    loadForecastConfig(),
    needsActuals ? loadForecastActuals(month) : Promise.resolve([] as Awaited<ReturnType<typeof loadForecastActuals>>),
    needsVehicles ? loadForecastVehicles() : Promise.resolve([] as Awaited<ReturnType<typeof loadForecastVehicles>>),
    needsVehicles ? loadVehicleBonuses() : Promise.resolve([] as Awaited<ReturnType<typeof loadVehicleBonuses>>),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <AdminClient
        tab={tab}
        sheet={sheet}
        month={month}
        config={config.map((c) => ({
          key: c.key,
          value: c.value,
          description: c.description ?? null,
          category: c.category,
        }))}
        actuals={actuals
          .filter((a) => a.sheet === sheet)
          .map((a) => ({ lineKey: a.lineKey, value: a.value }))}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          kind: v.kind,
          keywords: v.keywords,
          sortOrder: v.sortOrder,
        }))}
        bonuses={bonuses.map((b) => ({
          vehicleId: b.vehicleId,
          bonusKey: b.bonusKey,
          value: b.value,
        }))}
      />
    </div>
  );
}
