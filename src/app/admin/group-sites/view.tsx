"use client";
import { useState, useTransition } from "react";
import { createGroupSite, deleteGroupSite, updateGroupSite, type SiteKind } from "./actions";

type Row = { id: string; name: string; kind: SiteKind };

export function GroupSitesView({ rows }: { rows: Row[] }) {
  const carRows = rows.filter((r) => r.kind === "car");
  const cvRows = rows.filter((r) => r.kind === "cv");
  return (
    <div className="space-y-8">
      <SitesSection title="Car sites" kind="car" rows={carRows} />
      <SitesSection title="CV sites" kind="cv" rows={cvRows} />
    </div>
  );
}

function SitesSection({ title, kind, rows }: { title: string; kind: SiteKind; rows: Row[] }) {
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    start(async () => {
      const res = await createGroupSite({ name, kind });
      if (!res.ok) { setError(res.error); return; }
      setName(""); setAdding(false);
    });
  }
  function remove(id: string, label: string) {
    if (!confirm(`Delete "${label}"? Existing BQ proposals stay assigned but you won't see this site in the picker.`)) return;
    start(() => deleteGroupSite(id));
  }
  function changeKind(id: string, next: SiteKind) {
    start(() => updateGroupSite(id, { kind: next }));
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Site name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={r.name}
                    onBlur={(e) => e.currentTarget.value !== r.name && start(() => updateGroupSite(r.id, { name: e.currentTarget.value }))}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={r.kind}
                    onChange={(e) => changeKind(r.id, e.currentTarget.value as SiteKind)}
                    className="rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="car">Car</option>
                    <option value="cv">CV</option>
                  </select>
                </td>
                <td className="px-2 py-2 text-right">
                  <button onClick={() => remove(r.id, r.name)} className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No {kind === "car" ? "car" : "CV"} sites yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${kind === "car" ? "Car" : "CV"} site name`} className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={add} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
            <button onClick={() => { setAdding(false); setError(null); }} className="text-sm text-slate-400">Cancel</button>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-900"
        >
          + Add {kind === "car" ? "car" : "CV"} site
        </button>
      )}
    </section>
  );
}
