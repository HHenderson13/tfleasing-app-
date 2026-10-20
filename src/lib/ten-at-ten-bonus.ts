// 10 at 10 — Ford's quarterly bonus, mapped onto each deal (user,
// 2026-10-20). Client-safe and pure: the page computes bonuses on the
// server, and the tabs and the admin editor share the types and wording.
//
// A bonus is paid on DELIVERY, so it follows the delivery date, never the
// order date: an October order delivering in December earns December's
// rate. A deal not yet delivered shows the bonus due at the date Dealerweb
// gives it now, and moves with it if it slips. Each month sets, for each of
// ICE Car, BEV Car, ICE Van and BEV Van, a percentage of the vehicle's Basic
// price (column BQ of the Dealbook Extract) and/or a fixed £ per unit —
// Q4 2026 is BEV Car 4.5%, both vans 2.5%, and BEV Vans £1,500 more in
// October only.
//
// The bonus is on top of Dealerweb's own Additional Bonus (2.3% of Basic on
// vans, 1.5% on ICE cars), which is already inside Invoice Profit — the user
// confirmed the quarterly scheme isn't in Dealerweb at all.
//
// The Dealbook order and delivered lists carry no Basic price, so each deal
// is matched to its line in the Dealbook Extract (matchExtract).

export const BONUS_TYPES = ["ICE Car", "BEV Car", "ICE Van", "BEV Van"] as const;
export type BonusType = (typeof BONUS_TYPES)[number];

/** A month's rate for one type: percent of Basic, plus £ per unit. */
export interface BonusRate { pct: number; amount: number }

/** Bonus rates by month: { "2026-10": { "BEV Car": { pct: 4.5, amount: 0 }, … } }. A month that's absent has no scheme set. */
export type BonusRates = Record<string, Partial<Record<BonusType, BonusRate>>>;

/**
 * Why a deal's bonus is what it is. `ok` — worked out in full. `noBasic` —
 * a percentage is due but its Basic isn't held yet (no Dealbook Extract
 * line), so only the £ part counts. `noScheme` — it delivers in a month
 * with no rates set. `noDate` — Dealerweb gives it no delivery date.
 */
export type BonusFlag = "ok" | "noBasic" | "noScheme" | "noDate";
export const BONUS_FLAGS: readonly BonusFlag[] = ["ok", "noBasic", "noScheme", "noDate"];

const BEV_VAN_MODELS = new Set(["E-Transit", "Transit E-Custom", "Transit E-Courier", "Explorer Van"]);

/**
 * ICE Car, BEV Car, ICE Van or BEV Van. Cars follow the report's segment
 * (BEV Car is the electric-only models and anything saying kWh or
 * Electric). A van is BEV when it is an electric-only model — E-Transit,
 * E-Transit Custom and Courier, Explorer Van — or its description says
 * kWh or Electric; a plug-in hybrid (Transit Custom, Ranger, Connect PHEV)
 * is an ICE Van.
 */
