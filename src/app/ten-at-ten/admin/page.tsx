import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { listTenAtTenUploads, loadBudgets, tenAtTenSummary, type HeldSummary } from "@/lib/ten-at-ten-store";
import { BudgetEditor } from "./budget-editor";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

// The names the team uses for the three files. Keep in step with the
// upload client's KIND_LABEL.
const KIND_LABEL: Record<string, string> = { response: "Enquiry Tracker", enquiries: "Enquiry Log", orders: "Dealbook – Orders", deliveries: "Dealbook – Deliveries" };

const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";

interface FileGuide {
  kind: "response" | "enquiries" | "orders" | "deliveries";
  from: string;
  columns: string;
  feeds: string;
  rules: string[];
  matched: string;
}

const FILES: FileGuide[] = [
  {
    kind: "response",
    from: "MotorComplete enquiry export",
    columns: "Created By · Customer · Date Raised · Type · Source · 2nd Contact · Date Transferred",
    feeds: "Response times",
    rules: [
      "Keeps MotorComplete leads only — MotorComplete Lead, Leasing.com, LeaseLoco and carwow. Every other source is stripped.",
      "Strips anything Harry Henderson or Joseph Rustigini is on, and leads merged into an existing customer.",
    ],
    matched: "exec, customer and when it was raised",
  },
  {
    kind: "enquiries",
    from: "Dealerweb enquiry log",
    columns: "Date Time · SE · Customer · Source · Model · Status",
    feeds: "Enquiries (volumes and conversion)",
    rules: [
      "Sources are named TF Lead, Leasing.com, LeaseLoco and CarWow; anything else counts as Broker / Prospect.",
      "Ordered, Handover Arranged and Delivered are orders; Live is live; Lost Sale is lost. HaHe and JoRu are stripped.",
    ],
    matched: "when it was raised, the customer and the source",
  },
  {
    kind: "orders",
    from: "Dealerweb order list (dealbook)",
    columns: "SE · Customer · Order Date · Vehicle Details · Finance Type · Total Gross",
    feeds: "Orders (profit)",
    rules: [
      "Profit is Total Gross; funder, product and term come from Finance Type. Vehicles split into ICE Car, BEV Car and Van.",
      "Same columns as Dealbook – Deliveries; recognised because its order dates sit in one month. If a file could be either, you'll be asked. HaHe and JoRu are stripped.",
    ],
    matched: "order date, customer and vehicle (identical vehicles on the same day stay separate)",
  },
  {
    kind: "deliveries",
    from: "Dealerweb delivered list (dealbook)",
    columns: "SE · Customer · Vehicle Details · Total Gross · Delivery Date",
    feeds: "Deliveries (vs budget, profit)",
    rules: [
      "Counted in the month of its Delivery Date (column AK): Dlv is delivered, Arr arrived, Est due.",
      "Upload the full month: each upload is that month's complete list, so a vehicle no longer on it (slipped to another month, or cancelled) is removed from the month. A filtered export would drop the lines it leaves out.",
      "Same columns as Dealbook – Orders; recognised because its delivery dates sit in one month. Profit is Total Gross. HaHe and JoRu are stripped.",
    ],
    matched: "order date, customer, vehicle and delivery month",
  },
];

export default async function TenAtTenAdminPage() {
  await requireAdmin();
  const [uploads, summary, budgets] = await Promise.all([listTenAtTenUploads(25), tenAtTenSummary(), loadBudgets()]);
  const thisYear = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric" }).format(new Date()));
  const held: Record<FileGuide["kind"], HeldSummary> = summary;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/ten-at-ten" className="text-slate-500 hover:text-slate-900">← 10 at 10</Link>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Admin</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Upload data</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Four files keep 10 at 10 up to date. Drop any of them in below — one at a time or all together — and
          each is recognised for you. Delivery budgets are set at the bottom of the page.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {FILES.map((f) => {
            const h = held[f.kind];
            return (
              <div key={f.kind} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-base font-semibold text-slate-900">{KIND_LABEL[f.kind]}</div>
                <div className="text-xs text-slate-500">{f.from} · feeds <span className="font-medium text-slate-700">{f.feeds}</span></div>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Has the columns</div>
                <div className="mt-0.5 text-xs text-slate-600">{f.columns}</div>
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-600">
                  {f.rules.map((r) => <li key={r}>{r}</li>)}
                  <li>Each line is matched on {f.matched}.</li>
                </ul>
                <div className="mt-auto border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {h.rows > 0 ? (
                    <><span className="font-semibold text-slate-800">{h.rows.toLocaleString("en-GB")}</span> held · {fmtDay(h.firstDay)} to {fmtDay(h.lastDay)}</>
                  ) : "Nothing held yet"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">How uploads work.</span> Files are merged{" "}
          <strong>line by line</strong>, never replaced wholesale: a line already held is overwritten with the newer
          file&apos;s values (Live becoming Ordered, a profit settling, a contact time corrected) and a new line is
          added. Overlapping date ranges and re-uploading the same file are both safe, and several files at once are
          merged in the order chosen. The one exception to &ldquo;nothing else is touched&rdquo;:{" "}
          <strong>Dealbook – Deliveries is each month&apos;s full list</strong>, so a vehicle no longer on it is
          removed from that month. And if a file shows a line has moved to an excluded name, it&apos;s removed too.
        </div>

        <UploadClient />

        <BudgetEditor budgets={budgets} initialYear={thisYear} />

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-900">Recent uploads</h2>
          {uploads.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Nothing uploaded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">File</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Dated</th>
                    <th className="px-3 py-2 text-right font-semibold">Lines</th>
                    <th className="px-3 py-2 text-right font-semibold">New</th>
                    <th className="px-3 py-2 text-right font-semibold">Overwritten</th>
                    <th className="px-3 py-2 text-right font-semibold">Unchanged</th>
                    <th className="px-3 py-2 text-right font-semibold">Left out</th>
                    <th className="px-3 py-2 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploads.map((u) => (
                    <tr key={u.id}>
                      <td className="max-w-[220px] truncate px-4 py-2 font-medium text-slate-900" title={u.filename}>{u.filename}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{KIND_LABEL[u.kind] ?? u.kind}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{fmtDay(u.firstDay)} – {fmtDay(u.lastDay)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{u.rowsInFile}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700">+{u.inserted}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-sky-700">{u.updated}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{u.unchanged}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{u.excluded}{u.removed > 0 ? ` (−${u.removed})` : ""}</td>
                      <td className="px-3 py-2 text-right text-[11px] text-slate-500">
                        {u.uploadedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
