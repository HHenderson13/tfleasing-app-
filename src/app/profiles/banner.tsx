"use client";

import Link from "next/link";

/** On a calculator opened from a Customer Profile: whose it is, and the way back. */
export function ProfileBanner({ id, name, save }: { id: string; name: string; save: "saving" | "saved" | "failed" | null }) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-slate-900">{`For ${name}`}</div>
          <div className={`text-[12.5px] ${save === "failed" ? "text-rose-700" : save === "saved" ? "text-emerald-700" : "text-slate-600"}`}>
            {save === "saving" ? "Saving the PDF to their profile" : save === "saved" ? "PDF saved to their profile" : save === "failed" ? "The PDF downloaded but didn't save to their profile. Try exporting again." : "Filled in from their profile. Export the PDF and it's saved there too."}
          </div>
        </div>
      </div>
      <Link href={`/profiles/${id}`} className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition hover:bg-slate-800">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4"><path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
        Back to their profile
      </Link>
    </div>
  );
}
