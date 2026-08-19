import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { listUploads, loadDataBounds } from "@/lib/enquiries";
import { UploadClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EnquiryUploadPage() {
  await requireAdmin();
  const [uploads, bounds] = await Promise.all([listUploads(20), loadDataBounds()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/enquiries" className="text-slate-500 hover:text-slate-900">← Enquiry Tracker</Link>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Admin only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Upload enquiry export</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Drop in the daily MotorComplete export. Uploads <strong>stack</strong> — each file is
          merged into what&apos;s already stored rather than replacing it, and an enquiry that
          appears in more than one export is matched and updated instead of duplicated.
          Where they disagree the <strong>newest upload wins</strong>, so a corrected timestamp
          in MotorComplete carries through. Any row mentioning Joseph Rustigini or Harry
          Henderson is stripped out on the way in.
        </p>

        {bounds.min && (
          <p className="mt-3 text-xs text-slate-500">
            Currently holding enquiries from{" "}
            <span className="font-mono text-slate-800">{bounds.min}</span> to{" "}
            <span className="font-mono text-slate-800">{bounds.max}</span>.
          </p>
        )}

        <UploadClient />

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-900">Recent uploads</h2>
          {uploads.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Nothing uploaded yet.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">File</th>
                    <th className="px-3 py-2 text-right font-semibold">In file</th>
                    <th className="px-3 py-2 text-right font-semibold">New</th>
                    <th className="px-3 py-2 text-right font-semibold">Updated</th>
                    <th className="px-3 py-2 text-right font-semibold">Skipped</th>
                    <th className="px-3 py-2 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploads.map((u) => (
                    <tr key={u.id}>
                      <td className="max-w-[240px] truncate px-4 py-2 font-medium text-slate-900" title={u.filename}>
                        {u.filename}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{u.rowsInFile}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700">+{u.rowsInserted}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-sky-700">{u.rowsUpdated}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{u.rowsSkipped}</td>
                      <td className="px-3 py-2 text-right text-[11px] text-slate-500">
                        {u.uploadedAt.toLocaleString("en-GB", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
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
