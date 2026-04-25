import { db } from "@/db";
import { funders, ratebook, ratebookUploads } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function RatebooksPage() {
  const fs = await db.select().from(funders).orderBy(funders.name);
  const summary = await db.all<{ funder_id: string; is_maintained: number; rows: number }>(sql`
    SELECT funder_id, is_maintained, COUNT(*) as rows FROM ratebook GROUP BY funder_id, is_maintained
  `);
  const recent = await db.select().from(ratebookUploads).orderBy(desc(ratebookUploads.uploadedAt)).limit(20);

  const byKey = new Map(summary.map((s) => [`${s.funder_id}|${s.is_maintained}`, s.rows]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ratebooks</h1>
        <p className="mt-1 text-sm text-slate-500">Upload the 8 BCH ratebooks (4 funders × Customer Maintained + Maintained). PCH is calculated as BCH × 1.2 VAT at quote time. Uploading replaces all rows for that slice.</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Currently loaded</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Funder</th>
                <th className="px-4 py-3 text-right font-medium">Customer Maintained</th>
                <th className="px-4 py-3 text-right font-medium">Maintained</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fs.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{f.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(byKey.get(`${f.id}|0`) ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(byKey.get(`${f.id}|1`) ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Upload</h2>
        <UploadForm funders={fs.map((f) => ({ id: f.id, name: f.name }))} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Recent uploads</h2>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-400">None yet.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {recent.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2">
                <span className="text-slate-700">
                  <span className="font-medium">{u.funderId}</span> · {u.isMaintained ? "Maintained" : "Customer Maint."} · {u.filename}
                </span>
                <span className="text-xs text-slate-500">{u.rowCount} rows · {new Date(u.uploadedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
