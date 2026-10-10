"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTenAtTenAction } from "../actions";

interface Totals { files: number; rowsInFile: number; inserted: number; updated: number; unchanged: number; excluded: number; removed: number; duplicatesCollapsed: number; unreadable: number }

export function UploadClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQueued(Array.from(files));
    setTotals(null);
    setFailures([]);
  }

  function submit() {
    if (queued.length === 0) return;
    start(async () => {
      // One file at a time, so each merge sees the store the previous file
      // left — two overlapping exports in parallel could race on a line.
      // A bad file is reported and skipped rather than sinking the batch.
      const t: Totals = { files: 0, rowsInFile: 0, inserted: 0, updated: 0, unchanged: 0, excluded: 0, removed: 0, duplicatesCollapsed: 0, unreadable: 0 };
      const failed: { name: string; error: string }[] = [];
      for (const [i, file] of queued.entries()) {
        setProgress(`Uploading ${i + 1} of ${queued.length}: ${file.name}`);
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadTenAtTenAction(fd);
        if (!res.ok || !res.result) { failed.push({ name: file.name, error: res.error ?? "Upload failed." }); continue; }
        t.files++;
        for (const k of ["rowsInFile", "inserted", "updated", "unchanged", "excluded", "removed", "duplicatesCollapsed", "unreadable"] as const) t[k] += res.result[k];
      }
      setProgress(null);
      setFailures(failed);
      if (t.files > 0) {
        setTotals(t);
        setQueued([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-6">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white hover:border-slate-400"}`}
      >
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(e) => pick(e.target.files)} />
        <div className="text-sm font-medium text-slate-800">
          {queued.length > 0 ? `${queued.length} file${queued.length === 1 ? "" : "s"} ready: ${queued.map((f) => f.name).join(", ")}` : "Drop enquiry logs here, or click to choose"}
        </div>
        <div className="mt-1 text-xs text-slate-500">.xlsx · several at once is fine — they&apos;re merged in the order chosen</div>
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || queued.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
        {progress && <span className="text-xs text-slate-500">{progress}</span>}
      </div>

      {totals && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">
            {totals.files} file{totals.files === 1 ? "" : "s"} merged · {totals.rowsInFile.toLocaleString("en-GB")} lines read
          </div>
          <div className="mt-1 text-xs">
            <b>{totals.inserted}</b> new · <b>{totals.updated}</b> overwritten with newer values · {totals.unchanged} already up to date
            {totals.excluded > 0 && <> · {totals.excluded} HaHe / JoRu lines stripped</>}
            {totals.removed > 0 && <> · {totals.removed} stored enquiries removed (moved to HaHe / JoRu)</>}
            {totals.duplicatesCollapsed > 0 && <> · {totals.duplicatesCollapsed} repeated lines collapsed</>}
            {totals.unreadable > 0 && <> · {totals.unreadable} unreadable lines skipped</>}
          </div>
        </div>
      )}
      {failures.length > 0 && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {failures.map((f) => <div key={f.name}>{f.error}</div>)}
        </div>
      )}
    </div>
  );
}
