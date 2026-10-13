"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTenAtTenAction, type TenAtTenUploadOutcome } from "../actions";

// Pole Position's metric names, kept here so this client doesn't pull the
// spreadsheet parser into the browser. Keep in step with FEED_REPORT_LABEL.
type Fed = { yearMonth: string; reportType: "orders" | "delivered" | "enquiry" | "response" };
const FED_LABEL: Record<Fed["reportType"], string> = { orders: "Order Take", delivered: "Deliveries & Insurance", enquiry: "Inbound Conversion", response: "Response Time" };
const formatMonthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const fedKey = (f: Fed) => `${f.yearMonth}|${f.reportType}`;

interface Totals { files: number; rowsInFile: number; inserted: number; updated: number; unchanged: number; excluded: number; removed: number; duplicatesCollapsed: number; unreadable: number }
const blank = (): Totals => ({ files: 0, rowsInFile: 0, inserted: 0, updated: 0, unchanged: 0, excluded: 0, removed: 0, duplicatesCollapsed: 0, unreadable: 0 });
// The team's names for the files — keep in step with the upload page.
const KIND_LABEL = { response: "Enquiry Tracker", enquiries: "Enquiry Log", orders: "Dealbook – Orders", deliveries: "Dealbook – Deliveries", cancellations: "Cancelled Orders" } as const;
type Kind = keyof typeof KIND_LABEL;
const KINDS = Object.keys(KIND_LABEL) as Kind[];
const emptyTotals = (): Record<Kind, Totals> => ({ response: blank(), enquiries: blank(), orders: blank(), deliveries: blank(), cancellations: blank() });

export function UploadClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [totals, setTotals] = useState<Record<Kind, Totals> | null>(null);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);
  // Dealbook files whose dates fit either report, waiting for a choice.
  const [undecided, setUndecided] = useState<File[]>([]);
  // Pole Position months the uploads moved, and any feed problem.
  const [fed, setFed] = useState<Fed[]>([]);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteFeed = (res: TenAtTenUploadOutcome) => {
    if (res.polePosition?.length) setFed((cur) => { const m = new Map(cur.map((f) => [fedKey(f), f])); for (const f of res.polePosition!) m.set(fedKey(f), f); return [...m.values()]; });
    if (res.polePositionError) setFeedErrors((cur) => (cur.includes(res.polePositionError!) ? cur : [...cur, res.polePositionError!]));
  };

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQueued(Array.from(files));
    setTotals(null);
    setFailures([]);
    setUndecided([]);
    setFed([]);
    setFeedErrors([]);
  }

  function add(t: Record<Kind, Totals>, res: TenAtTenUploadOutcome) {
    if (!res.result || !res.kind) return;
    const k = t[res.kind];
    k.files++;
    for (const f of ["rowsInFile", "inserted", "updated", "unchanged", "excluded", "removed", "duplicatesCollapsed", "unreadable"] as const) k[f] += res.result[f];
  }

  function submit() {
    if (queued.length === 0) return;
    start(async () => {
      // One file at a time, so each merge sees the store the previous file
      // left — two overlapping exports in parallel could race on a line.
      // A bad file is reported and skipped rather than sinking the batch.
      const t = emptyTotals();
      const failed: { name: string; error: string }[] = [];
      const ask: File[] = [];
      for (const [i, file] of queued.entries()) {
        setProgress(`Uploading ${i + 1} of ${queued.length}: ${file.name}`);
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadTenAtTenAction(fd);
        if (res.needsChoice) { ask.push(file); continue; }
        if (!res.ok || !res.result || !res.kind) { failed.push({ name: file.name, error: res.error ?? "Upload failed." }); continue; }
        add(t, res);
        noteFeed(res);
      }
      setProgress(null);
      setFailures(failed);
      setUndecided(ask);
      setQueued([]);
      if (inputRef.current) inputRef.current.value = "";
      if (KINDS.some((k) => t[k].files > 0)) {
        setTotals(t);
        router.refresh();
      }
    });
  }

  function decide(file: File, kind: "orders" | "deliveries") {
    start(async () => {
      setProgress(`Uploading ${file.name} as ${KIND_LABEL[kind]}`);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await uploadTenAtTenAction(fd);
      setProgress(null);
      setUndecided((u) => u.filter((f) => f !== file));
      if (!res.ok || !res.result) { setFailures((f) => [...f, { name: file.name, error: res.error ?? "Upload failed." }]); return; }
      setTotals((cur) => { const t = cur ? structuredClone(cur) : emptyTotals(); add(t, res); return t; });
      noteFeed(res);
      router.refresh();
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
          {queued.length > 0 ? `${queued.length} file${queued.length === 1 ? "" : "s"} ready: ${queued.map((f) => f.name).join(", ")}` : "Drop Enquiry Tracker, Enquiry Log, Dealbook or Cancelled Orders files here, or click to choose"}
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

      {undecided.map((file) => (
        <div key={file.name} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><b>{file.name}</b> — is this Dealbook – Orders or Dealbook – Deliveries? Its dates fit either.</span>
          <span className="flex gap-2">
            {(["orders", "deliveries"] as const).map((k) => (
              <button key={k} disabled={pending} onClick={() => decide(file, k)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40">
                {KIND_LABEL[k]}
              </button>
            ))}
          </span>
        </div>
      ))}

      {totals && KINDS.filter((k) => totals[k].files > 0).map((k) => {
        const x = totals[k];
        return (
          <div key={k} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="font-semibold">
              {KIND_LABEL[k]}: {x.files} file{x.files === 1 ? "" : "s"} merged · {x.rowsInFile.toLocaleString("en-GB")} lines read
            </div>
            <div className="mt-1 text-xs">
              <b>{x.inserted}</b> new · <b>{x.updated}</b> overwritten with newer values · {x.unchanged} already up to date
              {x.excluded > 0 && <> · {x.excluded} lines left out ({k === "response" ? "not a MotorComplete lead, Harry Henderson / Joseph Rustigini, or a merged lead" : k === "cancellations" ? "Harry Henderson / Joseph Rustigini" : "HaHe / JoRu"})</>}
              {x.removed > 0 && <> · {x.removed} stored lines removed ({k === "deliveries" ? "no longer in that month's report — slipped or cancelled" : "moved to HaHe / JoRu"})</>}
              {x.duplicatesCollapsed > 0 && <> · {x.duplicatesCollapsed} repeated lines collapsed</>}
              {x.unreadable > 0 && <> · {x.unreadable} unreadable lines skipped</>}
            </div>
          </div>
        );
      })}
      {fed.length > 0 && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-900">
          <span className="font-semibold">Pole Position updated</span> —{" "}
          {[...new Set(fed.map((f) => f.yearMonth))].sort().map((m, i) => (
            <span key={m}>{i > 0 && "; "}{formatMonthLabel(m)}: {fed.filter((f) => f.yearMonth === m).map((f) => FED_LABEL[f.reportType]).join(", ")}</span>
          ))}.
        </div>
      )}
      {feedErrors.map((e) => <div key={e} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{e}</div>)}
      {failures.length > 0 && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {failures.map((f) => <div key={f.name}>{f.error}</div>)}
        </div>
      )}
    </div>
  );
}
