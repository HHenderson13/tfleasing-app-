import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { requireUser } from "@/lib/auth-guard";
import { progressOf, ukNow } from "@/lib/customer-profiles";
import { listOwners, listProfileDocs, listProfiles, type ProfileView } from "@/lib/customer-profiles-store";
import { getMessageConfig, listOffers, senderFor } from "@/lib/message-store";
import { ProfileList, type ListRow } from "./list";
import { WhosePicker } from "./whose";

export const dynamic = "force-dynamic";

/** When this request was served: the page's clock starts here, so the first paint matches the server's. */
const requestTime = () => Date.now();

// Customer Profiles: every signed-in user. An exec opens on their own
// customers and can flick into a colleague's or everyone's; an admin opens on
// everyone's (user, 2026-11-04). ?view=mine | all | <user id>.
export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ view?: string; moved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const asked = String(sp.view ?? "");
  const owners = await listOwners();
  const chosen = asked === "all" || asked === "mine" ? asked : owners.some((o) => o.id === asked) ? asked : isAdmin(user) ? "all" : "mine";
  const view: ProfileView = chosen === "all" ? "all" : { owner: chosen === "mine" ? user.id : chosen };
  const [rows, sender, offers, msgCfg] = await Promise.all([listProfiles(view), senderFor(user), listOffers(), getMessageConfig()]);
  const docs = await listProfileDocs(rows.filter((r) => r.status === "live").map((r) => r.id));
  // Only what the list needs: the notes themselves stay on the server until a profile is opened.
  const keep = ["heat", "contactBy", "callbackDate", "callbackTime", "derivative", "rental", "currentVehicle", "pxReg", "pxValue", "pxHas"];
  const list: ListRow[] = rows.map((r) => ({
    id: r.id, customerName: r.customerName, kind: r.kind, model: r.model, status: r.status, lostReason: r.lostReason,
    ownerName: r.ownerName, createdAt: r.createdAt, updatedAt: r.updatedAt, closedAt: r.closedAt,
    data: Object.fromEntries(keep.filter((k) => r.data[k] != null).map((k) => [k, r.data[k]])),
    progress: progressOf({ kind: r.kind, model: r.model, data: r.data }).pct,
    docs: docs.get(r.id)?.length ?? 0,
  }));
  const whose = chosen === "all" ? "all" : chosen === "mine" || chosen === user.id ? "mine" : (owners.find((o) => o.id === chosen)?.name ?? "");
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 text-sm sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 font-medium text-slate-600 transition hover:text-slate-900">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Home
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin(user) && (
              <>
                <Link href="/profiles/templates" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">Templates</Link>
                <Link href="/profiles/offers" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">Offers</Link>
              </>
            )}
            <WhosePicker value={chosen === user.id ? "mine" : chosen} meId={user.id} owners={owners} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <ProfileList rows={list} now={ukNow()} nowMs={requestTime()} whose={whose} showOwner={chosen === "all"} messages={{ sender, offers, config: msgCfg.config, admin: isAdmin(user) }} moved={/^[0-9a-f-]{36}$/.test(String(sp.moved ?? "")) ? String(sp.moved) : null} />
      </main>
    </div>
  );
}
