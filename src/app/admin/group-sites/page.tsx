import { db } from "@/db";
import { groupSites } from "@/db/schema";
import { asc } from "drizzle-orm";
import { GroupSitesView } from "./view";

export const dynamic = "force-dynamic";

export default async function GroupSitesPage() {
  const rows = await db.select().from(groupSites).orderBy(asc(groupSites.name));
  return (
    <div>
      <h1 className="font-semibold text-slate-900 text-[28px] leading-tight tracking-tight sm:text-[34px]">Group sites</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">Sites that Group BQ deals can be assigned to.</p>
      <div className="mt-6">
        <GroupSitesView rows={rows.map((r) => ({ id: r.id, name: r.name, kind: (r.kind === "cv" ? "cv" : "car") as "car" | "cv" }))} />
      </div>
    </div>
  );
}
