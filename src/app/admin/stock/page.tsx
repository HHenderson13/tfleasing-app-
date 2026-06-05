import { db } from "@/db";
import { stockSettings, stockUploads, stockVehicles } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { StockUploadView } from "./view";

export const dynamic = "force-dynamic";
// Workbook parse + DB replace can take a while; default 10s on Hobby would 504.
export const maxDuration = 300;

export default async function StockUploadPage() {
  // Four independent reads in parallel — was sequential.
  const [latestRows, countRow, bySheet, settingsRows] = await Promise.all([
    db.select().from(stockUploads).orderBy(desc(stockUploads.uploadedAt)).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(stockVehicles),
    db
      .select({ sheet: stockVehicles.sourceSheet, n: sql<number>`count(*)` })
      .from(stockVehicles)
      .groupBy(stockVehicles.sourceSheet),
    db.select().from(stockSettings).where(eq(stockSettings.id, "default")).limit(1),
  ]);
  const [latest] = latestRows;
  const [settings] = settingsRows;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Stock upload</h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload the Ford <span className="font-mono">Leasing Stock Report.xlsm</span>. We read the <span className="font-mono">input</span> tab directly — no need to run the macro first.
        Each upload <span className="font-medium">replaces</span> the previous stock snapshot.
      </p>
      <StockUploadView
        latest={latest ? { filename: latest.filename, vehicleCount: latest.vehicleCount, uploadedAt: latest.uploadedAt.toISOString() } : null}
        currentCount={Number(countRow[0]?.n ?? 0)}
        perSheet={bySheet.map((r) => ({ sheet: r.sheet ?? "—", count: Number(r.n) }))}
        password={settings?.workbookPassword ?? "Ftru"}
      />
    </div>
  );
}
