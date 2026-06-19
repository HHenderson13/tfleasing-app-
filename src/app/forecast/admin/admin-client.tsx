"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ForecastPageHeader } from "../page-shell";
import { MonthPicker } from "../pickers";
import {
  setConfigAction, addConfigAction, deleteConfigAction, setActualAction,
  upsertVehicleAction, deleteVehicleAction, setVehicleBonusAction,
} from "../actions";
import { getLinesForSheet, type ForecastLine, type SheetKey } from "../line-definitions";
import { bonusesForKind, CAR_BONUSES, VAN_BONUSES, type BonusDef } from "../vehicle-bonuses";
import { classifyModel, keywordsToText, keywordsFromText, type ParsedVehicle } from "@/lib/forecast-classify";

export interface ConfigPayload {
  key: string;
  value: number;
  description: string | null;
  category: string;
}

export interface VehiclePayload {
  id: string;
  name: string;
  kind: "car" | "van";
  fuelType: "ice" | "bev";
  keywords: string[];
  sortOrder: number;
}

export interface BonusPayload {
  vehicleId: string;
  bonusKey: string;
  value: number;
}

interface Props {
  tab: "math" | "baselines" | "published" | "vehicles";
  sheet: SheetKey;
  month: string;
  config: ConfigPayload[];
  actuals: { lineKey: string; value: number }[];
  vehicles: VehiclePayload[];
  bonuses: BonusPayload[];
}

const SHEET_LABELS: Record<SheetKey, string> = {
  car: "Lease New Cars",
  cv: "Lease New Commercial",
  overheads: "General Overheads",
};

const TABS: { key: Props["tab"]; label: string; description: string }[] = [
  { key: "math",       label: "Math",               description: "Percentages, multipliers and constants the forecast and quarterly views use." },
  { key: "vehicles",   label: "Vehicles",           description: "The car / van catalogue. Keywords identify each vehicle in the dealbook CSV; bonuses set the per-vehicle rates." },
  { key: "baselines",  label: "Budget",             description: "Per-sheet, per-month budget values driving the variance column on the monthly view." },
  { key: "published",  label: "Published Accounts", description: "Final published account numbers — once entered they overwrite that month's forecast." },
];

export function AdminClient({ tab, sheet, month, config, actuals, vehicles, bonuses }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go(updates: Partial<{ tab: string; sheet: string; month: string }>) {
    const url = new URL(window.location.href);
    if (updates.tab !== undefined) url.searchParams.set("tab", updates.tab);
    if (updates.sheet !== undefined) url.searchParams.set("sheet", updates.sheet);
    if (updates.month !== undefined) url.searchParams.set("month", updates.month);
    start(() => router.push(url.pathname + "?" + url.searchParams.toString()));
  }

  return (
    <>
      <ForecastPageHeader
        title="Admin"
        description="Math config, vehicle catalogue, baseline numbers and final published accounts."
        picker={tab === "baselines" || tab === "published" ? <MonthPicker value={month} /> : undefined}
      />

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {err && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
        )}

        {/* Tabs */}
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go({ tab: t.key })}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <p className="text-xs text-slate-500">
          {TABS.find((t) => t.key === tab)?.description}
        </p>

        {tab === "math" && (
          <MathTab
            config={config}
            pending={pending}
            onError={setErr}
            onRefresh={() => router.refresh()}
          />
        )}

        {tab === "vehicles" && (
          <VehiclesTab
            vehicles={vehicles}
            bonuses={bonuses}
            pending={pending}
            onError={setErr}
            onRefresh={() => router.refresh()}
          />
        )}

        {(tab === "baselines" || tab === "published") && (
          <DataTab
            tab={tab}
            sheet={sheet}
            month={month}
            actuals={actuals}
            pending={pending}
            onError={setErr}
            onRefresh={() => router.refresh()}
            onPickSheet={(s) => go({ sheet: s })}
          />
        )}
      </main>
    </>
  );
}

// ────────────────────────── Math tab ────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  car: "Lease New Cars — per-unit costs",
  cv: "Lease New Commercial",
  overheads: "General Overheads",
  bpm: "Quarterly (BPM)",
  general: "General",
};
const CATEGORY_ORDER = ["car", "cv", "overheads", "bpm", "general"];

