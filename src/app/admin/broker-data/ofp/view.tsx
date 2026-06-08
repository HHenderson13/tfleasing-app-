"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadOfpAction, type OfpUploadResult } from "./actions";

interface ClassSummary {
  vehicleClass: "cv" | "pv";
  uploadedAt: string | null;
  filename: string | null;
  rowCount: number;
  totalCells: number;
  pcpRows: number;
  hpBalRows: number;
}

export function OfpUploadView({ cv, pv }: { cv: ClassSummary; pv: ClassSummary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <UploadCard
        title="Commercial Vehicles (CV)"
        description="Q-quarterly Ford CV OFP workbook. Sheet 1 is PCP, sheet 2 is HP-Balloon."
        summary={cv}
      />
      <UploadCard
        title="Passenger Vehicles (PV)"
        description="Q-quarterly Ford passenger OFP workbook. Sheet 1 (TCM) is PCP, sheet 2 (BHP) is HP-Balloon."
        summary={pv}
      />
    </div>
  );
}

function UploadCard({ title, description, summary }: { title: string; description: string; summary: ClassSummary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OfpUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!file) { setError("Pick a file first."); return; }
    setError(null);
    setResult(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("vehicleClass", summary.vehicleClass);
      const res = await uploadOfpAction(fd);
      if (!res.ok) { setError(res.error ?? "Upload failed."); return; }
      setResult(res);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <div className="text-right text-xs text-slate-500 shrink-0">
          {summary.uploadedAt ? (
            <>
              <div>Loaded {new Date(summary.uploadedAt).toLocaleString("en-GB")}</div>
              <div className="font-mono text-[10px] text-slate-400 truncate max-w-[12rem]">{summary.filename}</div>
            </>
          ) : (
            <span>No data yet</span>
          )}
        </div>
      </div>

      {summary.totalCells > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
          <Stat label="Vehicles" value={summary.rowCount.toLocaleString()} />
          <Stat label="PCP cells" value={summary.pcpRows.toLocaleString()} />
          <Stat label="HP+B cells" value={summary.hpBalRows.toLocaleString()} />
        </dl>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          {pending ? "Parsing…" : "Upload"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Re-uploading replaces all current {summary.vehicleClass.toUpperCase()} OFP data.</p>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {result?.ok && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Parsed <strong>{result.rowsParsed?.toLocaleString()}</strong> cells —
          {" "}<strong>{result.pcpCells?.toLocaleString()}</strong> PCP +
          {" "}<strong>{result.hpBalCells?.toLocaleString()}</strong> HP-Balloon.
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-amber-800">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="tabular-nums font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
