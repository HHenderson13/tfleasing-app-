import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import { loadForecastActuals, loadForecastConfig } from "@/lib/forecast";
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

export default async function ForecastAdminPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = (sp.tab === "baselines" || sp.tab === "published") ? sp.tab : "math";
  const sheet: SheetKey = sp.sheet === "cv" ? "cv" : sp.sheet === "overheads" ? "overheads" : "car";
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth();

  const [config, actuals] = await Promise.all([
    loadForecastConfig(),
    tab === "math" ? Promise.resolve([] as Awaited<ReturnType<typeof loadForecastActuals>>) : loadForecastActuals(month),
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
      />
    </div>
  );
}
