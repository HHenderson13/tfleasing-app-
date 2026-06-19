import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import { listForecastUploads, listForecastLinesForMonth } from "@/lib/forecast";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function quarterLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor((m - 1) / 3) + 1;
  return `Q${q} ${y}`;
}

export default async function ForecastHubPage() {
  await requireAdmin();
  const month = currentMonth();
  const [uploads, lines] = await Promise.all([
    listForecastUploads(),
    listForecastLinesForMonth(month),
  ]);

  const lineCount = lines.length;
  const uploadCount = uploads.length;
  const lastUpload = uploads[0];

  const tiles = [
    {
      href: "/forecast/monthly",
      title: "Monthly Forecast",
      desc: `Lease New Cars, Lease New CV and General Overheads — line-by-line for ${monthLabel(month)}.`,
      tone: "from-sky-500 to-blue-700",
      footer: `${lineCount} dealbook line${lineCount === 1 ? "" : "s"} for this month`,
    },
    {
      href: "/forecast/quarterly",
      title: "Quarterly Forecast",
      desc: `Three-months-across BPM layout — PBT, physicals and bonus opportunity. Currently in ${quarterLabel(month)}.`,
      tone: "from-violet-500 to-indigo-700",
      footer: "Quarter view + YTD rollups",
    },
    {
      href: "/forecast/uploads",
      title: "Uploads",
      desc: "Drop the dealbook CSV from each department, then allocate any units registered in a previous month.",
      tone: "from-emerald-500 to-teal-700",
      footer: lastUpload
        ? `Last upload: ${new Date(lastUpload.uploadedAt).toLocaleDateString("en-GB")} (${uploadCount} total)`
        : "No uploads yet",
    },
    {
      href: "/forecast/admin",
      title: "Admin",
      desc: "Percentages, multipliers and the math that drives the forecast and quarterly views.",
      tone: "from-amber-500 to-orange-700",
      footer: "Configurable rates and constants",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Forecast</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monthly P&amp;L forecasts and the quarterly rollup that feeds BPM. Pick a section to start.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            Active month: <span className="font-semibold text-slate-700">{monthLabel(month)}</span>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.tone}`} />
              <div className="text-xl font-semibold text-slate-900 group-hover:text-slate-950">{t.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{t.desc}</p>
              <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.footer}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