export function bonusTypeOf(segment: string, model: string, vehicleText: string): BonusType {
  if (segment === "Van") {
    return BEV_VAN_MODELS.has(model) || /\d\s*kwh\b|\belectric\b|\bbev\b/i.test(vehicleText) ? "BEV Van" : "ICE Van";
  }
  return segment === "BEV Car" ? "BEV Car" : "ICE Car";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The bonus one deal earns: its type's rate in the month it delivers, on its Basic. */
export function bonusFor(type: BonusType, deliveryDay: string | null, basic: number | null, rates: BonusRates): { bonus: number; flag: BonusFlag } {
  if (!deliveryDay) return { bonus: 0, flag: "noDate" };
  const month = rates[deliveryDay.slice(0, 7)];
  if (!month) return { bonus: 0, flag: "noScheme" };
  const r = month[type] ?? { pct: 0, amount: 0 };
  if (r.pct > 0 && basic == null) return { bonus: round2(r.amount), flag: "noBasic" };
  return { bonus: round2((r.pct > 0 ? (basic as number) * (r.pct / 100) : 0) + r.amount), flag: "ok" };
}

// ─── Wording, shared by the tabs and the editor ────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthShort = (ym: string) => MONTH_SHORT[Number(ym.slice(5, 7)) - 1] ?? ym;

const pctText = (n: number) => `${Number(n.toFixed(2))}%`;
const gbpText = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** "4.5% of Basic", "2.5% of Basic + £1,500", "£500", "nothing". */
export function rateText(r: BonusRate | undefined): string {
  if (!r || (r.pct <= 0 && r.amount <= 0)) return "nothing";
  return [r.pct > 0 ? `${pctText(r.pct)} of Basic` : "", r.amount > 0 ? gbpText(r.amount) : ""].filter(Boolean).join(" + ");
}

/**
 * One type's rates across some months, as briefly as it can be said:
 * "2.5% of Basic" when every month agrees, else month by month — "Oct 2.5%
 * of Basic + £1,500 · Nov–Dec 2.5% of Basic". Months with no scheme say so.
 */
export function ratesText(type: BonusType, months: readonly string[], rates: BonusRates): string {
  const sorted = [...new Set(months)].sort();
  if (sorted.length === 0) return "";
  const text = (m: string) => (rates[m] ? rateText(rates[m][type]) : "no scheme set");
  const runs: { from: string; to: string; text: string }[] = [];
  for (const m of sorted) {
    const t = text(m);
    const last = runs[runs.length - 1];
    if (last && last.text === t) last.to = m; else runs.push({ from: m, to: m, text: t });
  }
  if (runs.length === 1) return runs[0].text;
  return runs.map((r) => `${r.from === r.to ? monthShort(r.from) : `${monthShort(r.from)}–${monthShort(r.to)}`} ${r.text}`).join(" · ");
}

// ─── Matching a deal to its Dealbook Extract line ──────────────────────────
//
// The extract is the same Dealerweb report as the delivered list with more
// columns, but it names things differently: the exec in full ("Minny
// Hope-Lindley", not MiHo), the contact rather than the account ("Mr Pedro
// Condez", not "Pedro Condez T/A P D Carpentry"), and the vehicle as range
// then derivative ("Explorer Explorer 210kW 79kWh Style"). Delivery dates
// and profit move between downloads, so neither can be the key.
//
// A deal and an extract line are the same vehicle when they were ordered on
// the same day, their descriptions agree, and at least one of the exec,
// the registration or the customer agrees too. Every pairing is scored and
// the best taken first, one to one, so two Explorers ordered the same day
// by the same exec each find their own line. On the 19 and 20 Oct 2026
// files every line matched that was in both.

export interface ExtractMatchLine {
  id: string;
  orderDay: string;
  /** The exec in full, as the extract names them. */
  execName: string;
  customer: string;
  vehicle: string;
  registration: string | null;
  profit: number | null;
}

export interface DealMatchLine {
  id: string;
  orderDay: string;
  /** The Dealbook's exec code (MiHo). */
  exec: string;
  customer: string;
  vehicle: string;
  registration: string | null;
  profit: number | null;
}

/** Words that describe the listing, not the vehicle: doors, seats, Dealerweb's stray characters, plates and stock numbers. */
function vehicleTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of s.toLowerCase().split(/[^a-z0-9.]+/)) {
    const w = t.replace(/^\.+|\.+$/g, "");
    if (w.length < 2 || w === "door" || w === "seat" || w === "doors" || w === "seats") continue;
    if (/^[a-z]{2}\d{2}[a-z]{3}$/.test(w) || /^[a-z]\d{4}$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

/** How alike two descriptions are, 0 to 1 (Dice over their words). */
export function vehicleSimilarity(a: string, b: string): number {
  const A = vehicleTokens(a), B = vehicleTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return (2 * shared) / (A.size + B.size);
}

const personKey = (s: string) => s.toLowerCase().replace(/^\s*(mr|mrs|ms|miss|mx|dr)\.?\s+/, "").replace(/[^a-z0-9]/g, "");

/** The same customer: equal names, or one inside the other ("Pedro Condez" in "Pedro Condez T/A P D Carpentry"). */
function sameCustomer(a: string, b: string): boolean {
  const x = personKey(a), y = personKey(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)));
}

const MIN_SIMILARITY = 0.5;

/**
 * Pair each deal with its extract line, one to one. `execCodesOf` turns
 * the extract's full name into the Dealbook codes it may appear under.
 * Returns deal id → extract line id.
 */
export function matchExtract(deals: readonly DealMatchLine[], extract: readonly ExtractMatchLine[], execCodesOf: (name: string) => string[]): Map<string, string> {
  const byDay = new Map<string, ExtractMatchLine[]>();
  for (const e of extract) {
    const list = byDay.get(e.orderDay);
    if (list) list.push(e); else byDay.set(e.orderDay, [e]);
  }
  const codes = new Map<string, Set<string>>();
  const codesOf = (name: string) => {
    let c = codes.get(name);
    if (!c) { c = new Set(execCodesOf(name).map((x) => x.toLowerCase())); codes.set(name, c); }
    return c;
  };

  const pairs: { deal: string; line: string; score: number }[] = [];
  for (const d of deals) {
    for (const e of byDay.get(d.orderDay) ?? []) {
      const sim = vehicleSimilarity(d.vehicle, e.vehicle);
      if (sim < MIN_SIMILARITY) continue;
      const exec = codesOf(e.execName).has(d.exec.toLowerCase());
      const plate = d.registration != null && d.registration === e.registration;
      const customer = sameCustomer(d.customer, e.customer);
      if (!exec && !plate && !customer) continue;
      const profit = d.profit != null && e.profit != null && Math.abs(d.profit - e.profit) < 0.01;
      pairs.push({ deal: d.id, line: e.id, score: (plate ? 2 : 0) + (exec ? 1 : 0) + (customer ? 1 : 0) + (profit ? 0.5 : 0) + sim });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.deal.localeCompare(b.deal) || a.line.localeCompare(b.line));
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.deal) || taken.has(p.line)) continue;
    out.set(p.deal, p.line);
    taken.add(p.line);
  }
  return out;
}
