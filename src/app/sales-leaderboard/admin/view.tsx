"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  loadUploadDetailAction,
  reattributeAction,
  removeNameMappingAction,
  setNameMappingAction,
  setParticipantAction,
  setPhotoUrlAction,
  uploadReportAction,
  type UploadDetail,
  type UploadResult,
} from "./actions";
import { formatMonthLabel, MONTH_LABELS } from "@/lib/sales-leaderboard";
import type { DeptDashboard } from "@/lib/sales-leaderboard-data";

export interface AdminExec {
  id: string;
  name: string;
  email: string;
  isParticipant: boolean;
  active: boolean;
  photoUrl: string | null;
}

export interface AdminNameMap {
  reportCode: string;
  salesExecId: string;
}

export interface AdminLastUpload {
  yearMonth: string;
  reportType: string;
  uploadedAt: string;
  rowCount: number;
  // false for uploads that pre-date the self-healing schema — those need to
  // be re-uploaded once if the admin wants future map changes to fix stats
  // automatically. Surfaced as a warning on the upload card.
  hasParsedData: boolean;
}

type Tab = "dashboard" | "participants" | "names" | "uploads";

export function LeaderboardAdminView({
  execs,
  nameMap,
  lastUploads,
  initialYearMonth,
  dashboard,
}: {
  execs: AdminExec[];
  nameMap: AdminNameMap[];
  lastUploads: AdminLastUpload[];
  initialYearMonth: string;
  dashboard: DeptDashboard;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  return (
    <div>
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>Department</TabButton>
        <TabButton active={tab === "participants"} onClick={() => setTab("participants")}>Participants</TabButton>
        <TabButton active={tab === "names"} onClick={() => setTab("names")}>Name map</TabButton>
        <TabButton active={tab === "uploads"} onClick={() => setTab("uploads")}>Uploads</TabButton>
      </div>
      <div className="mt-6">
        {tab === "dashboard" && <DashboardTab dashboard={dashboard} />}
        {tab === "participants" && <ParticipantsTab execs={execs} />}
        {tab === "names" && <NameMapTab execs={execs} nameMap={nameMap} />}
        {tab === "uploads" && <UploadsTab initialYearMonth={initialYearMonth} lastUploads={lastUploads} />}
      </div>
    </div>
  );
}

// ─── Department dashboard tab ──────────────────────────────────────────────

function DashboardTab({ dashboard }: { dashboard: DeptDashboard }) {
  const monthLabel = formatMonthLabel(dashboard.yearMonth);
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{monthLabel} — department totals</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.kpis.map((k) => (
            <KpiTile key={k.label} kpi={k} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coaching focus</h3>
        <p className="mt-1 text-xs text-slate-500">Who&apos;s at the bottom of each metric this month — useful starting point for one-to-ones.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {dashboard.coachingFocus.map((c) => (
            <CoachingCard key={c.metric} focus={c} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">6-month trend</h3>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-2 py-3 text-right">Orders</th>
                <th className="px-2 py-3 text-right">Deliveries</th>
                <th className="px-2 py-3 text-right">Insurance</th>
                <th className="px-2 py-3 text-right">Enquiries</th>
                <th className="px-2 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Conv %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.trend.map((t) => {
                const conv = t.enquiryCount > 0 ? (t.salesCount / t.enquiryCount) * 100 : 0;
                const isCurrent = t.yearMonth === dashboard.yearMonth;
                return (
                  <tr key={t.yearMonth} className={isCurrent ? "bg-rose-50/40" : undefined}>
                    <td className="px-4 py-2 font-medium text-slate-700">{formatMonthLabel(t.yearMonth)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.orderCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.deliveryCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.insuranceCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.enquiryCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.salesCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{conv.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ kpi }: { kpi: DeptDashboard["kpis"][number] }) {
  const fmt = (n: number) => kpi.format === "pct" ? `${n.toFixed(1)}%` : String(Math.round(n));
  const delta = kpi.current - kpi.previous;
  const deltaText = kpi.format === "pct" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts` : `${delta >= 0 ? "+" : ""}${Math.round(delta)}`;
  const tone = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-slate-400";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(kpi.current)}</div>
      <div className={`mt-1 text-xs font-medium ${tone}`}>
        {kpi.previous === 0 && kpi.current === 0 ? "—" : `${deltaText} vs last month`}
      </div>
    </div>
  );
}

function CoachingCard({ focus }: { focus: DeptDashboard["coachingFocus"][number] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{focus.metricLabel}</div>
      {focus.bottom && focus.top ? (
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone="rose">Focus</Badge>
            <PersonChip name={focus.bottom.name} photoUrl={focus.bottom.photoUrl} />
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{focus.bottom.value}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="emerald">Top</Badge>
            <PersonChip name={focus.top.name} photoUrl={focus.top.photoUrl} />
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{focus.top.value}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-slate-500">Not enough data for this metric yet.</div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "rose" | "emerald"; children: React.ReactNode }) {
  const cls = tone === "rose"
    ? "bg-rose-100 text-rose-800"
    : "bg-emerald-100 text-emerald-800";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

function PersonChip({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <span className="flex items-center gap-1.5">
      {photoUrl ? (
        <Image src={photoUrl} alt={name} width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-500">
          {name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
        </span>
      )}
      <span className="truncate text-slate-700">{name}</span>
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Participants tab ──────────────────────────────────────────────────────

function ParticipantsTab({ execs }: { execs: AdminExec[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Exec</th>
            <th className="px-4 py-3">Photo</th>
            <th className="px-4 py-3">Participating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {execs.map((e) => (
            <ParticipantRow key={e.id} exec={e} />
          ))}
          {execs.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                No sales execs found. Add some in the user admin first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ParticipantRow({ exec }: { exec: AdminExec }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [photoUrl, setPhotoUrl] = useState(exec.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function toggle(active: boolean) {
    start(async () => {
      const res = await setParticipantAction({ salesExecId: exec.id, active });
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  }

  async function uploadPhoto(file: File) {
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const blob = await upload(`leaderboard-photos/${exec.id}-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const res = await setPhotoUrlAction({ salesExecId: exec.id, photoUrl: blob.url });
      if (!res.ok) throw new Error(res.error);
      setPhotoUrl(blob.url);
      router.refresh();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function clearPhoto() {
    start(async () => {
      const res = await setPhotoUrlAction({ salesExecId: exec.id, photoUrl: null });
      if (!res.ok) alert(res.error);
      else { setPhotoUrl(null); router.refresh(); }
    });
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{exec.name}</div>
        <div className="text-xs text-slate-500">{exec.email}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={exec.name}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-white"

            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-500">
              {initials(exec.name)}
            </div>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
            {uploadingPhoto ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f);
                e.target.value = "";
              }}
              disabled={uploadingPhoto}
            />
          </label>
          {photoUrl && (
            <button
              onClick={clearPhoto}
              disabled={pending}
              className="text-xs text-slate-500 hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>
        {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exec.isParticipant && exec.active}
            onChange={(e) => toggle(e.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">{exec.isParticipant && exec.active ? "In leaderboard" : "Not included"}</span>
        </label>
      </td>
    </tr>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// ─── Name-map tab ──────────────────────────────────────────────────────────

function NameMapTab({ execs, nameMap }: { execs: AdminExec[]; nameMap: AdminNameMap[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [execId, setExecId] = useState(execs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const execName = useMemo(() => new Map(execs.map((e) => [e.id, e.name])), [execs]);

  function add() {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) { setError("Enter a report code"); return; }
    if (!execId) { setError("Pick an exec"); return; }
    start(async () => {
      const res = await setNameMappingAction({ reportCode: trimmed, salesExecId: execId });
      if (!res.ok) setError(res.error ?? "Failed to save");
      else { setCode(""); router.refresh(); }
    });
  }

  function remove(reportCode: string) {
    start(async () => {
      const res = await removeNameMappingAction(reportCode);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Add a mapping</h3>
        <p className="mt-1 text-xs text-slate-500">
          Report codes like <span className="font-mono">GaSh</span> appear in column B of the Dealerweb exports. Map them onto the salesperson on this system.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Report code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="GaSh"
              className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Sales exec
            <select
              value={execId}
              onChange={(e) => setExecId(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {execs.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={add}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save mapping
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Report code</th>
              <th className="px-4 py-3">Maps to</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {nameMap.map((m) => (
              <tr key={m.reportCode}>
                <td className="px-4 py-3 font-mono text-sm">{m.reportCode}</td>
                <td className="px-4 py-3">{execName.get(m.salesExecId) ?? <span className="text-red-600">Unknown exec</span>}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(m.reportCode)}
                    disabled={pending}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {nameMap.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">No mappings yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Uploads tab ───────────────────────────────────────────────────────────

const REPORTS: { type: "orders" | "delivered" | "enquiry"; label: string; note: string }[] = [
  { type: "orders",    label: "Order list",     note: "Upload the Order List report from Dealerweb. Counts rows per exec (col B) for Order Take; vehicle text in col F is used for the interesting-fact line." },
  { type: "delivered", label: "Delivered list", note: "Upload the Dealbook (delivered list) from Dealerweb. Counts rows per exec for Deliveries, and non-zero values in cols W:AC (Diamondbrite, GAP, TrustFord Protect, Tyre, Alloy) for Insurance Products." },
  { type: "enquiry",   label: "Enquiry log",    note: "Upload the Enquiry Log. Counts enquiries per exec (col B); rows where col Q is Ordered or Delivered count as sales for the Conversion % metric." },
];

function UploadsTab({ initialYearMonth, lastUploads }: { initialYearMonth: string; lastUploads: AdminLastUpload[] }) {
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const months = useMemo(() => {
    // Show the last 18 months ending at next month, so admins can both
    // back-fill earlier months and start a new month early.
    const [yStr, mStr] = initialYearMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const opts: { value: string; label: string }[] = [];
    for (let i = -2; i <= 15; i++) {
      const totalMonths = (y * 12 + (m - 1)) - i;
      const yy = Math.floor(totalMonths / 12);
      const mm = (totalMonths % 12) + 1;
      const value = `${yy}-${String(mm).padStart(2, "0")}`;
      opts.push({ value, label: `${MONTH_LABELS[mm - 1]} ${yy}` });
    }
    return opts;
  }, [initialYearMonth]);

  const lastByType = useMemo(() => {
    const m = new Map<string, AdminLastUpload>();
    for (const u of lastUploads) {
      if (u.yearMonth !== yearMonth) continue;
      m.set(u.reportType, u);
    }
    return m;
  }, [lastUploads, yearMonth]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">Month:</span>
          <select
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {months.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Re-uploading replaces this month&apos;s figures for that report.</span>
        </label>
        <ReprocessButton />
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Stats now self-heal: changing the name map or participant list re-runs every stored upload automatically. Just upload each report once per day.
      </div>

      {REPORTS.map((r) => (
        <UploadCard key={r.type} yearMonth={yearMonth} report={r} last={lastByType.get(r.type) ?? null} />
      ))}
    </div>
  );
}

function ReprocessButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        onClick={() => start(async () => {
          setMsg(null);
          const res = await reattributeAction();
          if (res.ok) {
            setMsg(`Re-processed ${res.processed} upload${res.processed === 1 ? "" : "s"}.`);
            router.refresh();
          }
        })}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {pending ? "Re-processing…" : "Re-process all uploads"}
      </button>
    </div>
  );
}

function UploadCard({
  yearMonth,
  report,
  last,
}: {
  yearMonth: string;
  report: { type: "orders" | "delivered" | "enquiry"; label: string; note: string };
  last: AdminLastUpload | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadDetail() {
    setDetailErr(null);
    setDetailLoading(true);
    const res = await loadUploadDetailAction({ yearMonth, reportType: report.type });
    setDetailLoading(false);
    if (!res.ok) { setDetailErr(res.error); return; }
    setDetail(res.detail);
    setDetailOpen(true);
  }

  function submit() {
    if (!file) { setError("Pick a file first"); return; }
    setError(null);
    setResult(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("yearMonth", yearMonth);
      fd.set("reportType", report.type);
      const res = await uploadReportAction(fd);
      if (!res.ok) setError(res.error ?? "Upload failed");
      else {
        setResult(res);
        setFile(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{report.label}</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">{report.note}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {last ? (
            <>
              Last upload:&nbsp;
              <span className="font-medium text-slate-700">{new Date(last.uploadedAt).toLocaleString("en-GB")}</span>
              <div>{last.rowCount} rows</div>
              {!last.hasParsedData && (
                <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Re-upload once to enable self-healing
                </div>
              )}
            </>
          ) : (
            <span>No upload yet for this month</span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <button
          onClick={submit}
          disabled={pending || !file}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {result?.ok && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Parsed <strong>{result.parsed?.rowsTotal}</strong> rows; attributed <strong>{result.parsed?.rowsAttributed}</strong>; matched to <strong>{result.matched}</strong> participants.
          {result.unmapped && result.unmapped.length > 0 && (
            <div className="mt-1">
              Unmapped codes:&nbsp;
              {result.unmapped.map((u) => (
                <span key={u.reportCode} className="mr-2 inline-block rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px]">
                  {u.reportCode} ×{u.count}
                </span>
              ))}
              <div className="mt-1 text-emerald-700">Add these on the Name map tab to include them next time.</div>
            </div>
          )}
        </div>
      )}

      {/* Diagnostic — explicit list of how each report code attributes */}
      {last && last.hasParsedData && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {!detailOpen ? (
            <button
              onClick={loadDetail}
              disabled={detailLoading}
              className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
            >
              {detailLoading ? "Loading…" : "Show what each row attributed to"}
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attribution from the latest upload</h4>
                <button onClick={() => setDetailOpen(false)} className="text-xs text-slate-500 hover:text-slate-800">Hide</button>
              </div>
              {detail && <UploadDetailTable detail={detail} />}
            </div>
          )}
          {detailErr && <p className="mt-1 text-xs text-red-600">{detailErr}</p>}
        </div>
      )}
    </div>
  );
}

function UploadDetailTable({ detail }: { detail: UploadDetail }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Report code</th>
            <th className="px-3 py-2">Attributed to</th>
            <th className="px-3 py-2 text-right">{detail.primaryLabel}</th>
            {detail.secondaryLabel && <th className="px-3 py-2 text-right">{detail.secondaryLabel}</th>}
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {detail.rows.map((r) => (
            <tr key={r.reportCode}>
              <td className="px-3 py-2 font-mono text-[11px]">{r.reportCode}</td>
              <td className="px-3 py-2">{r.attributedExecName ?? <span className="text-slate-400">—</span>}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.primary}</td>
              {detail.secondaryLabel && <td className="px-3 py-2 text-right tabular-nums">{r.secondary ?? 0}</td>}
              <td className="px-3 py-2">
                {r.status === "attributed" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Attributed</span>}
                {r.status === "unmapped" && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">No mapping</span>}
                {r.status === "not_participant" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Not participating</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
