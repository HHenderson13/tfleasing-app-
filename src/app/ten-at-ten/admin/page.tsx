import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { listTenAtTenUploads, tenAtTenSummary } from "@/lib/ten-at-ten-store";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function TenAtTenAdminPage() {
  await requireAdmin();
  const [uploads, summary] = await Promise.all([listTenAtTenUploads(25), tenAtTenSummary()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/ten-at-ten" className="text-slate-500 hover:text-slate-900">← 10 at 10</Link>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Admin</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Upload data</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Upload the Dealerweb <strong>enquiry log</strong> (the &ldquo;Date Time · SE · … · Status&rdquo; export).
          Files are merged <strong>line by line</strong>: each enquiry is matched on when it was raised, the
          customer and the source, so a line already held is overwritten with the newer file&apos;s values
          (Live becoming Ordered, say) and a new one is added. Nothing else already stored is touched.
          Enquiries under <strong>HaHe</strong> or <strong>JoRu</strong> are duplicates and are stripped out —
          if a file shows an enquiry has been moved to either, it is removed from what&apos;s stored too.
        </p>

        <p className="mt-3 text-xs text-slate-500">
          {summary.rows > 0 ? (
            <>Holding <span className="font-semibold text-slate-800">{summary.rows.toLocaleString("en-GB")}</span> enquiries,{" "}
              {fmtDay(summary.firstDay)} to {fmtDay(summary.lastDay)}.</>
          ) : "Nothing uploaded yet."}
        </p>

        <UploadClient />

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-900">Recent uploads</h2>
          {uploads.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Nothing uploaded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">File</th>
                    <th className="px-3 py-2 text-left font-semibold">Enquiries dated</th>
                    <th className="px-3 py-2 text-right font-semibold">Lines</th>
                    <th className="px-3 py-2 text-right font-semibold">New</th>
                    <th className="px-3 py-2 text-right font-semibold">Overwritten</th>
                    <th className="px-3 py-2 text-right font-semibold">Unchanged</th>
                    <th className="px-3 py-2 text-right font-semibold">HaHe / JoRu</th>
                    <th className="px-3 py-2 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploads.map((u) => (
                    <tr key={u.id}>
                      <td className="max-w-[220px] truncate px-4 py-2 font-medium text-slate-900" title={u.filename}>{u.filename}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{fmtDay(u.firstDay)} – {fmtDay(u.lastDay)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{u.rowsInFile}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700">+{u.inserted}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-sky-700">{u.updated}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{u.unchanged}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{u.excluded}{u.removed > 0 ? ` (−${u.removed})` : ""}</td>
                      <td className="px-3 py-2 text-right text-[11px] text-slate-500">
                        {u.uploadedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
