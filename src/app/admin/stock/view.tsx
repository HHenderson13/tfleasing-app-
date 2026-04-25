"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkbookPasswordAction, uploadStockAction } from "./actions";

export function StockUploadView({
  latest,
  currentCount,
  perSheet,
  password,
}: {
  latest: { filename: string; vehicleCount: number; uploadedAt: string } | null;
  currentCount: number;
  perSheet: { sheet: string; count: number }[];
  password: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [pwValue, setPwValue] = useState(password);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  function savePassword() {
    setPwMsg(null);
    setPwSaving(true);
    updateWorkbookPasswordAction(pwValue).then((res) => {
      setPwSaving(false);
      if (!res.ok) setPwMsg(res.error);
      else { setPwMsg("Saved."); router.refresh(); }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!file) { setError("Pick a file first."); return; }
    const form = new FormData();
    form.append("file", file);
    start(async () => {
      const res = await uploadStockAction(form);
      if (!res.ok) { setError(res.error); return; }
      setSuccess(res.count);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Upload stock report</h2>
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsm,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="submit"
            disabled={pending || !file}
            className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {pending ? "Uploading…" : "Replace stock"}
          </button>
        </form>
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        {success !== null && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Loaded {success.toLocaleString()} vehicles.</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Workbook password</h2>
        <p className="mt-1 text-xs text-slate-500">Ford protect the workbook with a password. Default is <span className="font-mono">Ftru</span>. Update here if they change it.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            className="w-48 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-sm focus:border-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={savePassword}
            disabled={pwSaving || pwValue.trim() === password}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {pwSaving ? "Saving…" : "Save password"}
          </button>
          {pwMsg && <span className={`text-xs ${pwMsg === "Saved." ? "text-emerald-600" : "text-red-600"}`}>{pwMsg}</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Current snapshot</h2>
        {latest ? (
          <div className="mt-2 text-sm text-slate-600">
            <div><span className="font-mono text-xs">{latest.filename}</span> · {currentCount.toLocaleString()} vehicles · uploaded {new Date(latest.uploadedAt).toLocaleString()}</div>
            {perSheet.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {perSheet
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((r) => (
                    <span key={r.sheet} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      <span className="font-medium">{r.sheet}</span>
                      <span className="tabular-nums text-slate-500">{r.count.toLocaleString()}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-500">No stock uploaded yet.</div>
        )}
      </section>
    </div>
  );
}
