// Market Analysis (/scraper): turns scraped leasing.com listings into
// like-for-like comparison SLOTS — one exact vehicle on one exact payment
// profile — holding at most one offer per broker.
//
// Every figure on the Intelligence tab is built from slots, so a slot that
// mixes two vehicles misprices everything above it. That is what happened on
// vans, which showed a broker four times in one slot:
//
//  1. The same deal was stored twice. leasing.com returns every PHEV Transit
//     Custom under BOTH fuel=Petrol and fuel=Plugin+Hybrid, so a run listing
//     both URLs saves each of those deals twice (1,738 of them in the 7 Oct
//     2026 run). `dedupeListings` drops the repeat by deal id.
//  2. The slot ignored `model`. On a van the model is the wheelbase and
//     weight ("Transit Custom 320 L1" vs "320 L2") and the derivative text is
//     shared across them: 86 of 136 van derivatives appear under more than
//     one model. Keyed on derivative alone, an L1 and an L2 were one slot,
//     so each broker appeared once per wheelbase, and TF's price was an
//     average across vans that are not the same vehicle.
//
// Cars were unaffected (their model never varies under one derivative),
// which is why the fault only showed on the van side.

export type Segment = "car" | "van";

// The fields the analysis reads. Matches the slim /api/scraper/results row.
export interface Listing {
  id: number;
  segment?: Segment | null;
  range?: string | null;
  model?: string | null;
  derivative?: string | null;
  contractLengthMonths?: number | null;
  annualMileage?: number | null;
  depositMonths?: number | null;
  financeType?: string | null;
  monthlyPriceGbp?: number | null;
  initialRentalGbp?: number | null;
  totalLeaseCostGbp?: number | null;
  brokerDealerName?: string | null;
  advertiserCategory?: string | null;
  inStock?: string | null;
  dealIdentifier?: string | null;
}

const TF_NAMES = ["trustford", "trustford transit centre"];

export function isTrustFord(name?: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return TF_NAMES.some((n) => lower.includes(n));
}

// leasing.com serves cars and vans from separate searches, and the URL a
// listing was scraped from says which. The range cannot: "Explorer" is both a
// car (Explorer Estate, Personal) and a van (Explorer Electric, Business).
// Without a URL (a hand-made CSV), fall back to the body style, which on every
// van in the feed names a van body.
const VAN_BODY = /\bvan\b|bus\b|pick-?up|chassis|tipper|luton|dropside/i;

export function segmentOf(sourceUrl?: string | null, bodyStyle?: string | null): Segment {
  const url = (sourceUrl ?? "").toLowerCase();
  if (url.includes("/van-leasing/")) return "van";
  if (url.includes("/car-leasing/")) return "car";
  return VAN_BODY.test(bodyStyle ?? "") ? "van" : "car";
}

