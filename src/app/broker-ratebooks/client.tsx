"use client";
import { useState } from "react";

type Status = "idle" | "loading" | "error";

export function BrokerRatebooksClient({ commissionTiers }: { commissionTiers: number[] }) {
  const [mcStatus, setMcStatus] = useState<Status>("idle");
  const [llStatus, setLlStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function download(url: string, setStatus: (s: Status) => void) {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback = url.endsWith("leaseloco")
        ? "TrustFord Broker Ratebooks - LeaseLoco.xlsx"
        : "TrustFord Broker Ratebooks - MotorComplete.zip";
      const filename = m ? m[1] : fallback;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  const tiers = commissionTiers.map((c) => `£${c}`).join(" · ");

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Card
        title="MotorComplete"
        format="CSV × 4 (zipped)"
        desc="Standard MotorComplete broker-cv layout. One CSV per commission tier, bundled as a single ZIP."
        tierLine={tiers}
        button="Download ZIP"
        status={mcStatus}
        onClick={() => download("/api/broker-ratebooks/motorcomplete", setMcStatus)}
      />
      <Card
        title="LeaseLoco"
        format="Excel workbook"
        desc="One .xlsx with a separate sheet per commission tier. Trimmed to the LeaseLoco column set."
        tierLine={tiers}
        button="Download XLSX"
        status={llStatus}
        onClick={() => download("/api/broker-ratebooks/leaseloco", setLlStatus)}
      />
      {error && (
        <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  format,
  desc,
  tierLine,
  button,
  status,
  onClick,
}: {
  title: string;
  format: string;
  desc: string;
  tierLine: string;
  button: string;
  status: Status;
  onClick: () => void;
}) {
  const loading = status === "loading";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-700" />
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{format}</span>
        </div>
        <p className="mt-1.5 text-sm text-slate-600">{desc}</p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-100">
          <span className="font-semibold">Tiers</span>
          <span className="text-amber-700">{tierLine}</span>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : (
            <>
              <DownloadIcon />
              {button}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
