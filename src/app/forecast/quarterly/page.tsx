import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import { QuarterlyClient } from "./quarterly-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ForecastQuarterlyPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth();

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <QuarterlyClient month={month} />
    </div>
  );
}
