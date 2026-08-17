import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { reportingHorizonFromInstant } from "@/lib/business-hours";
import { loadDataBounds, loadEnquiries, loadLatestEnquiryUploadAt } from "@/lib/enquiries";
import { EnquiriesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [bounds, latestUploadAt] = await Promise.all([
    loadDataBounds(),
    loadLatestEnquiryUploadAt(),
  ]);

  // Default to everything stored. The range is a plain date filter on the
  // enquiry day, so a bookmarked ?from=&to= keeps working as new uploads
  // extend the data.
  const from = sp.from || bounds.min || "";
  const to = sp.to || bounds.max || "";
  const rows = await loadEnquiries({ from: from || undefined, to: to || undefined });
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
            from={from}
            to={to}
            min={bounds.min}
            max={bounds.max}
            reportHorizon={reportHorizon}
          />
        )}
      </main>
    </div>
  );
}
