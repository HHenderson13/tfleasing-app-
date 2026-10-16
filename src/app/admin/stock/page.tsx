import { db } from "@/db";
import { stockColumnHRules, stockSettings, stockUploads, stockVehicles } from "@/db/schema";
import { inRangeSql, ruleMatchSql } from "@/lib/stock-list";
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
    db.select().from(stockColumnHRules),
  ]);
  const [latest] = latestRows;
  const [settings] = settingsRows;

  // What each rule catches, split by what happens to it — one "N match"
  // figure disagreed with the stock list's own filter and read as lost stock.
  //   pulledIn    — on the list because of this rule. What the
  //                 "Included by → Availability rule" filter shows.
  //   outOfRange  — a model we don't sell, or an excluded branch; no rule
  //                 overrides those.
  //   notSellable — no VIN and no ETA, which the list has always required.
  const inRange = inRangeSql();
  const sellable = sql`(${stockVehicles.vin} is not null or ${stockVehicles.etaAt} is not null)`;
  const ruleRows: RuleRow[] = await Promise.all(
    availabilityRules
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(async (r) => {
        const matches = ruleMatchSql([{ hCode: r.hCode, eValue: r.eValue, enabled: true }]);
        const [row] = matches
          ? await db
            .select({
              pulledIn: sql<number>`sum(case when ${inRange} and ${sellable} then 1 else 0 end)`,
              outOfRange: sql<number>`sum(case when not ${inRange} then 1 else 0 end)`,
              notSellable: sql<number>`sum(case when ${inRange} and not ${sellable} then 1 else 0 end)`,
            })
            .from(stockVehicles)
            .where(matches)
          : [];
        return {
          id: r.id,
          hCode: r.hCode,
          eValue: r.eValue ?? "",
          enabled: !!r.enabled,
          pulledIn: Number(row?.pulledIn ?? 0),
          outOfRange: Number(row?.outOfRange ?? 0),
          notSellable: Number(row?.notSellable ?? 0),
        };
      }),
  );

  // What column H keeps off the list: in range and sellable, with a code no
  // enabled rule names. A new Ford code shows up here first.
  const rules = availabilityRules.map((r) => ({ hCode: r.hCode, eValue: r.eValue, enabled: !!r.enabled }));
  const byRule = ruleMatchSql(rules);
  const hidden = await db
    .select({ code: sql<string>`upper(trim(${stockVehicles.rawColH}))`, n: sql<number>`count(*)` })
    .from(stockVehicles)
    .where(sql`${inRange} and ${sellable} and trim(coalesce(${stockVehicles.rawColH}, '')) <> ''${byRule ? sql` and not ${byRule}` : sql``}`)
    .groupBy(sql`upper(trim(${stockVehicles.rawColH}))`)
    .orderBy(sql`count(*) desc`);

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
      <AvailabilityRules rules={ruleRows} hidden={hidden.map((h) => ({ code: h.code, count: Number(h.n) }))} />
    </div>
  );
}
