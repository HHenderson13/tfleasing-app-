"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ForecastPageHeader, monthLabel } from "../page-shell";
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "../sources";
import {
  uploadDealbookAction,
  deleteUploadAction,
  bulkOverrideMonthAction,
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
  vehicleType: string | null;
  defaultMonth: string;
  overrideMonth: string | null;
  effectiveMonth: string;
  regDate: string | null;
}

interface Props {
  month: string;
  uploads: UploadPayload[];
  focusUpload: { id: string; monthYyyymm: string; source: string; filename: string } | null;
  focusLines: FocusLine[];
}

export function UploadsClient({ month, uploads, focusUpload, focusLines }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function refresh() { router.refresh(); }

  async function onUpload(formData: FormData) {
    setErr(null); setSuccess(null);
    start(async () => {
      const res = await uploadDealbookAction(formData);
      if (!res.ok) { setErr(res.error); return; }
      setSuccess(`Uploaded ${res.rowCount} rows.${res.warnings.length ? " Warnings: " + res.warnings.join("; ") : ""}`);
      // Jump straight into the allocation prompt for this upload.
      const url = new URL(window.location.href);
      url.searchParams.set("upload", res.uploadId);
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  return (
    <>
      <ForecastPageHeader
        title="Uploads"
        description="Drop a dealbook CSV per department per month. We'll spot anything registered in a previous month so you can keep them where they belong."
        month={month}
        showMonthPicker={false}
      />

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <UploadCard
          month={month}
          pending={pending}
          err={err}
          success={success}
          onSubmit={onUpload}
        />

        {focusUpload && focusLines.length > 0 && (
          <AllocatePanel
            upload={focusUpload}
            lines={focusLines}
            pending={pending}
            onDismiss={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("upload");
              router.push(url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : ""));
            }}
            onError={(e) => setErr(e)}
            onRefresh={refresh}
          />
        )}

        <RecentUploads
          uploads={uploads}
          pending={pending}
          onDelete={(id, filename, rowCount) => {
            if (!confirm(`Delete "${filename}" and all ${rowCount} lines?`)) return;
            start(async () => {
              const res = await deleteUploadAction(id);
              if (!res.ok) setErr(res.error); else refresh();
            });
          }}
          onFocus={(id) => {
            const url = new URL(window.location.href);
            url.searchParams.set("upload", id);
            router.push(url.pathname + "?" + url.searchParams.toString());
          }}
        />
      </main>
    </>
  );
}

function UploadCard({
  month, pending, err, success, onSubmit,
}: {
  month: string;
  pending: boolean;
  err: string | null;
  success: string | null;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-transparent px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Upload dealbook CSV</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick the department, target month and CSV. Each line falls into its registered month by
          default — we'll let you reassign anything that landed in the wrong bucket straight after upload.
        </p>
      </div>
      <form action={onSubmit} className="grid gap-5 p-6 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <label className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Department</span>
          <select
            name="source"
            required
            defaultValue=""
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:border-slate-500 focus:outline-none"
          >
            <option value="" disabled>Choose…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Target month</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            required
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium tabular-nums focus:border-slate-500 focus:outline-none"
          />
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
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
      {err && <p className="border-t border-rose-100 bg-rose-50 px-6 py-2.5 text-xs text-rose-700">{err}</p>}
      {success && <p className="border-t border-emerald-100 bg-emerald-50 px-6 py-2.5 text-xs text-emerald-700">{success}</p>}
    </section>
  );
}

function AllocatePanel({
  upload, lines, pending, onDismiss, onError, onRefresh,
}: {
  upload: { id: string; monthYyyymm: string; source: string; filename: string };
  lines: FocusLine[];
  pending: boolean;
  onDismiss: () => void;
  onError: (e: string) => void;
  onRefresh: () => void;
}) {
  const [, start] = useTransition();
  // Mismatched lines = those whose effective month doesn't match the
  // upload's target month. Group them by detected (effective) month so the
  // admin can decide per-bucket.
  const mismatched = useMemo(() => lines.filter((l) => l.effectiveMonth !== upload.monthYyyymm), [lines, upload.monthYyyymm]);
  const groups = useMemo(() => {
    const m = new Map<string, FocusLine[]>();
    for (const l of mismatched) {
      if (!m.has(l.effectiveMonth)) m.set(l.effectiveMonth, []);
      m.get(l.effectiveMonth)!.push(l);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mismatched]);

  // Default: each bucket has an in-line action ("keep in detected month"
  // already happens by default; the admin can choose to bring everything
  // back to the upload month with one click).
  function bulkMove(groupLineIds: string[], targetMonth: string | null) {
    start(async () => {
      const res = await bulkOverrideMonthAction(groupLineIds, targetMonth);
      if (!res.ok) { onError(res.error); return; }
      onRefresh();
    });
  }

  if (mismatched.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
        <div className="flex items-start justify-between px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-emerald-900">Everything lined up.</div>
            <p className="mt-1 text-xs text-emerald-800">
              All {lines.length} line{lines.length === 1 ? "" : "s"} in <strong>{upload.filename}</strong>
              {" "}were registered in {monthLabel(upload.monthYyyymm)} — nothing to allocate.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Allocate previous-month units</h2>
          <p className="mt-1 text-sm text-amber-800">
            {mismatched.length} of {lines.length} line{lines.length === 1 ? "" : "s"} in{" "}
            <strong>{upload.filename}</strong> were registered before {monthLabel(upload.monthYyyymm)}.
            Decide where each group should land — keep them in their registered month, or pull them
            forward into this upload's month.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          I'm done
        </button>
      </div>
      <div className="divide-y divide-amber-100">
        {groups.map(([detectedMonth, groupLines]) => (
          <div key={detectedMonth} className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {groupLines.length} line{groupLines.length === 1 ? "" : "s"} registered in {monthLabel(detectedMonth)}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Default keeps them in {monthLabel(detectedMonth)} — that's typically right.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => bulkMove(groupLines.map((l) => l.id), null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Keep in {monthLabel(detectedMonth)}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => bulkMove(groupLines.map((l) => l.id), upload.monthYyyymm)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Move to {monthLabel(upload.monthYyyymm)}
                </button>
              </div>
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {groupLines.slice(0, 12).map((l) => (
                <li key={l.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
                  <div className="font-medium text-slate-800">{l.customerName ?? "—"}</div>
                  <div className="text-slate-500">{l.model ?? "—"}{l.regDate ? ` · reg ${l.regDate}` : ""}</div>
                </li>
              ))}
              {groupLines.length > 12 && (
                <li className="rounded-lg border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-500">
                  + {groupLines.length - 12} more
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentUploads({
  uploads, pending, onDelete, onFocus,
}: {
  uploads: UploadPayload[];
  pending: boolean;
  onDelete: (id: string, filename: string, rowCount: number) => void;
  onFocus: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Recent uploads</h2>
        <span className="text-[11px] text-slate-500">{uploads.length} total</span>
      </div>
      {uploads.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">
          No uploads yet — drop a CSV above to get started.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {uploads.slice(0, 25).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{u.filename}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {DEPARTMENT_LABELS[u.source as Department] ?? u.source}
                  </span>
                  {" · "}target {monthLabel(u.monthYyyymm)}
                  {" · "}{u.rowCount} line{u.rowCount === 1 ? "" : "s"}
                  {" · "}{new Date(u.uploadedAt).toLocaleString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onFocus(u.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Allocate
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDelete(u.id, u.filename, u.rowCount)}
                  className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
