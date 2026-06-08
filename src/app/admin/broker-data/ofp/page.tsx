import Link from "next/link";
import { db } from "@/db";
import { brokerOfpUploads, brokerOfpData } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { OfpUploadView } from "./view";

export const dynamic = "force-dynamic";

interface ClassSummary {
  vehicleClass: "cv" | "pv";
  uploadedAt: string | null;
  filename: string | null;
  rowCount: number;
  totalCells: number;
  pcpRows: number;
  hpBalRows: number;
}

async function loadClassSummary(vehicleClass: "cv" | "pv"): Promise<ClassSummary> {
  const [latest] = await db
    .select()
    .from(brokerOfpUploads)
    .where(eq(brokerOfpUploads.vehicleClass, vehicleClass))
    .orderBy(desc(brokerOfpUploads.uploadedAt))
    .limit(1);
  const cells = await db.all<{ route: string; n: number }>(sql`
    SELECT funding_route AS route, COUNT(*) AS n
    FROM broker_ofp_data
    WHERE vehicle_class = ${vehicleClass}
    GROUP BY funding_route
  `);
  const byRoute = new Map(cells.map((c) => [c.route, Number(c.n)]));
  return {
    vehicleClass,
    uploadedAt: latest?.uploadedAt.toISOString() ?? null,
    filename: latest?.filename ?? null,
    rowCount: latest?.rowCount ?? 0,
    totalCells: cells.reduce((a, c) => a + Number(c.n), 0),
    pcpRows: byRoute.get("pcp") ?? 0,
    hpBalRows: byRoute.get("hp_balloon") ?? 0,
  };
}

export default async function OfpAdminPage() {
  const [cv, pv] = await Promise.all([loadClassSummary("cv"), loadClassSummary("pv")]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">OFP data</h1>
        <p className="mt-1 text-sm text-slate-500">
          Optional Final Payment terminals from Ford&apos;s quarterly OFP workbooks. Two product files —
          Commercial Vehicles and Passenger Vehicles — each with two sheets (PCP + HP-with-Balloon).
          Re-uploading replaces the previous data for that vehicle class.
        </p>
      </div>

      <OfpUploadView cv={cv} pv={pv} />
    </div>
  );
}
