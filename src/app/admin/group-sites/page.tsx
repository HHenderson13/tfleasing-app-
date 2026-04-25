import { db } from "@/db";
import { groupSites } from "@/db/schema";
import { asc } from "drizzle-orm";
import { GroupSitesView } from "./view";

export const dynamic = "force-dynamic";

export default async function GroupSitesPage() {
  const rows = await db.select().from(groupSites).orderBy(asc(groupSites.name));
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Group sites</h1>
      <p className="mt-1 text-sm text-slate-500">Sites that Group BQ deals can be assigned to.</p>
      <div className="mt-6">
        <GroupSitesView rows={rows.map((r) => ({ id: r.id, name: r.name, kind: (r.kind === "cv" ? "cv" : "car") as "car" | "cv" }))} />
      </div>
    </div>
  );
}
