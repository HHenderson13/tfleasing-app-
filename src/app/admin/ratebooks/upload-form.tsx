"use client";
import { useState, useTransition } from "react";
import { uploadRatebook } from "./actions";
import type { ColumnDiagnostics } from "@/lib/ratebook-parse";

export function UploadForm({ funders }: { funders: { id: string; name: string }[] }) {
  const [status, setStatus] = useState<{ ok?: boolean; msg: string } | null>(null);
  const [diag, setDiag] = useState<ColumnDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [pending, start] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus(null);
    setDiag(null);
    start(async () => {
      const res = await uploadRatebook(fd);
      if ("diagnostics" in res && res.diagnostics) setDiag(res.diagnostics);
      if (res.ok) {
        const removed = "removed" in res && res.removed ? ` ${res.removed} stale vehicle${res.removed === 1 ? "" : "s"} removed.` : "";
        setStatus({ ok: true, msg: `Imported ${res.inserted} rows.${removed}` });
      } else setStatus({ ok: false, msg: res.error });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="flex flex-col text-xs text-slate-500">
        Funder
        <select name="funderId" className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900">
          {funders.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Maintenance
        <select name="isMaintained" className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900">
          <option value="false">Customer Maintained</option>
          <option value="true">Maintained</option>
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        File (.xlsx or .csv)
        <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="mt-1 text-sm" />
      </label>
      <button type="submit" disabled={pending} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Uploading…" : "Upload"}
      </button>
      {status && (
        <div className={`w-full text-xs ${status.ok ? "text-emerald-700" : "text-red-600"}`}>{status.msg}</div>
      )}
      {diag && (
        <div className="w-full">
          <button onClick={() => setShowDiag((v) => !v)} className="text-xs text-slate-400 hover:text-slate-700 underline">
            {showDiag ? "Hide" : "Show"} column diagnostics
          </button>
          {showDiag && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Sheet: {diag.sheetName} · {diag.totalRows} data rows</div>
              <div className="font-semibold text-slate-700 pt-1">Headers at expected column letters:</div>
              {Object.entries(diag.headersAtExpectedCols).map(([col, val]) => (
                <div key={col}><span className="text-slate-500">{col}:</span> {val ?? <span className="text-red-500">EMPTY</span>}</div>
              ))}
              <div className="font-semibold text-slate-700 pt-1">Where header-name search found columns:</div>
              {Object.entries(diag.headerIdxFoundAt).map(([name, i]) => (
                <div key={name}><span className="text-slate-500">{name}:</span> {i >= 0 ? `col ${i}` : <span className="text-amber-600">not found</span>}</div>
              ))}
              <div className="font-semibold text-slate-700 pt-1">First data row values:</div>
              {Object.entries(diag.firstDataRowSample).map(([col, val]) => (
                <div key={col}><span className="text-slate-500">{col}:</span> {val ?? <span className="text-red-500">null</span>}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
