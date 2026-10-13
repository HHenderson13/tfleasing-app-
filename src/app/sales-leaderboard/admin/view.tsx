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
  type UploadDetail,
} from "./actions";
import { FEED_FROM_MONTH, isFedMonth } from "@/lib/pole-position-feed";
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
  // Enquiry logs only: false when the upload was parsed before column E
  // (source) was read, so the month has no Inbound Conversion figure.
  hasSourceData: boolean;
  // Where the month's figures came from: 10 at 10, or an upload made here
  // before 10 at 10 fed the board (history).
  source: "ten-at-ten" | "upload";
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
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                <th className="px-2 py-3 text-right">Inbound enq.</th>
                <th className="px-2 py-3 text-right">Inbound sales</th>
                <th className="px-2 py-3 text-right">Inbound conv %</th>
                <th className="px-4 py-3 text-right">Avg response</th>
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
                    <td className="px-2 py-2 text-right tabular-nums">{t.enquiryCount > 0 ? `${conv.toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.responseCount > 0 ? `${Math.round(t.responseMinutes / t.responseCount)}m` : "—"}</td>
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
  const fmt = (n: number) => kpi.empty ? "—" : kpi.format === "pct" ? `${n.toFixed(1)}%` : kpi.format === "mins" ? `${Math.round(n)}m` : String(Math.round(n));
  const delta = kpi.current - kpi.previous;
  const deltaText = kpi.format === "pct" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`
    : kpi.format === "mins" ? `${delta >= 0 ? "+" : ""}${Math.round(delta)}m`
    : `${delta >= 0 ? "+" : ""}${Math.round(delta)}`;
  // Response Time improves as it falls.
  const better = kpi.lowerIsBetter ? delta < 0 : delta > 0;
  const worse = kpi.lowerIsBetter ? delta > 0 : delta < 0;
  const tone = better ? "text-emerald-600" : worse ? "text-red-600" : "text-slate-400";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(kpi.current)}</div>
      <div className={`mt-1 text-xs font-medium ${tone}`}>
        {kpi.empty || (kpi.previous === 0 && kpi.current === 0) ? "—" : kpi.previous === 0 && kpi.format === "mins" ? "first month measured" : `${deltaText} vs last month`}
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
//
// Nothing is uploaded here any more. The Dealerweb files go to 10 at 10
// once, and it feeds the board (lib/sales-leaderboard-store.ts). Months
// before FEED_FROM_MONTH keep the figures their own uploads gave them.

const REPORTS: { type: "orders" | "delivered" | "enquiry" | "response"; label: string; file: string; note: string }[] = [
  { type: "orders",    label: "Order Take",            file: "Dealbook – Orders",     note: "Orders per exec by order date. An order later cancelled is left out, as Dealerweb's own order list does. The vehicle on their latest order is the scorecard's fun fact." },
  { type: "delivered", label: "Deliveries & Insurance", file: "Dealbook – Deliveries", note: "Every line in the month by delivery date, and insurance products — non-zero values in cols W:AC. A month waits until its Deliveries file has been uploaded to 10 at 10 since insurance was read there." },
  { type: "enquiry",   label: "Inbound Conversion",    file: "Enquiry Log",           note: "Enquiries by enquiry date. Only MotorComplete sources (col E) count; of those, Ordered, Handover Arranged and Delivered (col Q) are sales." },
  { type: "response",  label: "Response Time",         file: "Enquiry Tracker",       note: "Average working minutes from a MotorComplete lead reaching the exec to their first contact, over the leads 10 at 10 has judged (a full working day gone). Fastest wins. Execs are matched through the name map by their Dealerweb code (Helen Mort → HeMo)." },
];

function UploadsTab({ initialYearMonth, lastUploads }: { initialYearMonth: string; lastUploads: AdminLastUpload[] }) {
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const months = useMemo(() => {
    // The last 18 months, newest first.
    const [yStr, mStr] = initialYearMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i <= 17; i++) {
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
  const fed = isFedMonth(yearMonth);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
        <div className="font-semibold">Pole Position is fed from 10 at 10.</div>
        <p className="mt-0.5 text-xs text-indigo-900">
          Upload the Enquiry Log, Enquiry Tracker, Dealbook – Orders and Dealbook – Deliveries once, on{" "}
          <a href="/ten-at-ten/admin" className="font-semibold underline underline-offset-2">10 at 10 → Upload data</a>, and the board updates
          from them. From {formatMonthLabel(FEED_FROM_MONTH)} every month is built from 10 at 10; earlier months keep the figures their
          own uploads here gave them.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">Month:</span>
          <select value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {months.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <span className="text-xs text-slate-500">{fed ? "Built from 10 at 10." : "History — from uploads made here before 10 at 10."}</span>
        </label>
        <ReprocessButton />
      </div>

      {REPORTS.map((r) => (
        <SourceCard key={r.type} yearMonth={yearMonth} report={r} last={lastByType.get(r.type) ?? null} fed={fed} />
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
            setMsg(`${res.fed ? `${res.fed} month report${res.fed === 1 ? "" : "s"} updated from 10 at 10 · ` : ""}re-processed ${res.processed} month report${res.processed === 1 ? "" : "s"}.`);
            router.refresh();
          }
        })}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        title="Pull the latest from 10 at 10, then re-apply every month through the current name map and participants"
      >
        {pending ? "Re-processing…" : "Re-process"}
      </button>
    </div>
  );
}

function SourceCard({
  yearMonth,
  report,
  last,
  fed,
}: {
  yearMonth: string;
  report: (typeof REPORTS)[number];
  last: AdminLastUpload | null;
  fed: boolean;
}) {
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

  const when = last ? new Date(last.uploadedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{report.label} <span className="font-normal text-slate-500">· from {report.file}</span></h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">{report.note}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {last ? (
            <>
              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${last.source === "ten-at-ten" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700"}`}>
                {last.source === "ten-at-ten" ? "From 10 at 10" : "Uploaded here (history)"}
              </span>
              <div className="mt-1">Updated <span className="font-medium text-slate-700">{when}</span></div>
              <div>{last.rowCount} lines</div>
              {report.type === "enquiry" && last.hasParsedData && !last.hasSourceData && (
                <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">No Inbound Conversion for this month</div>
              )}
            </>
          ) : (
            <span>{fed ? `Waiting for ${report.file} on 10 at 10` : "No figures for this month"}</span>
          )}
        </div>
      </div>
      {fed && last?.source === "upload" && (
        <p className="mt-2 text-xs text-amber-700">
          Still showing the upload made here — it switches to 10 at 10 once {report.file} for {formatMonthLabel(yearMonth)} is on 10 at 10
          {report.type === "delivered" ? " (uploaded since insurance was read there)" : ""}.
        </p>
      )}

      {/* Diagnostic — how each report code attributes */}
      {last && last.hasParsedData && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {!detailOpen ? (
            <button onClick={loadDetail} disabled={detailLoading}
              className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50">
              {detailLoading ? "Loading…" : "Show what each code attributed to"}
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attribution for this month</h4>
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
