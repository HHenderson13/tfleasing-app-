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
      // Pull suggested filename from Content-Disposition if present.
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

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2">
      <Card
        title="MotorComplete (CSV × 4)"
        desc={`One CSV per commission tier (${commissionTiers.map((c) => `£${c}`).join(", ")}), bundled as a ZIP. Format matches the MotorComplete broker-cv layout.`}
        button="Download MotorComplete ZIP"
        status={mcStatus}
        onClick={() => download("/api/broker-ratebooks/motorcomplete", setMcStatus)}
      />
      <Card
        title="LeaseLoco (Excel workbook)"
        desc={`One Excel workbook with a sheet per commission tier (${commissionTiers.map((c) => `£${c} Comms`).join(", ")}). Trimmed to the requested LeaseLoco columns.`}
        button="Download LeaseLoco XLSX"
        status={llStatus}
        onClick={() => download("/api/broker-ratebooks/leaseloco", setLlStatus)}
      />
      {error && (
        <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </section>
  );
}

function Card({
  title,
  desc,
  button,
  status,
  onClick,
}: {
  title: string;
  desc: string;
  button: string;
  status: Status;
  onClick: () => void;
}) {
  const loading = status === "loading";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "Generating…" : button}
      </button>
    </div>
  );
}