function MathTab({
  config, pending, onError, onRefresh,
}: {
  config: ConfigPayload[];
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const [, start] = useTransition();
  const byCat = new Map<string, ConfigPayload[]>();
  for (const c of config) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }

  function commitValue(key: string, value: number) {
    onError(null);
    start(async () => {
      const res = await setConfigAction(key, value);
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  function remove(key: string) {
    if (!confirm(`Delete config "${key}"?`)) return;
    start(async () => {
      const res = await deleteConfigAction(key);
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  return (
    <div className="space-y-6">
      <AddConfigCard pending={pending} onError={onError} onAdded={onRefresh} />

      {CATEGORY_ORDER.map((cat) => {
        const rows = byCat.get(cat);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={cat} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat] ?? cat}</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-6 py-2.5 text-left font-medium w-1/3">Key</th>
                  <th className="px-3 py-2.5 text-left font-medium">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium w-32">Value</th>
                  <th className="px-6 py-2.5 text-right font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, idx) => (
                  <tr key={c.key} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                    <td className="px-6 py-2 font-mono text-xs text-slate-700">{c.key}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{c.description ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="0.01" defaultValue={c.value} disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== c.value) commitValue(c.key, v);
                        }}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-2 text-right">
                      <button
                        type="button" disabled={pending} onClick={() => remove(c.key)}
                        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function AddConfigCard({
  pending, onError, onAdded,
}: {
  pending: boolean;
  onError: (e: string | null) => void;
  onAdded: () => void;
}) {
  const [, start] = useTransition();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-transparent px-6 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Add a new value</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          For example <code className="rounded bg-slate-100 px-1">car_dpa_pct = 2.5</code>.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          const v = Number(value);
          if (!Number.isFinite(v)) { onError("Value must be a number."); return; }
          start(async () => {
            const res = await addConfigAction({ key, value: v, description, category });
            if (!res.ok) { onError(res.error); return; }
            setKey(""); setValue(""); setDescription("");
            onAdded();
          });
        }}
        className="grid gap-3 p-6 sm:grid-cols-[1fr_2fr_1fr_120px_auto]"
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="my_new_pct"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this?"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" type="number" step="0.01"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums" />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Add</button>
      </form>
    </section>
  );
}

// ────────────────────────── Baselines / Published tab ──────────────

const SHEET_PICKER_TABS: { key: SheetKey; label: string }[] = [
  { key: "car",       label: "Lease New Cars" },
  { key: "cv",        label: "Lease New Commercial" },
  { key: "overheads", label: "General Overheads" },
];

function DataTab({
  tab, sheet, month, actuals, pending, onError, onRefresh, onPickSheet,
}: {
  tab: "baselines" | "published";
  sheet: SheetKey;
  month: string;
  actuals: { lineKey: string; value: number }[];
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
  onPickSheet: (s: SheetKey) => void;
}) {
  const [, start] = useTransition();
  const lines = getLinesForSheet(sheet);
  const byKey = new Map<string, number>();
  for (const a of actuals) byKey.set(a.lineKey, a.value);

  function commit(prefix: string, lineKey: string, value: number | null) {
    onError(null);
    start(async () => {
      const res = await setActualAction({
        monthYyyymm: month,
        sheet,
        lineKey: `${prefix}_${lineKey}`,
        value,
      });
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  // Published actuals — the user may not have all lines filled in, so we
  // also allow skipping irrelevant lines (e.g. only enter the totals).
  // Baselines view shows two columns; published shows one.

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Sheet
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {SHEET_PICKER_TABS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPickSheet(s.key)}
                className={`rounded-xl border p-3 text-left text-sm font-semibold transition ${
                  sheet === s.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-slate-200 px-5 py-2.5 text-[11px] text-slate-500">
          {tab === "baselines"
            ? "Key budget figures for each line — these drive the variance column on the monthly view."
            : "Once the official accounts publish, key the final figures here. They'll overwrite that month's forecast on the monthly + quarterly views."}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Line</th>
                <th className="px-5 py-3 text-right font-medium">
                  {tab === "baselines" ? "Budget" : "Published actual"}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.kind === "header") {
                  return (
                    <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                      <td colSpan={2} className="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                if (l.kind === "total" || l.kind === "perUnit") {
                  return (
                    <tr key={l.key} className="border-t border-slate-100 bg-slate-50/60">
                      <td className="px-5 py-2 text-slate-500 font-semibold">{l.label}</td>
                      <td className="px-5 py-2 text-right text-slate-300">auto</td>
                    </tr>
                  );
                }
                const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
                const prefix = tab === "baselines" ? "budget" : "published";
                return (
                  <tr key={l.key} className={`border-t border-slate-100 ${stripe}`}>
                    <td className="px-5 py-2 text-slate-800">{l.label}</td>
                    <ValueCell value={byKey.get(`${prefix}_${l.key}`)} kind={l.kind} pending={pending}
                      onCommit={(v) => commit(prefix, l.key, v)} padding="px-5" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        Working in <strong>{SHEET_LABELS[sheet]}</strong>. Editing here only affects {month};
        switch month with the picker above, or sheet with the buttons. Total / per-unit rows derive
        themselves on the Monthly view — you only need to key the source lines.
      </p>
    </div>
  );
}

function ValueCell({
  value, kind, pending, onCommit, padding = "px-3",
}: {
  value: number | undefined;
  kind: ForecastLine["kind"];
  pending: boolean;
  onCommit: (v: number | null) => void;
  padding?: string;
}) {
  return (
    <td className={`${padding} py-1.5 text-right`}>
      <input
        type="number"
        step={kind === "unit" ? "1" : "0.01"}
        defaultValue={value ?? ""}
        disabled={pending}
        onBlur={(e) => {
          if (e.target.value === "") {
            if (value !== undefined) onCommit(null);
          } else {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== value) onCommit(v);
          }
        }}
        className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
      />
    </td>
  );
}

// ────────────────────────── Vehicles tab ───────────────────────────

function VehiclesTab({
  vehicles, bonuses, pending, onError, onRefresh,
}: {
  vehicles: VehiclePayload[];
  bonuses: BonusPayload[];
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const cars = vehicles.filter((v) => v.kind === "car");
  const vans = vehicles.filter((v) => v.kind === "van");

  const bonusByKey = new Map<string, number>();
  for (const b of bonuses) bonusByKey.set(`${b.vehicleId}::${b.bonusKey}`, b.value);

  // Keyword overlap detection. For each vehicle's keywords, flag any
  // OTHER vehicle whose keyword is contained inside this one (or vice
  // versa). The classifier picks the longest match so this isn't a bug,
  // but it tells the admin which pairs the algorithm is relying on — so
  // they can spot a missing "PHEV" on a base "Kuga" before it bites.
  const overlaps = computeKeywordOverlaps(vehicles);

  return (
    <div className="space-y-6">
      <ClassifierTester vehicles={vehicles} />

      <AddVehicleCard pending={pending} onError={onError} onAdded={onRefresh} />

      <VehicleSection
        title="Cars"
        accent="from-sky-500 to-blue-700"
        vehicles={cars}
        bonuses={CAR_BONUSES}
        bonusByKey={bonusByKey}
        overlaps={overlaps}
        pending={pending}
        onError={onError}
        onRefresh={onRefresh}
      />
      <VehicleSection
        title="Vans"
        accent="from-emerald-500 to-teal-700"
        vehicles={vans}
        bonuses={VAN_BONUSES}
        bonusByKey={bonusByKey}
        overlaps={overlaps}
        pending={pending}
        onError={onError}
        onRefresh={onRefresh}
      />
    </div>
  );
}

// Test panel — admin pastes a Model string, sees which vehicle the
// classifier picks and which keyword scored the win. Defends against the
// "Kuga vs Kuga PHEV" double-count/no-count risk by letting the admin
// verify before uploading.
function ClassifierTester({ vehicles }: { vehicles: VehiclePayload[] }) {
  const [text, setText] = useState("");
  const parsed = useMemo<ParsedVehicle[]>(
    () => vehicles.map((v) => ({ id: v.id, name: v.name, kind: v.kind, fuelType: v.fuelType, keywords: v.keywords, sortOrder: v.sortOrder })),
    [vehicles],
  );
  const result = useMemo(() => classifyModel(text || null, parsed), [text, parsed]);

  // Show every keyword that COULD match so the admin can see which other
  // vehicles were in contention and why the winner won.
  const otherMatches = useMemo(() => {
    if (!text.trim()) return [];
    const lower = text.toLowerCase();
    const all: { vehicleName: string; keyword: string; length: number; winner: boolean }[] = [];
    for (const v of parsed) {
      for (const kw of v.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          all.push({
            vehicleName: v.name,
            keyword: kw,
            length: kw.length,
            winner: v.id === result.vehicleId && kw === result.matchedKeyword,
          });
        }
      }
    }
    return all.sort((a, b) => b.length - a.length);
  }, [text, parsed, result]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-transparent px-6 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Test the classifier</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Paste a Dealbook "Model" string to confirm it lands on the right vehicle. Longest matching
          keyword wins — that's how "Puma Gen-E" beats plain "Puma" and "Kuga PHEV" beats "Kuga".
        </p>
      </div>
      <div className="p-6 space-y-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Kuga 5 Door 2.5 Duratec 243 Phev Active Auto"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        {text.trim() && (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {result.vehicleId ? (
                <>
                  <span className="text-xs text-slate-500">Picked → </span>
                  <span className="font-semibold text-slate-900">
                    {parsed.find((v) => v.id === result.vehicleId)?.name ?? result.vehicleId}
                  </span>
                  <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
                    {result.kind}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    matched <code className="rounded bg-white px-1">{result.matchedKeyword}</code>
                  </span>
                </>
              ) : (
                <span className="font-semibold text-amber-800">No vehicle matched — would land as Unmatched.</span>
              )}
            </div>
            {otherMatches.length > 1 && (
              <div className="text-xs text-slate-500">
                <div className="mb-1 font-medium text-slate-600">Other keywords that matched (sorted longest first):</div>
                <ul className="space-y-0.5">
                  {otherMatches.map((m, i) => (
                    <li key={i} className={m.winner ? "text-emerald-700" : ""}>
                      <code className="rounded bg-slate-100 px-1">{m.keyword}</code>
                      <span className="text-slate-400"> ({m.length} chars)</span>
                      {" → "}{m.vehicleName}
                      {m.winner && <span className="ml-1 text-[10px] font-semibold text-emerald-700">WINNER</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

interface OverlapInfo {
  // For each vehicle id, a list of other vehicles whose keywords are
  // contained inside this vehicle's keywords (longer-than / superset).
  betterMatches: Map<string, { vehicleId: string; vehicleName: string; keyword: string }[]>;
}

function computeKeywordOverlaps(vehicles: VehiclePayload[]): OverlapInfo {
  const betterMatches = new Map<string, { vehicleId: string; vehicleName: string; keyword: string }[]>();
  for (const a of vehicles) {
    for (const kwA of a.keywords) {
      const la = kwA.toLowerCase();
      for (const b of vehicles) {
        if (a.id === b.id) continue;
        for (const kwB of b.keywords) {
          const lb = kwB.toLowerCase();
          // B is more specific than A: every model that matches A's
          // shorter keyword could be intercepted by B's longer one.
          if (lb.length > la.length && lb.includes(la)) {
            const arr = betterMatches.get(a.id) ?? [];
            arr.push({ vehicleId: b.id, vehicleName: b.name, keyword: kwB });
            betterMatches.set(a.id, arr);
          }
        }
      }
    }
  }
  return { betterMatches };
}

function VehicleSection({
  title, accent, vehicles, bonuses, bonusByKey, overlaps, pending, onError, onRefresh,
}: {
  title: string;
  accent: string;
  vehicles: VehiclePayload[];
  bonuses: BonusDef[];
  bonusByKey: Map<string, number>;
  overlaps: OverlapInfo;
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative border-b border-slate-200">
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Keywords match against the Dealbook "Model" column. Add the bonus rates so per-vehicle
            money math can fold them in automatically.
          </p>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-400">No {title.toLowerCase()} yet — add one above.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium w-1/5">Vehicle</th>
                <th className="px-3 py-3 text-left font-medium w-24">Powertrain</th>
                <th className="px-3 py-3 text-left font-medium">Keywords</th>
                {bonuses.map((b) => (
                  <th key={b.key} className="px-2 py-3 text-right font-medium">{b.label}</th>
                ))}
                <th className="px-5 py-3 text-right font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, idx) => (
                <VehicleRow
                  key={v.id}
                  vehicle={v}
                  bonuses={bonuses}
                  bonusByKey={bonusByKey}
                  betterMatches={overlaps.betterMatches.get(v.id) ?? []}
                  pending={pending}
                  stripe={idx % 2 === 0 ? "" : "bg-slate-50/40"}
                  onError={onError}
                  onRefresh={onRefresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VehicleRow({
  vehicle, bonuses, bonusByKey, betterMatches, pending, stripe, onError, onRefresh,
}: {
  vehicle: VehiclePayload;
  bonuses: BonusDef[];
  bonusByKey: Map<string, number>;
  betterMatches: { vehicleId: string; vehicleName: string; keyword: string }[];
  pending: boolean;
  stripe: string;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const [, start] = useTransition();

  function commitKeywords(text: string) {
    const parsed = keywordsFromText(text);
    if (parsed.join(",") === vehicle.keywords.join(",")) return;
    start(async () => {
      const res = await upsertVehicleAction({
        id: vehicle.id,
        name: vehicle.name,
        kind: vehicle.kind,
        fuelType: vehicle.fuelType,
        keywords: parsed,
        sortOrder: vehicle.sortOrder,
      });
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  function commitFuel(fuel: "ice" | "bev") {
    if (fuel === vehicle.fuelType) return;
    start(async () => {
      const res = await upsertVehicleAction({
        id: vehicle.id,
        name: vehicle.name,
        kind: vehicle.kind,
        fuelType: fuel,
        keywords: vehicle.keywords,
        sortOrder: vehicle.sortOrder,
      });
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  function commitBonus(bonusKey: string, value: number | null) {
    start(async () => {
      const res = await setVehicleBonusAction({ vehicleId: vehicle.id, bonusKey, value });
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  function remove() {
    if (!confirm(`Delete vehicle "${vehicle.name}"? Existing dealbook lines tagged to this vehicle will stay but their kind will go back to "unknown".`)) return;
    start(async () => {
      const res = await deleteVehicleAction(vehicle.id);
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  return (
    <tr className={`border-t border-slate-100 ${stripe}`}>
      <td className="px-5 py-2 align-top">
        <div className="font-semibold text-slate-900">{vehicle.name}</div>
        <div className="text-[10px] font-mono text-slate-400">{vehicle.id}</div>
        {betterMatches.length > 0 && (
          <div
            className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-200"
            title={`When a model also contains "${betterMatches.map((m) => m.keyword).join('", "')}" the classifier picks the more specific vehicle instead — which is what you want. If the more specific vehicle is missing its keyword, models will fall back here.`}
          >
            outranked by {betterMatches.map((m) => m.vehicleName).join(", ")}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[10px] font-semibold uppercase tracking-[0.1em]">
          <button
            type="button"
            onClick={() => commitFuel("ice")}
            disabled={pending}
            className={`px-2 py-1 ${vehicle.fuelType === "ice" ? "bg-amber-600 text-white" : "bg-white text-slate-500 hover:bg-amber-50"}`}
          >
            ICE
          </button>
          <button
            type="button"
            onClick={() => commitFuel("bev")}
            disabled={pending}
            className={`px-2 py-1 ${vehicle.fuelType === "bev" ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-emerald-50"}`}
          >
            BEV
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          defaultValue={keywordsToText(vehicle.keywords)}
          disabled={pending}
          onBlur={(e) => commitKeywords(e.target.value)}
          placeholder="comma, separated, model phrases"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
        />
      </td>
      {bonuses.map((b) => {
        const value = bonusByKey.get(`${vehicle.id}::${b.key}`);
        return (
          <td key={b.key} className="px-2 py-2 text-right">
            <input
              type="number"
              step="0.01"
              defaultValue={value ?? ""}
              disabled={pending}
              onBlur={(e) => {
                if (e.target.value === "") {
                  if (value !== undefined) commitBonus(b.key, null);
                } else {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== value) commitBonus(b.key, v);
                }
              }}
              className="w-20 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-right text-xs tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
            />
          </td>
        );
      })}
      <td className="px-5 py-2 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="text-[11px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function AddVehicleCard({
  pending, onError, onAdded,
}: {
  pending: boolean;
  onError: (e: string | null) => void;
  onAdded: () => void;
}) {
  const [, start] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"car" | "van">("car");
  const [fuel, setFuel] = useState<"ice" | "bev">("ice");
  const [keywords, setKeywords] = useState("");

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-transparent px-6 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Add a new vehicle</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Keywords are substrings the classifier looks for in the Dealbook "Model" column —
          more specific phrases like <code className="rounded bg-slate-100 px-1">Puma Gen-E</code>
          take priority over plain <code className="rounded bg-slate-100 px-1">Puma</code>.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          if (!name.trim()) { onError("Need a vehicle name."); return; }
          start(async () => {
            const res = await upsertVehicleAction({
              name: name.trim(),
              kind,
              fuelType: fuel,
              keywords: keywordsFromText(keywords || name),
            });
            if (!res.ok) { onError(res.error); return; }
            setName(""); setKeywords(""); setKind("car"); setFuel("ice");
            onAdded();
          });
        }}
        className="grid gap-3 p-6 sm:grid-cols-[1fr_100px_100px_2fr_auto]"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vehicle name"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select value={kind} onChange={(e) => setKind(e.target.value as "car" | "van")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="car">Car</option>
          <option value="van">Van</option>
        </select>
        <select value={fuel} onChange={(e) => setFuel(e.target.value as "ice" | "bev")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="ice">ICE</option>
          <option value="bev">BEV</option>
        </select>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Keywords (defaults to name if empty)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Add</button>
      </form>
    </section>
  );
}

void bonusesForKind; // re-exported for typing convenience
