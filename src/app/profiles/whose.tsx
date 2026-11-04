"use client";

import { useRouter } from "next/navigation";

/** Mine, everyone's, or one colleague's. Kept in the address so a refresh stays put. */
export function WhosePicker({ value, meId, owners }: { value: string; meId: string; owners: { id: string; name: string; live: number }[] }) {
  const router = useRouter();
  const others = owners.filter((o) => o.id !== meId);
  return (
    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-[13px] font-medium">
      <button type="button" onClick={() => router.push("/profiles?view=mine")}
        className={`h-7 rounded-lg px-3 ${value === "mine" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>Mine</button>
      <button type="button" onClick={() => router.push("/profiles?view=all")}
        className={`h-7 rounded-lg px-3 ${value === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>Everyone</button>
      {others.length > 0 && (
        <select aria-label="One exec's customers" value={value !== "mine" && value !== "all" ? value : ""}
          onChange={(e) => e.target.value && router.push(`/profiles?view=${encodeURIComponent(e.target.value)}`)}
          className={`h-7 max-w-[10rem] cursor-pointer appearance-none truncate rounded-lg bg-transparent pl-2.5 pr-6 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/20 ${value !== "mine" && value !== "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath d='M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", backgroundSize: "16px" }}>
          <option value="">One exec</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}{o.live ? ` (${o.live})` : ""}</option>)}
        </select>
      )}
    </div>
  );
}
