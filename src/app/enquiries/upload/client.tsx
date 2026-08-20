"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadEnquiriesAction, type UploadOutcome } from "../actions";

export function UploadClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const [queued, setQueued] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQueued(Array.from(files));
    setOutcome(null);
  }

  function submit() {
    if (queued.length === 0) return;
    start(async () => {
      // Upload sequentially so the merge sees a consistent store between
      // files — two exports of the same day processed in parallel could
      // both read "not present" and race on the same enquiry.
      let last: UploadOutcome | null = null;
      const totals = { inserted: 0, updated: 0, unchanged: 0, skippedExcluded: 0, skippedUnparseable: 0, duplicatesCollapsed: 0, skippedLostSaleReason: 0, skippedNotLead: 0, removedRetroactively: 0, rowsInFile: 0 };
      for (const file of queued) {
        const fd = new FormData();
        fd.set("file", file);
        last = await uploadEnquiriesAction(fd);
        if (!last.ok) break;
        if (last.result) {
          totals.inserted += last.result.inserted;
          totals.updated += last.result.updated;
          totals.unchanged += last.result.unchanged;
          totals.skippedExcluded += last.result.skippedExcluded;
          totals.skippedUnparseable += last.result.skippedUnparseable;
          totals.duplicatesCollapsed += last.result.duplicatesCollapsed;
          totals.skippedLostSaleReason += last.result.skippedLostSaleReason;
          totals.skippedNotLead += last.result.skippedNotLead;
          totals.removedRetroactively += last.result.removedRetroactively;
          totals.rowsInFile += last.result.rowsInFile;
        }
      }
      if (last?.ok) {
        setOutcome({
          ok: true,
          filename: queued.length === 1 ? queued[0].name : `${queued.length} files`,
          result: totals,
        });
        setQueued([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        setOutcome(last);
      }
    });
  }

  return (
    <div className="mt-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls" multiple hidden
          onChange={(e) => pick(e.target.files)}
        />
        <p className="text-sm font-medium text-slate-900">
          Drop the export here, or click to choose
        </p>
        <p className="mt-1 text-xs text-slate-500">
          .xlsx from MotorComplete — you can select more than one day at a time
        </p>
      </div>

      {queued.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ready to upload
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-800">
            {queued.map((f) => (
              <li key={f.name} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 font-mono text-xs text-slate-400">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={submit} disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {pending ? "Uploading…" : `Upload ${queued.length} file${queued.length > 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => { setQueued([]); if (inputRef.current) inputRef.current.value = ""; }}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {outcome && !outcome.ok && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {outcome.error}
        </div>
      )}

      {outcome?.ok && outcome.result && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">
            {outcome.filename} ingested
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-emerald-900 sm:grid-cols-3">
            <Stat label="Rows read" value={outcome.result.rowsInFile} />
            <Stat label="New enquiries" value={outcome.result.inserted} />
            <Stat label="Updated" value={outcome.result.updated} />
            <Stat label="Already current" value={outcome.result.unchanged} />
            <Stat label="Excluded (Joseph/Harry)" value={outcome.result.skippedExcluded} />
            <Stat label="Unreadable rows" value={outcome.result.skippedUnparseable} />
            <Stat label="Duplicates in file" value={outcome.result.duplicatesCollapsed} />
            <Stat label="Excluded type (col F)" value={outcome.result.skippedNotLead} />
            <Stat label="Merged into existing" value={outcome.result.skippedLostSaleReason} />
            <Stat label="Removed retroactively" value={outcome.result.removedRetroactively} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-emerald-800/80">{label}</dt>
      <dd className="font-mono font-bold tabular-nums">{value}</dd>
    </div>
  );
}
