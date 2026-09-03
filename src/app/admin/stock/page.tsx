import { db } from "@/db";
import { stockAvailabilityRules, stockSettings, stockUploads, stockVehicles } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { StockUploadView } from "./view";
import { AvailabilityRules, type RuleRow } from "./availability-rules";

export const dynamic = "force-dynamic";
// Workbook parse + DB replace can take a while; default 10s on Hobby would 504.
export const maxDuration = 300;

export default async function StockUploadPage() {
  // Four independent reads in parallel — was sequential.
  const [latestRows, countRow, bySheet, settingsRows, availabilityRules] = await Promise.all([
    db.select().from(stockUploads).orderBy(desc(stockUploads.uploadedAt)).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(stockVehicles),
    db
      .select({ sheet: stockVehicles.sourceSheet, n: sql<number>`count(*)` })
      .from(stockVehicles)
      .groupBy(stockVehicles.sourceSheet),
    db.select().from(stockSettings).where(eq(stockSettings.id, "default")).limit(1),
    db.select().from(stockAvailabilityRules),
  ]);
  const [latest] = latestRows;
  const [settings] = settingsRows;

  // What each rule catches, broken into the three groups a match can fall
  // into. A single "N vehicles match" number was actively misleading: it
  // counted every matching row, while the stock list's "Included by:
  // Availability rule" filter shows only the rows the rule RESCUED. The two
  // numbers disagreed (66 vs 32) and looked like lost stock.
  //
  //   pulledIn       — hidden without the rule. What the filter shows.
  //   alreadyVisible — in the list regardless; the rule changes nothing.
  //   noVin          — never reaches the list: /stock has always required a
  //                    VIN, because the TF-xxxx reference is derived from it.
  const ruleRows: RuleRow[] = await Promise.all(
    availabilityRules
      .slice()
      .sort((a, b) => a.columnLetter.localeCompare(b.columnLetter))
      .map(async (r) => {
        const letter = r.columnLetter.trim().toUpperCase();
        const column =
          letter === "E" ? stockVehicles.rawColE :
          letter === "H" ? stockVehicles.rawColH :
          null;
        let pulledIn = 0;
        let alreadyVisible = 0;
        let noVin = 0;
        if (column && r.matchValue.trim()) {
          const value = r.matchValue.trim().toUpperCase();
          const matches = sql`upper(trim(${column})) = ${value}`;
          const [row] = await db
            .select({
              pulledIn: sql<number>`sum(case when ${stockVehicles.vin} is not null and ${stockVehicles.customerAssigned} = 1 then 1 else 0 end)`,
              alreadyVisible: sql<number>`sum(case when ${stockVehicles.vin} is not null and ${stockVehicles.customerAssigned} = 0 then 1 else 0 end)`,
              noVin: sql<number>`sum(case when ${stockVehicles.vin} is null then 1 else 0 end)`,
            })
            .from(stockVehicles)
            .where(matches);
          pulledIn = Number(row?.pulledIn ?? 0);
          alreadyVisible = Number(row?.alreadyVisible ?? 0);
          noVin = Number(row?.noVin ?? 0);
        }
        return {
          columnLetter: r.columnLetter,
          matchValue: r.matchValue,
          enabled: !!r.enabled,
          pulledIn,
          alreadyVisible,
          noVin,
        };
      }),
  );
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
      <AvailabilityRules rules={ruleRows} />
    </div>
  );
}
