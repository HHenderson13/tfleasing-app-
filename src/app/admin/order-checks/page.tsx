import Link from "next/link";
import { db } from "@/db";
import { stageCheckDefs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { OrderChecksView } from "./view";

export const dynamic = "force-dynamic";

const STAGE_META = {
  order: {
    label: "Order stage",
    blurb: "Extra checks ticked on an in-order proposal before it can move to awaiting delivery. Built-in checks (chip, MotorComplete, finance agreement, vehicle details) always apply.",
  },
  delivery: {
    label: "Delivery stage",
    blurb: "Extra checks ticked on an awaiting-delivery proposal before it can be marked delivered. Delivery date must always be set; reg number stays optional.",
  },
} as const;

type Stage = keyof typeof STAGE_META;

export default async function OrderChecksPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const sp = await searchParams;
  const stage: Stage = sp.stage === "delivery" ? "delivery" : "order";
  const rows = await db.select().from(stageCheckDefs).where(eq(stageCheckDefs.stage, stage)).orderBy(asc(stageCheckDefs.sortOrder), asc(stageCheckDefs.label));
  const meta = STAGE_META[stage];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Stage checks</h1>
      <p className="mt-1 text-sm text-slate-500">{meta.blurb}</p>
      <nav className="mt-4 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
        {(Object.keys(STAGE_META) as Stage[]).map((s) => (
          <Link
            key={s}
            href={`/admin/order-checks${s === "order" ? "" : "?stage=delivery"}`}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${stage === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            {STAGE_META[s].label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <OrderChecksView stage={stage} rows={rows.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sortOrder, appliesToBq: r.appliesToBq }))} />
      </div>
    </div>
  );
}
