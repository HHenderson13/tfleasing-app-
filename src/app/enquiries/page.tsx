import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { reportingHorizonFromInstant } from "@/lib/business-hours";
import { loadDataBounds, loadEnquiries, loadLatestEnquiryUploadAt } from "@/lib/enquiries";
import { EnquiriesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage() {
  const user = await requireUser();
  const [bounds, latestUploadAt] = await Promise.all([
    loadDataBounds(),
    loadLatestEnquiryUploadAt(),
  ]);

  // Everything stored is sent once and sliced client-side, so moving
  // between days, weeks and months is instant rather than a round trip
  // per step. Volumes are a few hundred rows a month, well within budget.
  const rows = await loadEnquiries();

  // "Today" is resolved here, in UK time, so the default period matches
  // the office's date rather than the browser's — and so server and client
  // agree on first render.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const reportHorizon = latestUploadAt == null
    ? null
    : reportingHorizonFromInstant(latestUploadAt);

  const isAdmin = user.roles.includes("admin");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Home</Link>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/enquiries/upload"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Upload export
              </Link>
            )}
            <span className="text-slate-700">{user.name}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Enquiry Tracker</h1>
            <p className="mt-1 text-sm text-slate-500">
              Allocation and first-contact speed against target, counting working hours only
              (Mon–Fri, 09:00–17:30). Click any number to see the customers behind it.
            </p>
          </div>
          {bounds.min && (
            <div className="text-xs text-slate-500">
              Data held: <span className="font-mono text-slate-800">{bounds.min}</span> →{" "}
              <span className="font-mono text-slate-800">{bounds.max}</span>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No enquiries loaded yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {isAdmin
                ? "Upload a MotorComplete export to get started — each upload stacks on top of what's already here."
                : "An admin needs to upload a MotorComplete export before anything shows here."}
            </p>
            {isAdmin && (
              <Link
                href="/enquiries/upload"
                className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Upload export
              </Link>
            )}
          </div>
        ) : (
          <EnquiriesClient
            rows={rows}
            min={bounds.min}
            max={bounds.max}
            reportHorizon={reportHorizon}
            today={today}
          />
        )}
      </main>
    </div>
  );
}