function k(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// The range as TF talks about it, which is not always leasing.com's:
//  • A van filed under a car's range is the van version. leasing.com puts
//    the Explorer Electric van under "Explorer", beside the Explorer car; it
//    reads as "Explorer Van" here, the name the stock list already uses.
//  • Electric vans are their own range. leasing.com files the E-Transit
//    Custom under "Transit Custom", where 3,174 EV listings at EV prices sat
//    inside the diesel/PHEV card (7 Oct 2026 run). Same for E-Transit Courier.
// Range names feed every slot key, so this must stay stable from run to run
// for Trends to line up.
const COMMERCIAL_RANGE = /transit|ranger|tourneo|\bvan\b/i;

export function rangeOf(r: Pick<Listing, "range" | "model" | "segment">): string {
  const range = k(r.range) || "Unknown";
  if (r.segment !== "van") return range;
  if (k(r.model).toLowerCase().startsWith(`e-${range.toLowerCase()}`)) return `E-${range}`;
  return COMMERCIAL_RANGE.test(range) ? range : `${range} Van`;
}

// The payment profile: everything that changes the price of one vehicle.
function profileParts(r: Listing): string[] {
  return [k(r.contractLengthMonths), k(r.annualMileage), k(r.depositMonths), k(r.financeType)];
}

// Same deal on the same profile is the same listing, however many search URLs
// returned it. A row with no deal id is never merged: two blanks are not
// evidence of one deal.
export function dedupeListings<T extends Listing>(rows: T[]): { rows: T[]; removed: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const id = k(r.dealIdentifier);
    if (id) {
      const key = [id, ...profileParts(r)].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(r);
  }
  return { rows: out, removed: rows.length - out.length };
}

export function vehicleKeyOf(r: Pick<Listing, "model" | "derivative">): string {
  return `${k(r.model)}||${k(r.derivative)}`;
}

export function slotKeyOf(r: Listing): string {
  return [r.segment ?? "", rangeOf(r), vehicleKeyOf(r), ...profileParts(r)].join("||");
}

export interface Offer {
  broker: string;
  category: string | null;
  monthly: number;
  initial: number | null;
  total: number | null;
  inStock: string | null;
  isTF: boolean;
  // How many listings this broker had in the slot. Usually 1. Some brokers
  // list one vehicle twice on the same profile — Rivervale posts two prices,
  // Select an in-stock and a factory-order version — and nothing scraped
  // tells the two apart, so the cheapest stands for the broker and this
  // records that there were others.
  listings: number;
}

export interface Slot {
  key: string;
  segment: Segment;
  range: string;
  model: string;
  derivative: string;
  vehicleKey: string;
  term: string;
  mileage: string;
  upfront: string;
  finance: string;
  offers: Offer[];      // one per broker, cheapest first
  tf: Offer | null;     // TF's cheapest
  best: Offer | null;   // cheapest competitor
  gap: number | null;   // tf - best, £/mo. Positive = we are dearer.
  rank: number | null;  // TF's place among sellers; competitors strictly cheaper + 1
  sellers: number;      // competitors, plus TF if listed
}

function price(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}

export function buildSlots(rows: Listing[]): Slot[] {
  const groups = new Map<string, { first: Listing; byBroker: Map<string, Offer> }>();

  for (const r of rows) {
    const monthly = price(r.monthlyPriceGbp);
    if (monthly === null) continue;
    const key = slotKeyOf(r);
    let g = groups.get(key);
    if (!g) {
      g = { first: r, byBroker: new Map() };
      groups.set(key, g);
    }
    const broker = k(r.brokerDealerName) || "Unknown";
    const prev = g.byBroker.get(broker);
    if (prev && prev.monthly <= monthly) {
      prev.listings += 1;
      continue;
    }
    g.byBroker.set(broker, {
      broker,
      category: r.advertiserCategory ?? null,
      monthly,
      initial: price(r.initialRentalGbp),
      total: price(r.totalLeaseCostGbp),
      inStock: r.inStock ?? null,
      isTF: isTrustFord(broker),
      listings: (prev?.listings ?? 0) + 1,
    });
  }

  const slots: Slot[] = [];
  for (const [key, { first, byBroker }] of groups) {
    const offers = [...byBroker.values()].sort((a, b) => a.monthly - b.monthly);
    const tf = offers.find((o) => o.isTF) ?? null;
    const competitors = offers.filter((o) => !o.isTF);
    const best = competitors[0] ?? null;
    slots.push({
      key,
      segment: first.segment ?? "car",
      range: rangeOf(first),
      model: k(first.model),
      derivative: k(first.derivative),
      vehicleKey: vehicleKeyOf(first),
      term: k(first.contractLengthMonths),
      mileage: k(first.annualMileage),
      upfront: k(first.depositMonths),
      finance: k(first.financeType),
      offers,
      tf,
      best,
      gap: tf && best ? tf.monthly - best.monthly : null,
      rank: tf ? competitors.filter((o) => o.monthly < tf.monthly).length + 1 : null,
      sellers: competitors.length + (tf ? 1 : 0),
    });
  }
  return slots;
}

export interface GapSummary {
  compared: number;       // slots where TF and at least one competitor are priced
  cheapest: number;       // of those, slots where nobody undercuts TF
  tfAvg: number | null;
  mktAvg: number | null;  // mean of the cheapest competitor price
  gap: number | null;     // mean of tf - best
}

export function summarise(slots: Slot[]): GapSummary {
  let compared = 0, cheapest = 0, tfSum = 0, mktSum = 0;
  for (const s of slots) {
    if (!s.tf || !s.best) continue;
    compared++;
    tfSum += s.tf.monthly;
    mktSum += s.best.monthly;
    if (s.rank === 1) cheapest++;
  }
  if (compared === 0) return { compared, cheapest, tfAvg: null, mktAvg: null, gap: null };
  return {
    compared,
    cheapest,
    tfAvg: tfSum / compared,
    mktAvg: mktSum / compared,
    gap: (tfSum - mktSum) / compared,
  };
}

export function groupBy<T>(items: T[], keyOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const key = keyOf(it);
    const list = m.get(key);
    if (list) list.push(it);
    else m.set(key, [it]);
  }
  return m;
}

