import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import { loadForecastConfig } from "@/lib/forecast";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function ForecastAdminPage() {
  await requireAdmin();
  const config = await loadForecastConfig();
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <AdminClient
        config={config.map((c) => ({
          key: c.key,
          value: c.value,
          description: c.description ?? null,
          category: c.category,
        }))}
      />
    </div>
  );
}
