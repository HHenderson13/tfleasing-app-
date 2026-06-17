"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/stat-tile";

// Delivered view — fully client-state. Mirrors the awaiting-client pattern
// (server hands down a flat payload, all filtering happens in memory) so
// switching between months / scopes is instant.

export interface DeliveredItem {
  id: string;
  customerId: string;
  customerName: string;
  businessName: string | null;
  model: string;
  derivative: string;
  funderName: string;
  regNumber: string | null;
  vin: string | null;
  execId: string | null;
  execName: string | null;
  isGroupBq: boolean;
  groupSiteName: string | null;
  deliveredAtIso: string | null;     // YYYY-MM-DD
  gapSold: boolean;                  // gapPolicyStatus === "complete"
  tfpSold: boolean;                  // tfpPolicyStatus === "complete"
}

type Scope = "mine" | "all" | "others";

interface Props {
  items: DeliveredItem[];
  myExecId: string | null;
  myExecName: string | null;
  isAdmin: boolean;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function DeliveredClient({ items, myExecId, myExecName, isAdmin }: Props) {
  // Default scope: "mine" if the user has at least one delivery on record;
  // otherwise drop straight to "all" so they see something useful.
  const hasMine = useMemo(() => !!myExecId && items.some((i) => i.execId === myExecId), [items, myExecId]);
  const [scope, setScope] = useState<Scope>(hasMine ? "mine" : "all");

  // All months represented in the data — sorted newest first.
  const monthKeys = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.deliveredAtIso) set.add(it.deliveredAtIso.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  // Default month: current month if it has any deliveries, else most recent.
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultMonth = monthKeys.includes(thisMonthKey) ? thisMonthKey : (monthKeys[0] ?? thisMonthKey);
  const [activeMonth, setActiveMonth] = useState<string>(defaultMonth);

  // Items in the active month — filtered first by month, then by scope so
  // the scope toggle reflects what's actually visible.
  const scoped = useMemo(() => {
    const inMonth = items.filter((i) => i.deliveredAtIso && i.deliveredAtIso.startsWith(activeMonth));
    if (scope === "mine") return inMonth.filter((i) => i.execId === myExecId);
    if (scope === "others") return inMonth.filter((i) => i.execId !== myExecId);
    return inMonth;
  }, [items, activeMonth, scope, myExecId]);

  // Header stats for the active month + scope. GAP / TFP counts are the
  // number of policies marked "complete" (i.e. sold to the customer).
  const stats = useMemo(() => {
    const delivered = scoped.length;
    let gap = 0, tfp = 0;
    for (const it of scoped) {
      if (it.gapSold) gap++;
      if (it.tfpSold) tfp++;
    }
    return { delivered, gap, tfp };
  }, [scoped]);

  // Sort: own deliveries first, then by date descending. Keeps the user's
  // own work at the top of the list even when "All" is active.
  const sortedItems = useMemo(() => {
    return [...scoped].sort((a, b) => {
      const aMine = a.execId === myExecId ? 0 : 1;
      const bMine = b.execId === myExecId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return (b.deliveredAtIso ?? "").localeCompare(a.deliveredAtIso ?? "");
    });
  }, [scoped, myExecId]);

  const scopeLabel = scope === "mine" ? (myExecName ?? "My") : scope === "others" ? "Others" : "All";

  return (
    <>
      {/* Scope toggle (always visible — even non-admins see "All" so they
          can spot whose deal is whose). Admins see exactly the same three
          options. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Show:</span>
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
          <ScopeButton active={scope === "mine"} onClick={() => setScope("mine")} disabled={!myExecId}>
            {myExecName ?? "Mine"}
          </ScopeButton>
          <ScopeButton active={scope === "all"} onClick={() => setScope("all")}>All</ScopeButton>
          <ScopeButton active={scope === "others"} onClick={() => setScope("others")} disabled={!myExecId}>Others</ScopeButton>
        </nav>
        {isAdmin && (
          <span className="text-[11px] text-slate-400">(admin — all execs visible)</span>
        )}
      </div>

      {/* Per-user month header — count, GAP sold, TFP sold. */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={`${scopeLabel} delivered (${monthLabel(activeMonth)})`} value={stats.delivered} tone="emerald" />
        <StatTile label="GAP policies sold" value={stats.gap} tone="sky" />
        <StatTile label="TrustFord Protect sold" value={stats.tfp} tone="violet" />
      </section>

      {/* Month tabs — one per month with deliveries, current month always
          appears so the user can land on it even when empty. */}
      <div className="mt-6 overflow-x-auto">
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
          {(monthKeys.includes(thisMonthKey) ? monthKeys : [thisMonthKey, ...monthKeys]).map((k) => (
            <MonthButton key={k} active={k === activeMonth} onClick={() => setActiveMonth(k)}>
              {monthLabel(k)}
            </MonthButton>
          ))}
        </nav>
      </div>

      {/* List */}
      <div className="mt-4">
        {sortedItems.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No deliveries to show for {monthLabel(activeMonth)}{scope !== "all" ? ` (${scopeLabel.toLowerCase()})` : ""}.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {sortedItems.map((it) => (
              <li key={it.id} className="p-3 sm:p-4">
                <DeliveredRow item={it} highlight={it.execId === myExecId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ScopeButton({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function MonthButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function DeliveredRow({ item, highlight }: { item: DeliveredItem; highlight: boolean }) {
  const dateLabel = item.deliveredAtIso
    ? new Date(item.deliveredAtIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const execLabel = item.isGroupBq
    ? `Group BQ${item.groupSiteName ? " · " + item.groupSiteName : ""}`
    : (item.execName ?? "—");
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link
          href={`/orders/${item.id}`}
          className={`block text-sm font-semibold ${highlight ? "text-emerald-800" : "text-slate-900"} hover:underline`}
        >
          {item.customerName}
          {item.businessName && <span className="ml-1 text-xs font-normal text-slate-500">({item.businessName})</span>}
        </Link>
        <div className="mt-0.5 text-sm text-slate-700">{item.model} {item.derivative}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {execLabel} · {item.funderName}
          {item.regNumber && <> · {item.regNumber}</>}
          {item.vin && <> · VIN {item.vin}</>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.gapSold && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">GAP sold</span>}
          {item.tfpSold && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">TFP sold</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-medium text-slate-700">{dateLabel}</div>
        <div className="text-[10px] text-slate-400">handed over</div>
      </div>
    </div>
  );
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return key;
  const now = new Date();
  if (y === now.getFullYear()) return MONTH_NAMES[m - 1];
  return `${MONTH_SHORT[m - 1]} ${y}`;
}
