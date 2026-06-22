"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForecastPageHeader } from "../page-shell";
import { monthLabel, currentMonth } from "../pickers";
import { DEPARTMENTS, DEPARTMENT_LABELS, DEPARTMENT_DESCRIPTIONS, type Department } from "../sources";
import {
  uploadDealbookAction,
  deleteUploadAction,
  setLineOverrideMonthAction,
} from "../actions";

interface UploadPayload {
  id: string;
  source: string;
  monthYyyymm: string;
  filename: string;
  rowCount: number;
  uploadedAt: string;
}

interface FocusLine {
  id: string;
  customerName: string | null;
  model: string | null;
  regNo: string | null;
  kind: string;                 // "car" | "van" | "unknown"
  vehicleId: string | null;
  defaultMonth: string;
  overrideMonth: string | null;
  effectiveMonth: string;
  regDate: string | null;
}

interface Props {
  uploads: UploadPayload[];
  focusUpload: { id: string; monthYyyymm: string; source: string; filename: string; rowCount: number } | null;
  focusLines: FocusLine[];
}

export function UploadsClient({ uploads, focusUpload, focusLines }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [openUploadFor, setOpenUploadFor] = useState<Department | null>(null);

  function refresh() { router.refresh(); }

  async function onUpload(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await uploadDealbookAction(formData);
      if (!res.ok) { setErr(res.error); return; }
      setOpenUploadFor(null);
      const url = new URL(window.location.href);
      url.searchParams.set("upload", res.uploadId);
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  function closeReview() {
    const url = new URL(window.location.href);
    url.searchParams.delete("upload");
    router.push(url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : ""));
  }

  if (focusUpload) {
    return (
      <>
        <ForecastPageHeader
          title="Allocate units"
          description="Confirm the month for each vehicle and check the Car / Van split. Anything we couldn't recognise is flagged at the top."
        />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <ReviewWindow
            upload={focusUpload}
            lines={focusLines}
            pending={pending}
            err={err}
            onError={setErr}
            onRefresh={refresh}
            onComplete={closeReview}
          />
        </main>
      </>
    );
  }

  // Group uploads per department.
  const grouped = new Map<Department, UploadPayload[]>();
  for (const d of DEPARTMENTS) grouped.set(d, []);
  for (const u of uploads) {
    if (DEPARTMENTS.includes(u.source as Department)) {
      grouped.get(u.source as Department)!.push(u);
    }
  }

  return (
    <>
      <ForecastPageHeader
        title="Uploads"
        description="Two dealbooks: the Lease file (which contains both cars and vans — we split them by model), and the Salary Sacrifice file. Upload one per month, then review the allocation."
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        {err && !openUploadFor && (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {DEPARTMENTS.map((d) => (
            <DepartmentCard
              key={d}
              department={d}
              uploads={grouped.get(d) ?? []}
              isOpen={openUploadFor === d}
              pending={pending}
              onOpen={() => setOpenUploadFor(d)}
              onClose={() => setOpenUploadFor(null)}
              onSubmit={onUpload}
              onDelete={(id, filename, rowCount) => {
                if (!confirm(`Delete "${filename}" and all ${rowCount} lines?`)) return;
                start(async () => {
                  const res = await deleteUploadAction(id);
                  if (!res.ok) setErr(res.error); else refresh();
                });
              }}
              onReview={(id) => {
                const url = new URL(window.location.href);
                url.searchParams.set("upload", id);
                router.push(url.pathname + "?" + url.searchParams.toString());
              }}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function DepartmentCard({
  department, uploads, isOpen, pending, onOpen, onClose, onSubmit, onDelete, onReview,
}: {
  department: Department;
  uploads: UploadPayload[];
  isOpen: boolean;
  pending: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  onDelete: (id: string, filename: string, rowCount: number) => void;
  onReview: (id: string) => void;
}) {
  const tone = department === "lease" ? "from-sky-500 to-blue-700" : "from-violet-500 to-indigo-700";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone}`} />
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{DEPARTMENT_LABELS[department]}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{DEPARTMENT_DESCRIPTIONS[department]}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {uploads.length === 0
                ? "No uploads yet"
                : `${uploads.length} upload${uploads.length === 1 ? "" : "s"} on file`}
            </p>
          </div>
          {!isOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              + Upload
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <UploadForm
          department={department}
          pending={pending}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}

      {uploads.length === 0 ? (
        <div className="px-5 pb-5 text-xs text-slate-400">Click + Upload to add a dealbook CSV.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {uploads.slice(0, 30).map((u) => (
            <li key={u.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{monthLabel(u.monthYyyymm)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {u.rowCount} line{u.rowCount === 1 ? "" : "s"}
                    {" · "}{new Date(u.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}<span className="text-slate-400">{u.filename}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onReview(u.id)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(u.id, u.filename, u.rowCount)}
                    className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadForm({
  department, pending, onClose, onSubmit,
}: {
  department: Department;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const today = new Date();
  const [monthIdx, setMonthIdx] = useState(today.getMonth() + 1);   // 1-12
  const [year, setYear] = useState(today.getFullYear());

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Year picker spans last 2 → next 3 — covers historical clean-ups
  // and forward planning without flooding the dropdown.
  const years = useMemo(() => {
    const out: number[] = [];
    for (let offset = -2; offset <= 3; offset++) out.push(today.getFullYear() + offset);
    return out;
  }, [today]);

  return (
    <form
      action={(fd) => {
        fd.set("source", department);
        fd.set("month", `${year}-${String(monthIdx).padStart(2, "0")}`);
        onSubmit(fd);
      }}
      className="border-y border-slate-200 bg-slate-50 px-5 py-4 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_2fr]">
        <label className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Month</span>
          <select
            value={monthIdx}
            onChange={(e) => setMonthIdx(parseInt(e.target.value, 10))}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:border-slate-500 focus:outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Year</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold tabular-nums focus:border-slate-500 focus:outline-none"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">CSV file</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="mt-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

function ReviewWindow({
  upload, lines, pending, err, onError, onRefresh, onComplete,
}: {
  upload: { id: string; monthYyyymm: string; source: string; filename: string; rowCount: number };
  lines: FocusLine[];
  pending: boolean;
  err: string | null;
  onError: (e: string | null) => void;
  onRefresh: () => void;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [, startSave] = useTransition();
  const [filter, setFilter] = useState<"all" | "changed" | "unmatched">("all");

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const [y, m] = upload.monthYyyymm.split("-").map((s) => parseInt(s, 10));
    for (let offset = -12; offset <= 18; offset++) {
      const d = new Date(y, m - 1 + offset, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(new Set(out)).sort();
  }, [upload.monthYyyymm]);

  const unmatched = useMemo(() => lines.filter((l) => l.kind !== "car" && l.kind !== "van"), [lines]);
  // "Changed" = admin moved this line's reg-month away from its natural
  // dealbook reg-date. Volume always stays in the upload month; this
  // only steers DPA bucket assignment.
  const naturalRegMonth = (l: FocusLine) => l.regDate ? l.regDate.slice(0, 7) : null;
  const effectiveRegMonth = (l: FocusLine) => l.overrideMonth ?? naturalRegMonth(l);
  const changed = useMemo(
    () => lines.filter((l) => l.overrideMonth !== null && l.overrideMonth !== naturalRegMonth(l)),
    [lines],
  );
  const filtered = useMemo(() => {
    if (filter === "changed") return changed;
    if (filter === "unmatched") return unmatched;
    return lines;
  }, [lines, filter, changed, unmatched]);

  // Group unmatched by their raw model text — that's what the admin needs
  // to copy into a vehicle keyword.
  const unmatchedModels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of unmatched) {
      const k = l.model ?? "(no model)";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [unmatched]);

  function setMonth(lineId: string, month: string, naturalMonth: string | null) {
    onError(null);
    // null = use the natural reg-date month (clears the override).
    const override = month === naturalMonth ? null : month;
    startSave(async () => {
      const res = await setLineOverrideMonthAction(lineId, override);
      if (!res.ok) onError(res.error);
      else onRefresh();
    });
  }

  const carCount = lines.filter((l) => l.kind === "car").length;
  const vanCount = lines.filter((l) => l.kind === "van").length;
  const departmentLabel = DEPARTMENT_LABELS[upload.source as Department] ?? upload.source;

  return (
    <div className="space-y-5">
      {unmatched.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-900">
                {unmatched.length} unit{unmatched.length === 1 ? "" : "s"} couldn't be matched to a vehicle
              </div>
              <p className="mt-1 text-xs text-amber-800">
                The model text below didn't match any keyword in your vehicle catalogue. Until you
                add a match, these units will be left out of the Car and CV rollups.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {unmatchedModels.slice(0, 8).map(([model, count]) => (
                  <li
                    key={model}
                    className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-900"
                  >
                    {model} <span className="text-amber-500">×{count}</span>
                  </li>
                ))}
                {unmatchedModels.length > 8 && (
                  <li className="rounded-md border border-dashed border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">
                    + {unmatchedModels.length - 8} more
                  </li>
                )}
              </ul>
            </div>
            <Link
              href="/forecast/admin?tab=vehicles"
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-800"
            >
              Open vehicles admin →
            </Link>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {departmentLabel} · {upload.filename}
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">
              {upload.rowCount} unit{upload.rowCount === 1 ? "" : "s"} for {monthLabel(upload.monthYyyymm)}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{carCount}</span> car{carCount === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-slate-700">{vanCount}</span> van{vanCount === 1 ? "" : "s"}
              {unmatched.length > 0 && (
                <> · <span className="font-medium text-amber-700">{unmatched.length} unmatched</span></>
              )}
              {changed.length > 0 && (
                <> · <span className="font-medium text-amber-700">{changed.length} reg-month override</span></>
              )}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Volume always counts for <strong>{monthLabel(upload.monthYyyymm)}</strong> — the
              dropdown below only changes which quarter / half-year a unit's DPA falls into.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs">
              <button type="button" onClick={() => setFilter("all")}
                className={`px-2.5 py-1 ${filter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                All ({lines.length})
              </button>
              <button type="button" onClick={() => setFilter("changed")}
                className={`px-2.5 py-1 ${filter === "changed" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                Reg-month override ({changed.length})
              </button>
              <button type="button" onClick={() => setFilter("unmatched")}
                className={`px-2.5 py-1 ${filter === "unmatched" ? "bg-amber-900 text-white" : "bg-white text-amber-700 hover:bg-amber-50"}`}>
                Unmatched ({unmatched.length})
              </button>
            </div>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Complete
            </button>
          </div>
        </div>

        {err && (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{err}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Reg No</th>
                <th className="px-3 py-3 text-left font-medium">Customer</th>
                <th className="px-3 py-3 text-left font-medium">Vehicle</th>
                <th className="px-3 py-3 text-left font-medium">Kind</th>
                <th className="px-3 py-3 text-left font-medium">Reg date</th>
                <th className="px-5 py-3 text-left font-medium">Reg month (for DPA)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No rows.</td></tr>
              ) : (
                filtered.map((l, idx) => {
                  const natural = naturalRegMonth(l);
                  const eff = effectiveRegMonth(l) ?? upload.monthYyyymm;
                  const moved = l.overrideMonth !== null && l.overrideMonth !== natural;
                  const isUnmatched = l.kind !== "car" && l.kind !== "van";
                  const rowClass = isUnmatched
                    ? "bg-amber-50/60"
                    : moved
                    ? "bg-amber-50/40"
                    : idx % 2 === 0 ? "" : "bg-slate-50/40";
                  return (
                    <tr key={l.id} className={`border-t border-slate-100 ${rowClass}`}>
                      <td className="px-5 py-2 font-mono text-xs text-slate-700">{l.regNo ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-800">{l.customerName ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{l.model ?? "—"}</td>
                      <td className="px-3 py-2">
                        {l.kind === "car" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">Car</span>}
                        {l.kind === "van" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Van</span>}
                        {isUnmatched && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Unmatched</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{l.regDate ?? "—"}</td>
                      <td className="px-5 py-2">
                        <select
                          value={eff}
                          disabled={pending}
                          onChange={(e) => setMonth(l.id, e.target.value, natural)}
                          className={`rounded-lg border bg-white px-2 py-1 text-xs font-medium ${
                            moved ? "border-amber-300 text-amber-900" : "border-slate-200 text-slate-700"
                          }`}
                        >
                          {monthOptions.map((m) => (
                            <option key={m} value={m}>
                              {monthLabel(m)}{m === natural ? " (from reg date)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/forecast/uploads")}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ← Back to uploads
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Complete &amp; return
        </button>
      </div>
    </div>
  );
}