// Distinct values, numerically ordered: 18/24/36/48 months, 5k…30k miles.
// Read from the data rather than hard-coded, so an 18-month or 60-month run
// is not silently left out of every column.
export function distinctNumeric(slots: Slot[], pick: (s: Slot) => string): string[] {
  return [...new Set(slots.map(pick).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
}

export interface CompetitorRow {
  broker: string;
  category: string | null;
  headToHead: number;           // slots where they and TF are both priced
  undercuts: number;            // of those, slots where they are cheaper than TF
  avgUndercut: number | null;   // mean £/mo by which they undercut, over `undercuts`
}

// Who is cheaper than us, and how often. Only head-to-head slots count:
// a broker pricing vehicles we don't list isn't beating us on them.
export function competitorTable(slots: Slot[]): CompetitorRow[] {
  const rows = new Map<string, CompetitorRow & { undercutSum: number }>();
  for (const s of slots) {
    if (!s.tf) continue;
    for (const o of s.offers) {
      if (o.isTF) continue;
      let row = rows.get(o.broker);
      if (!row) {
        row = { broker: o.broker, category: o.category, headToHead: 0, undercuts: 0, avgUndercut: null, undercutSum: 0 };
        rows.set(o.broker, row);
      }
      row.headToHead++;
      if (o.monthly < s.tf.monthly) {
        row.undercuts++;
        row.undercutSum += s.tf.monthly - o.monthly;
      }
    }
  }
  return [...rows.values()]
    .map(({ undercutSum, ...r }) => ({ ...r, avgUndercut: r.undercuts ? undercutSum / r.undercuts : null }))
    .sort((a, b) => b.undercuts - a.undercuts || b.headToHead - a.headToHead);
}

export interface VehicleRow {
  vehicleKey: string;
  segment: Segment;
  range: string;
  model: string;
  derivative: string;
  summary: GapSummary;
  tfListed: boolean;
}

export function vehicleTable(slots: Slot[]): VehicleRow[] {
  const out: VehicleRow[] = [];
  for (const vs of groupBy(slots, (s) => `${s.range}||${s.vehicleKey}`).values()) {
    const f = vs[0];
    out.push({
      vehicleKey: f.vehicleKey,
      segment: f.segment,
      range: f.range,
      model: f.model,
      derivative: f.derivative,
      summary: summarise(vs),
      tfListed: vs.some((s) => s.tf !== null),
    });
  }
  return out;
}

// HEADLINE PRICE. Like-for-like is how we price; it is not how a customer
// shops. On leasing.com they see each broker's cheapest monthly for the
// vehicle, at whatever term makes it lowest, before they ever line terms up.
// A rival who is very cheap on 24 months can take the enquiry even where we
// are cheapest like-for-like on 36 and 48.
//
// So a headline compares, per vehicle and mileage (upfront and finance too,
// which the customer has already chosen), OUR lowest monthly at any term with
// the lowest ANY rival offers at any term. `masked` is the case that matters
// most: we win at least one term like-for-like, so every term-by-term view
// says we're fine, and a rival's headline still undercuts ours.

export interface HeadlineOffer {
  monthly: number;
  term: string;
  broker: string;
}

export interface Headline {
  key: string;
  segment: Segment;
  range: string;
  model: string;
  derivative: string;
  vehicleKey: string;
  mileage: string;
  upfront: string;
  finance: string;
  tf: HeadlineOffer | null;     // our cheapest at any term
  rival: HeadlineOffer | null;  // the cheapest any rival offers at any term
  gap: number | null;           // tf - rival. Positive = beaten on headline.
  termsWon: string[];           // terms where we are cheapest like-for-like
  masked: boolean;              // win a term like-for-like, lose the headline
  // The sharpest form: our best price WINS its own term, and is still beaten
  // by a rival's price on another term ("they're mega cheap on 2 years,
  // cheaper than our 3 and 4"). No term-by-term view can show it, because
  // the two prices never sit in the same column.
  crossTerm: boolean;
}

function cheaper(cur: HeadlineOffer | null, o: Offer, term: string): HeadlineOffer {
  return cur && cur.monthly <= o.monthly ? cur : { monthly: o.monthly, term, broker: o.broker };
}

export function buildHeadlines(slots: Slot[]): Headline[] {
  const out: Headline[] = [];
  const groups = groupBy(slots, (s) =>
    [s.segment, s.range, s.vehicleKey, s.mileage, s.upfront, s.finance].join("||")
  );
  for (const [key, ss] of groups) {
    let tf: HeadlineOffer | null = null;
    let rival: HeadlineOffer | null = null;
    const termsWon: string[] = [];
    for (const s of ss) {
      if (s.tf) tf = cheaper(tf, s.tf, s.term);
      if (s.best) rival = cheaper(rival, s.best, s.term);
      if (s.tf && s.best && s.rank === 1) termsWon.push(s.term);
    }
    termsWon.sort((a, b) => Number(a) - Number(b));
    const gap = tf && rival ? tf.monthly - rival.monthly : null;
    const f = ss[0];
    out.push({
      key,
      segment: f.segment,
      range: f.range,
      model: f.model,
      derivative: f.derivative,
      vehicleKey: f.vehicleKey,
      mileage: f.mileage,
      upfront: f.upfront,
      finance: f.finance,
      tf,
      rival,
      gap,
      termsWon,
      masked: gap !== null && gap > 0 && termsWon.length > 0,
      crossTerm: gap !== null && gap > 0 && !!tf && termsWon.includes(tf.term),
    });
  }
  return out;
}

export interface HeadlineSummary {
  compared: number;       // headlines where we and a rival are both priced
  lowest: number;         // of those, where nobody's headline is below ours
  masked: number;         // of those, beaten on headline while winning a term
  crossTerm: number;      // of those, our best price wins its term and still loses
  tfAvg: number | null;
  rivalAvg: number | null;
  gap: number | null;
}

export function summariseHeadlines(hs: Headline[]): HeadlineSummary {
  let compared = 0, lowest = 0, masked = 0, crossTerm = 0, tfSum = 0, rivalSum = 0;
  for (const h of hs) {
    if (!h.tf || !h.rival) continue;
    compared++;
    tfSum += h.tf.monthly;
    rivalSum += h.rival.monthly;
    if (h.gap! <= 0) lowest++;
    if (h.masked) masked++;
    if (h.crossTerm) crossTerm++;
  }
  if (compared === 0) return { compared, lowest, masked, crossTerm, tfAvg: null, rivalAvg: null, gap: null };
  return {
    compared,
    lowest,
    masked,
    crossTerm,
    tfAvg: tfSum / compared,
    rivalAvg: rivalSum / compared,
    gap: (tfSum - rivalSum) / compared,
  };
}
