"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KIND_LABEL, sortLive, ukNow, urgencyOf, type Heat, type ProfileData, type ProfileKind, type ProfileStatus } from "@/lib/customer-profiles";
import { CARD, HEAT_DOT, Icon, KindBadge, Ring, UrgencyBadge, ago } from "./ui";
import { NewProfile } from "./new-profile";
import { setProfileStatusAction } from "./actions";

export interface ListRow {
  id: string;
  customerName: string;
  kind: ProfileKind;
  model: string;
  status: ProfileStatus;
  lostReason: string | null;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  /** Just the answers the list shows or sorts on. */
  data: ProfileData;
  progress: number;
  docs: number;
}

type Filter = "all" | "due" | "hot" | "nonext" | "personal" | "business";

/** The time, ticking once a minute; starts from the server's so the first paint matches. */
function useClock(now: string, nowMs: number) {
  const [t, setT] = useState({ now, ms: nowMs });
  useEffect(() => {
    const id = setInterval(() => setT({ now: ukNow(), ms: Date.now() }), 60_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

const dateOf = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

export function ProfileList({ rows, now, nowMs, whose, showOwner, moved }: { rows: ListRow[]; now: string; nowMs: number; whose: string; showOwner: boolean; moved: string | null }) {
  const team = showOwner;
  const theirs = whose === "mine" ? "Your" : whose === "all" ? "Everyone's" : `${whose}'s`;
  const clock = useClock(now, nowMs);
  const [tab, setTab] = useState<ProfileStatus>("live");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  // "n" starts a new customer, unless they're typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = useMemo(() => sortLive(rows.filter((r) => r.status === "live"), clock.now), [rows, clock.now]);
  const counts = {
    live: live.length,
    ordered: rows.filter((r) => r.status === "ordered").length,
    lost: rows.filter((r) => r.status === "lost").length,
  };
  const tiers = live.map((r) => urgencyOf(r.data, clock.now).tier);
  const due = tiers.filter((t) => t <= 1).length;
  const overdue = tiers.filter((t) => t === 0).length;
  const hot = live.filter((r) => r.data.heat === "Hot").length;
  const noNext = tiers.filter((t) => t === 3).length;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (r: ListRow) => {
    if (!words.length) return true;
    const hay = [r.customerName, r.model, KIND_LABEL[r.kind], r.ownerName, r.data.derivative, r.data.currentVehicle, r.data.pxReg, r.lostReason]
      .filter((x) => typeof x === "string").join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const passes = (r: ListRow) => {
    const t = urgencyOf(r.data, clock.now).tier;
    switch (filter) {
      case "due": return t <= 1;
      case "hot": return r.data.heat === "Hot";
      case "nonext": return t === 3;
      case "personal": return r.kind === "personal";
      case "business": return r.kind !== "personal";
      default: return true;
    }
  };
  const shown = tab === "live"
    ? live.filter((r) => matches(r) && passes(r))
    : rows.filter((r) => r.status === tab && matches(r)).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  const upNext = tab === "live" && !words.length && filter === "all" ? live[0] : undefined;
  const rest = upNext ? shown.slice(1) : shown;

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[34px]">Customer Profiles</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">
            {`${theirs} live enquiries, most important first. Open one while you're on the phone and fill in whatever comes up, in any order. It saves as you go.`}
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-slate-800">
          <Icon name="plus" />New customer
          <kbd className="ml-1 hidden rounded border border-white/20 px-1.5 text-[11px] font-medium text-slate-300 sm:inline">N</kbd>
        </button>
      </div>

      {counts.live > 0 && (
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Live enquiries" value={counts.live} on={tab === "live" && filter === "all"} onClick={() => { setTab("live"); setFilter("all"); }} />
          <Stat label="Due now" value={due} sub={overdue ? `${overdue} overdue` : null} tone={overdue ? "rose" : due ? "amber" : undefined}
            on={tab === "live" && filter === "due"} onClick={() => { setTab("live"); setFilter("due"); }} />
          <Stat label="Hot" value={hot} tone={hot ? "rose" : undefined} on={tab === "live" && filter === "hot"} onClick={() => { setTab("live"); setFilter("hot"); }} />
          <Stat label="Nothing booked" value={noNext} tone={noNext ? "amber" : undefined} on={tab === "live" && filter === "nonext"} onClick={() => { setTab("live"); setFilter("nonext"); }} />
        </div>
      )}

      {upNext && <UpNext r={upNext} now={clock.now} nowMs={clock.ms} total={counts.live} team={team} mine={whose === "mine"} />}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Which enquiries" className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
          {(["live", "ordered", "lost"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setFilter("all"); }}
              className={`flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-medium transition sm:flex-none ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              {t === "live" ? "Live" : t === "ordered" ? "Ordered" : "Lost sales"}
              <span className={`rounded-full px-1.5 text-[12px] tabular-nums ${tab === t ? "bg-slate-100 text-slate-700" : "text-slate-500"}`}>{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-80">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, model, reg" aria-label="Search customers"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14px]" />
        </div>
      </div>

      {tab === "live" && counts.live > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {([["all", "All"], ["due", "Due now"], ["hot", "Hot"], ["nonext", "Nothing booked"], ["personal", "Personal"], ["business", "Business"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`h-8 rounded-full px-3 text-[13px] font-medium transition ${filter === k ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:ring-slate-400"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={`mt-4 overflow-hidden ${CARD}`}>
        {rest.length === 0 ? (
          <Empty tab={tab} mine={whose === "mine"} any={counts[tab] > 0} searching={words.length > 0 || filter !== "all"} onlyUpNext={!!upNext} onAdd={() => setAdding(true)} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rest.map((r) => <Row key={r.id} r={r} now={clock.now} nowMs={clock.ms} team={team} />)}
          </ul>
        )}
      </div>

      {adding && <NewProfile onClose={() => setAdding(false)} />}
      <MovedToast row={moved ? rows.find((r) => r.id === moved && r.status !== "live") ?? null : null} />
    </>
  );
}

function Stat({ label, value, sub, tone, on, onClick }: { label: string; value: number; sub?: string | null; tone?: "rose" | "amber"; on: boolean; onClick: () => void }) {
  const colour = tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`${CARD} px-4 py-3.5 text-left transition hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.18)] ${on ? "!shadow-[0_0_0_2px_rgba(15,23,42,0.9)]" : ""}`}>
      <div className="text-[12.5px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-[26px] font-semibold leading-none tracking-tight tabular-nums ${colour}`}>{value}</span>
        {sub && <span className="text-[12.5px] font-medium text-rose-700">{sub}</span>}
      </div>
    </button>
  );
}

function UpNext({ r, now, nowMs, total, team, mine }: { r: ListRow; now: string; nowMs: number; total: number; team: boolean; mine: boolean }) {
  const u = urgencyOf(r.data, now);
  const heat = r.data.heat as Heat | undefined;
  const sub = [r.model, typeof r.data.derivative === "string" ? r.data.derivative : null].filter(Boolean).join(" · ");
  return (
    <Link href={`/profiles/${r.id}`}
      className="group mt-6 block overflow-hidden rounded-2xl bg-slate-900 text-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.45)] ring-1 ring-slate-900 transition hover:ring-slate-700">
      <div className="flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="relative flex h-2 w-2">
              {u.tier <= 1 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${u.tier <= 1 ? "bg-rose-400" : "bg-emerald-400"}`} />
            </span>
            Up next
            <span className="font-normal normal-case tracking-normal text-slate-500">{total > 1 ? `the most important of ${total} live` : mine ? "your only live enquiry" : "the only live enquiry"}</span>
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            {heat && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEAT_DOT[heat]}`} title={heat} />}
            <h2 className="truncate text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">{r.customerName}</h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-slate-300">
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[12px] font-medium text-white">{KIND_LABEL[r.kind]}</span>
            {sub && <span className="truncate">{sub}</span>}
            {team && <span className="text-slate-400">· {r.ownerName}</span>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${u.tone === "rose" ? "bg-rose-500/20 text-rose-200" : u.tone === "amber" ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-slate-200"}`}>
              {u.tier <= 1 && <Icon name="clock" className="h-3.5 w-3.5" />}
              {u.label}{u.detail && <span className="font-normal opacity-80">· {u.detail}</span>}
            </span>
            <span className="text-[13px] text-slate-400">Updated {ago(r.updatedAt, nowMs)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <div className="hidden text-right sm:block">
            <div className="text-[26px] font-semibold leading-none tabular-nums">{r.progress}%</div>
            <div className="mt-1 text-[12px] text-slate-400">answered</div>
          </div>
          <span className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-5 text-[14px] font-semibold text-slate-900 transition group-hover:bg-slate-100 sm:flex-none">
            Open profile<Icon name="chevron" />
          </span>
        </div>
      </div>
      <div className="h-1 bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${r.progress}%` }} /></div>
    </Link>
  );
}

function Row({ r, now, nowMs, team }: { r: ListRow; now: string; nowMs: number; team: boolean }) {
  const heat = r.data.heat as Heat | undefined;
  const sub = [r.model, typeof r.data.derivative === "string" ? r.data.derivative : null].filter(Boolean).join(" · ");
  const u = r.status === "live" ? urgencyOf(r.data, now) : null;
  return (
    <li>
      <Link href={`/profiles/${r.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5">
        {r.status === "live" ? (
          <div className="relative hidden sm:block" title={`${r.progress}% answered`}>
            <Ring pct={r.progress} size={38} />
            <span className="absolute inset-0 grid place-items-center text-[10.5px] font-semibold tabular-nums text-slate-600">{r.progress}</span>
          </div>
        ) : (
          <span className={`hidden h-9 w-9 shrink-0 place-items-center rounded-full sm:grid ${r.status === "ordered" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            <Icon name={r.status === "ordered" ? "check" : "x"} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {heat && r.status === "live" && <span className={`h-2 w-2 shrink-0 rounded-full ${HEAT_DOT[heat]}`} title={heat} />}
            <span className="truncate text-[15px] font-semibold text-slate-900">{r.customerName}</span>
            {r.docs > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-slate-400" title={`${r.docs} document${r.docs === 1 ? "" : "s"}`}><Icon name="doc" className="h-3.5 w-3.5" />{r.docs}</span>}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
            <KindBadge kind={r.kind} />
            {sub && <span className="min-w-0 truncate">{sub}</span>}
            {team && <span className="text-slate-400">· {r.ownerName}</span>}
          </div>
          {u && <div className="mt-2 md:hidden"><UrgencyBadge u={u} size="sm" /></div>}
          {r.status !== "live" && (
            <div className="mt-1.5 text-[12.5px] text-slate-500">
              {r.status === "ordered" ? `Ordered ${r.closedAt ? dateOf(r.closedAt) : ""}` : `Lost ${r.closedAt ? dateOf(r.closedAt) : ""}${r.lostReason ? `: ${r.lostReason}` : ""}`}
            </div>
          )}
        </div>
        {u && <div className="hidden shrink-0 md:block"><UrgencyBadge u={u} /></div>}
        <div className="hidden w-28 shrink-0 text-right text-[12.5px] text-slate-500 lg:block">{ago(r.updatedAt, nowMs)}</div>
        <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
      </Link>
    </li>
  );
}

function Empty({ tab, mine, any, searching, onlyUpNext, onAdd }: { tab: ProfileStatus; mine: boolean; any: boolean; searching: boolean; onlyUpNext: boolean; onAdd: () => void }) {
  if (onlyUpNext) return <p className="px-5 py-6 text-center text-[14px] text-slate-500">That&apos;s everything: one live enquiry, shown above.</p>;
  if (searching && any) return <p className="px-5 py-8 text-center text-[14px] text-slate-500">Nothing matches that.</p>;
  if (tab === "ordered") return <p className="px-5 py-8 text-center text-[14px] text-slate-500">Nothing ordered yet. Press Ordered on a profile and it moves here.</p>;
  if (tab === "lost") return <p className="px-5 py-8 text-center text-[14px] text-slate-500">No lost sales. Long may it last.</p>;
  if (!mine) return <p className="px-5 py-8 text-center text-[14px] text-slate-500">No live enquiries here.</p>;
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white"><Icon name="person" className="h-6 w-6" /></div>
      <h3 className="mt-4 text-[17px] font-semibold text-slate-900">No live enquiries yet</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-6 text-slate-600">Add the customer you&apos;re about to call. Name, personal or business, and the model is all it needs to start.</p>
      <button type="button" onClick={onAdd} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white hover:bg-slate-800">
        <Icon name="plus" />New customer
      </button>
    </div>
  );
}

/** After Ordered or Lost sale on a profile: back here, with a way to undo it. */
function MovedToast({ row }: { row: ListRow | null }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!row) return;
    const t = setTimeout(() => setGone(true), 8000);
    return () => clearTimeout(t);
  }, [row]);
  if (!row || gone) return null;
  const undo = async () => {
    setBusy(true);
    const r = await setProfileStatusAction(row.id, "live").catch(() => ({ ok: false }));
    if (r.ok) router.replace(`/profiles/${row.id}`);
    else setBusy(false);
  };
  return (
    <div role="status" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[14px] text-white shadow-xl">
        <Icon name="check" className="h-4 w-4 text-emerald-400" />
        <span>{`${row.customerName} moved to ${row.status === "ordered" ? "Ordered" : "Lost sales"}`}</span>
        <button type="button" onClick={undo} disabled={busy} className="font-semibold text-emerald-300 hover:text-emerald-200 disabled:opacity-60">Undo</button>
        <button type="button" onClick={() => setGone(true)} aria-label="Dismiss" className="text-slate-400 hover:text-white"><Icon name="x" className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
