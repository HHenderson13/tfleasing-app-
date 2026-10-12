"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTenAtTenAction } from "../actions";

interface Totals { files: number; rowsInFile: number; inserted: number; updated: number; unchanged: number; excluded: number; removed: number; duplicatesCollapsed: number; unreadable: number }
const blank = (): Totals => ({ files: 0, rowsInFile: 0, inserted: 0, updated: 0, unchanged: 0, excluded: 0, removed: 0, duplicatesCollapsed: 0, unreadable: 0 });
const KIND_LABEL = { enquiries: "Enquiry log", orders: "Order list", response: "MotorComplete export (Response times)" } as const;
type Kind = keyof typeof KIND_LABEL;
const KINDS = Object.keys(KIND_LABEL) as Kind[];

export function UploadClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [totals, setTotals] = useState<Record<Kind, Totals> | null>(null);
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
      const t: Record<Kind, Totals> = { enquiries: blank(), orders: blank(), response: blank() };
      const failed: { name: string; error: string }[] = [];
      for (const [i, file] of queued.entries()) {
        setProgress(`Uploading ${i + 1} of ${queued.length}: ${file.name}`);
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadTenAtTenAction(fd);
        if (!res.ok || !res.result || !res.kind) { failed.push({ name: file.name, error: res.error ?? "Upload failed." }); continue; }
        const k = t[res.kind];
        k.files++;
        for (const f of ["rowsInFile", "inserted", "updated", "unchanged", "excluded", "removed", "duplicatesCollapsed", "unreadable"] as const) k[f] += res.result[f];
      }
      setProgress(null);
      setFailures(failed);
      if (KINDS.some((k) => t[k].files > 0)) {
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
          {queued.length > 0 ? `${queued.length} file${queued.length === 1 ? "" : "s"} ready: ${queued.map((f) => f.name).join(", ")}` : "Drop enquiry logs, order lists or MotorComplete exports here, or click to choose"}
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

      {totals && KINDS.filter((k) => totals[k].files > 0).map((k) => {
        const x = totals[k];
        return (
          <div key={k} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="font-semibold">
              {KIND_LABEL[k]}: {x.files} file{x.files === 1 ? "" : "s"} merged · {x.rowsInFile.toLocaleString("en-GB")} lines read
            </div>
            <div className="mt-1 text-xs">
              <b>{x.inserted}</b> new · <b>{x.updated}</b> overwritten with newer values · {x.unchanged} already up to date
              {x.excluded > 0 && <> · {x.excluded} lines left out ({k === "response" ? "excluded names, Prospect Call / Showroom, merged leads" : "HaHe / JoRu"})</>}
              {x.removed > 0 && <> · {x.removed} stored lines removed (moved to HaHe / JoRu)</>}
              {x.duplicatesCollapsed > 0 && <> · {x.duplicatesCollapsed} repeated lines collapsed</>}
              {x.unreadable > 0 && <> · {x.unreadable} unreadable lines skipped</>}
            </div>
          </div>
        );
      })}
      {failures.length > 0 && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {failures.map((f) => <div key={f.name}>{f.error}</div>)}
        </div>
      )}
    </div>
  );
}
