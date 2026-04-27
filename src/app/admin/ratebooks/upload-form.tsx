"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { importRatebookFromRemoteAction, processRatebookBlobAction, saveRatebookRemoteSettingsAction, testRatebookRemoteConnectionAction } from "./actions";
import type { ColumnDiagnostics } from "@/lib/ratebook-parse";
import type { RatebookRemoteProtocol } from "@/lib/ratebook-remote";

type Status = { ok: boolean; msg: string };

type RemoteFormState = {
  protocol: RatebookRemoteProtocol;
  host: string;
  port: string;
  username: string;
  password: string;
  remotePath: string;
  updatedAt: string | null;
};

const PROTOCOL_OPTIONS: { value: RatebookRemoteProtocol; label: string }[] = [
  { value: "ftp", label: "FTP" },
  { value: "ftps", label: "FTPS" },
  { value: "sftp", label: "SFTP" },
];

export function UploadForm({
  funders,
  initialRemoteSettings,
}: {
  funders: { id: string; name: string }[];
  initialRemoteSettings: RemoteFormState;
}) {
  const router = useRouter();
  const [pendingManual, startManual] = useTransition();
  const [pendingRemote, startRemote] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [manualFunderId, setManualFunderId] = useState(funders[0]?.id ?? "");
  const [manualMaintained, setManualMaintained] = useState(false);
  const [remoteFunderId, setRemoteFunderId] = useState(funders[0]?.id ?? "");
  const [remoteMaintained, setRemoteMaintained] = useState(false);
  const [remote, setRemote] = useState<RemoteFormState>(initialRemoteSettings);
  const [manualStatus, setManualStatus] = useState<Status | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<Status | null>(null);
  const [diag, setDiag] = useState<ColumnDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [remoteAction, setRemoteAction] = useState<"save" | "test" | "import" | null>(null);

  function setRemoteField<K extends keyof RemoteFormState>(key: K, value: RemoteFormState[K]) {
    setRemote((current) => ({ ...current, [key]: value }));
  }

  function clearDiagnostics() {
    setDiag(null);
    setShowDiag(false);
  }

  function applyDiagnostics(next: ColumnDiagnostics | null | undefined) {
    if (next) {
      setDiag(next);
    } else {
      clearDiagnostics();
    }
  }

  function buildSuccessMessage(inserted: number, removed: number, warnings?: string[]) {
    const parts = [`Imported ${inserted.toLocaleString()} rows.`];
    if (removed) {
      parts.push(`${removed.toLocaleString()} stale vehicle${removed === 1 ? "" : "s"} removed.`);
    }
    if (warnings?.length) {
      parts.push(warnings[0]);
    }
    return parts.join(" ");
  }

  function submitManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setManualStatus(null);
    clearDiagnostics();
    if (!file) {
      setManualStatus({ ok: false, msg: "Pick a file first." });
      return;
    }

    startManual(async () => {
      try {
        const blob = await upload(`ratebooks/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        const res = await processRatebookBlobAction({
          blobUrl: blob.url,
          filename: file.name,
          funderId: manualFunderId,
          isMaintained: manualMaintained,
        });
        if ("diagnostics" in res) applyDiagnostics(res.diagnostics ?? null);
        if (!res.ok) {
          setManualStatus({ ok: false, msg: res.error });
          return;
        }
        setManualStatus({
          ok: true,
          msg: buildSuccessMessage(res.inserted, res.removed, res.warnings),
        });
        setFile(null);
        setFileInputKey((key) => key + 1);
        router.refresh();
      } catch (error) {
        setManualStatus({ ok: false, msg: error instanceof Error ? error.message : "Upload failed." });
      }
    });
  }

  function saveRemoteSettings() {
    setRemoteAction("save");
    setRemoteStatus(null);
    startRemote(async () => {
      const res = await saveRatebookRemoteSettingsAction(remote);
      if (!res.ok) {
        setRemoteStatus({ ok: false, msg: res.error });
        return;
      }
      setRemote((current) => ({ ...current, updatedAt: res.updatedAt }));
      setRemoteStatus({ ok: true, msg: "Remote settings saved." });
      router.refresh();
    });
  }

  function testRemoteSettings() {
    setRemoteAction("test");
    setRemoteStatus(null);
    startRemote(async () => {
      const res = await testRatebookRemoteConnectionAction(remote);
      if (!res.ok) {
        setRemoteStatus({ ok: false, msg: res.error });
        return;
      }
      setRemoteStatus({ ok: true, msg: res.message });
    });
  }

  function importFromRemote() {
    setRemoteAction("import");
    setRemoteStatus(null);
    clearDiagnostics();
    startRemote(async () => {
      const res = await importRatebookFromRemoteAction({
        ...remote,
        funderId: remoteFunderId,
        isMaintained: remoteMaintained,
      });
      if ("diagnostics" in res) applyDiagnostics(res.diagnostics ?? null);
      if (!res.ok) {
        setRemoteStatus({ ok: false, msg: res.error });
        return;
      }
      setRemoteStatus({
        ok: true,
        msg: buildSuccessMessage(res.inserted, res.removed, res.warnings),
      });
      router.refresh();
    });
  }

  const remoteBusyLabel =
    remoteAction === "save" ? "Saving..." :
    remoteAction === "test" ? "Testing..." :
    remoteAction === "import" ? "Importing..." :
    null;

  return (
    <div className="space-y-6">
      <form onSubmit={submitManual} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-col text-xs text-slate-500">
            Funder
            <select
              value={manualFunderId}
              onChange={(e) => setManualFunderId(e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {funders.map((funder) => (
                <option key={funder.id} value={funder.id}>{funder.name}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-col text-xs text-slate-500">
            Maintenance
            <select
              value={manualMaintained ? "true" : "false"}
              onChange={(e) => setManualMaintained(e.target.value === "true")}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="false">Customer Maintained</option>
              <option value="true">Maintained</option>
            </select>
          </label>
          <label className="flex min-w-72 flex-1 flex-col text-xs text-slate-500">
            File (.xlsx, .xls or .csv)
            <input
              key={fileInputKey}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            disabled={pendingManual || !file || !manualFunderId}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pendingManual ? "Uploading..." : "Upload via blob"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Large ratebooks are staged in Blob first, then parsed into the database, so the browser post size is no longer the bottleneck.
        </p>
        {manualStatus && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${manualStatus.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
            {manualStatus.msg}
          </div>
        )}
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Remote ratebook source</h3>
            <p className="mt-1 text-xs text-slate-500">Store the connection details once, test them, then pull a ratebook straight from the remote file path.</p>
          </div>
          {remote.updatedAt && (
            <div className="text-right text-xs text-slate-400">
              Saved
              <div className="font-medium text-slate-600">{new Date(remote.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col text-xs text-slate-500">
            Protocol
            <select
              value={remote.protocol}
              onChange={(e) => setRemoteField("protocol", e.target.value as RatebookRemoteProtocol)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {PROTOCOL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Host
            <input
              value={remote.host}
              onChange={(e) => setRemoteField("host", e.target.value)}
              placeholder="ftp.example.com"
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Port
            <input
              value={remote.port}
              onChange={(e) => setRemoteField("port", e.target.value)}
              placeholder={remote.protocol === "sftp" ? "22" : "21"}
              inputMode="numeric"
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Username
            <input
              value={remote.username}
              onChange={(e) => setRemoteField("username", e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Password
            <input
              type="password"
              value={remote.password}
              onChange={(e) => setRemoteField("password", e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500 md:col-span-2 xl:col-span-3">
            Remote path / filename
            <input
              value={remote.remotePath}
              onChange={(e) => setRemoteField("remotePath", e.target.value)}
              placeholder="/incoming/ratebooks/ald-maintained.xlsx"
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex flex-col text-xs text-slate-500">
              Import into funder
              <select
                value={remoteFunderId}
                onChange={(e) => setRemoteFunderId(e.target.value)}
                className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                {funders.map((funder) => (
                  <option key={funder.id} value={funder.id}>{funder.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Maintenance slice
              <select
                value={remoteMaintained ? "true" : "false"}
                onChange={(e) => setRemoteMaintained(e.target.value === "true")}
                className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="false">Customer Maintained</option>
                <option value="true">Maintained</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveRemoteSettings}
              disabled={pendingRemote}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {pendingRemote && remoteAction === "save" ? remoteBusyLabel : "Save settings"}
            </button>
            <button
              type="button"
              onClick={testRemoteSettings}
              disabled={pendingRemote}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {pendingRemote && remoteAction === "test" ? remoteBusyLabel : "Test connection"}
            </button>
            <button
              type="button"
              onClick={importFromRemote}
              disabled={pendingRemote || !remoteFunderId}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pendingRemote && remoteAction === "import" ? remoteBusyLabel : "Pull and import"}
            </button>
          </div>

          {remoteStatus && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${remoteStatus.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
              {remoteStatus.msg}
            </div>
          )}
        </div>

        {diag && (
          <div className="mt-4">
            <button onClick={() => setShowDiag((value) => !value)} className="text-xs text-slate-400 underline hover:text-slate-700">
              {showDiag ? "Hide" : "Show"} column diagnostics
            </button>
            {showDiag && (
              <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-600">
                <div className="font-semibold text-slate-800">Sheet: {diag.sheetName} | {diag.totalRows} data rows</div>
                <div className="pt-1 font-semibold text-slate-700">Headers at expected column letters:</div>
                {Object.entries(diag.headersAtExpectedCols).map(([col, value]) => (
                  <div key={col}><span className="text-slate-500">{col}:</span> {value ?? <span className="text-red-500">EMPTY</span>}</div>
                ))}
                <div className="pt-1 font-semibold text-slate-700">Where header-name search found columns:</div>
                {Object.entries(diag.headerIdxFoundAt).map(([name, index]) => (
                  <div key={name}><span className="text-slate-500">{name}:</span> {index >= 0 ? `col ${index}` : <span className="text-amber-600">not found</span>}</div>
                ))}
                <div className="pt-1 font-semibold text-slate-700">First data row values:</div>
                {Object.entries(diag.firstDataRowSample).map(([col, value]) => (
                  <div key={col}><span className="text-slate-500">{col}:</span> {value ?? <span className="text-red-500">null</span>}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
