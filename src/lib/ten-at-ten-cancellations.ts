// 10 at 10 — the Dealerweb Cancelled Orders export, and telling a proper
// cancellation from a Re-Write.
//
// Pure, like ten-at-ten-orders.ts. The export is an "ag-grid" sheet:
//   A Sales Executive (full name, not a code) · B Order Date ("27 May 2026
//   16:35") · C Customer (sometimes led by an account code: "E0795 Mr James
//   Robinson") · D Type · E Model (the model, then the derivative, which
//   repeats it: "Transit Custom Transit Custom 280L1 …") · F Registration
//   Number ("TACTICALMP26VWA") · G Cancelled Date ("9 October 2026 16:45")
//
// A Re-Write is an order put on wrong, cancelled, and ordered again — the
// wrong customer name, the wrong spec. It is shown but never reported as a
// cancellation (user, 2026-10-12). matchCancellations finds the re-order
// in the Dealbook.

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { dayKey, parseExportTimestamp } from "./business-hours";
import { execCodeFromName } from "./sales-leaderboard";
import { isExcludedExec, vehicleOf } from "./ten-at-ten";

export { execCodeFromName };
import { cancelledHeaderFound, cleanVehicle, exportedAtOf, isCancelledOrdersHeader, plateOf, segmentOf } from "./ten-at-ten-orders";
import type { CreditedReOrder, Segment } from "./ten-at-ten-report";

const COL = { exec: 0, orderDate: 1, customer: 2, type: 3, model: 4, registration: 5, cancelledDate: 6 } as const;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

// ─── Fields ────────────────────────────────────────────────────────────────

/** The customer without the account code some lines start with ("G1202 HFS Tarporley LTD"). */
export function cleanCustomer(raw: unknown): string {
  return norm(raw).replace(/^[A-Z]\d{3,5}\s+/, "");
}

/**
 * The customer as the two reports can be matched on: no account code, no
 * title, no case or punctuation. This export says "Mr Steven Braine" where
 * the order list says "Steven Braine".
 */
export function customerKey(raw: unknown): string {
  return cleanCustomer(raw).toLowerCase().replace(/^(mr|mrs|ms|miss|mx|dr)\.?\s+/, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Column E rebuilt the way the order list writes a vehicle — model, then the
 * rest of the derivative — so it reads and groups like every other tab.
 * "Transit Custom Double Cab In Transit Custom 320L2 Doublecab Van …"
 * becomes "Transit Custom Double Cab In 320L2 Doublecab Van …". The
 * derivative starts where the model's first word comes round again.
 */
export function cancelledVehicle(raw: unknown): string {
  const words = norm(raw).split(" ").filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0].toLowerCase();
  const k = words.findIndex((w, i) => i > 0 && w.toLowerCase() === first);
  if (k < 0) return cleanVehicle(words.join(" "));
  const model = words.slice(0, k);
  let rest = words.slice(k);
  let same = 0;
  while (same < rest.length && same < model.length && rest[same].toLowerCase() === model[same].toLowerCase()) same++;
  rest = rest.slice(same);
  return cleanVehicle([...model, ...rest].join(" "));
}


/**
 * Order time + customer + vehicle, plus the occurrence within the file —
 * three vans ordered for one customer in the same minute stay three. Not
 * the registration (a plate can be assigned after the order) nor the exec.
 * Notes and a manager's Re-Write call hang off this key, so it must not
 * change between uploads of the same line.
 */
export function makeCancellationKey(orderedAt: number, customer: string, vehicle: string, occurrence: number): string {
  return createHash("sha1")
    .update(`cancel|${orderedAt}|${customerKey(customer)}|${vehicle.toLowerCase()}|${occurrence}`)
    .digest("hex")
    .slice(0, 20);
}

// ─── Parse ─────────────────────────────────────────────────────────────────

export interface TenAtTenCancellation {
  id: string;
  /** Full name, as the export gives it. */
  exec: string;
  orderedAt: number;
  orderDay: string;
  cancelledAt: number;
  cancelledDay: string;
  customer: string;
  saleType: string | null;
  vehicleRaw: string;
  model: string;
  derivative: string | null;
  derivativeKey: string | null;
  segment: Segment;
  registration: string | null;
}

export interface CancellationParse {
  rows: TenAtTenCancellation[];
  rowsInFile: number;
  skippedExcluded: number;
  skippedUnreadable: number;
  excludedIds: string[];
  exportedAt: number | null;
}

export class NotACancelledOrdersError extends Error {
  constructor(found: string) {
    super(`That isn't the Dealerweb Cancelled Orders export — its columns are laid out differently (found ${found}).`);
    this.name = "NotACancelledOrdersError";
  }
}

export function parseCancellationsWorkbook(buf: ArrayBuffer | Buffer): CancellationParse {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.includes("ag-grid") ? "ag-grid" : wb.SheetNames[0]];
  const out: CancellationParse = { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnreadable: 0, excludedIds: [], exportedAt: exportedAtOf(wb) };
  if (!ws) return out;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  const header = Array.isArray(grid[0]) ? grid[0] : [];
  if (!isCancelledOrdersHeader(header)) throw new NotACancelledOrdersError(cancelledHeaderFound(header));

  const seen = new Map<string, number>();
  for (const raw of grid.slice(1)) {
    if (!Array.isArray(raw) || raw.every((v) => v == null || norm(v) === "")) continue;
    out.rowsInFile++;
    const exec = norm(raw[COL.exec]);
    const customer = cleanCustomer(raw[COL.customer]);
    const orderedAt = parseExportTimestamp(raw[COL.orderDate]);
    const cancelledAt = parseExportTimestamp(raw[COL.cancelledDate]);
    const vehicleRaw = cancelledVehicle(raw[COL.model]);
    if (!exec || !customer || orderedAt == null || cancelledAt == null) { out.skippedUnreadable++; continue; }

    const base = `${orderedAt}|${customerKey(customer)}|${vehicleRaw.toLowerCase()}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const id = makeCancellationKey(orderedAt, customer, vehicleRaw, occurrence);

    // HaHe and JoRu are stripped from 10 at 10; here they arrive as names.
    if (isExcludedExec(execCodeFromName(exec))) { out.skippedExcluded++; out.excludedIds.push(id); continue; }

    const { model, derivative, derivativeKey } = vehicleOf(vehicleRaw);
    out.rows.push({
      id,
      exec,
      orderedAt,
      orderDay: dayKey(orderedAt),
      cancelledAt,
      cancelledDay: dayKey(cancelledAt),
      customer,
      saleType: norm(raw[COL.type]) || null,
      vehicleRaw,
      model,
      derivative,
      derivativeKey,
      segment: segmentOf(model, vehicleRaw),
      registration: plateOf(raw[COL.registration]),
    });
  }
  return out;
}

// ─── Re-Write or cancellation? ─────────────────────────────────────────────
//
// Dealerweb's order list drops a cancelled order, but our store merges line
// by line and never forgets one: an order uploaded before it was cancelled
// is still held. So each Dealbook line carries `seenAt` — when the latest
// export listing it was taken — and that settles which is which:
//
//   • The ORIGINAL — the order that was cancelled. A held line on the same
//     order day, for the same vehicle, last seen BEFORE the cancellation.
//     It is kept out of Orders, as Dealerweb itself now does.
//   • The RE-ORDER — the same vehicle ordered again: a later order day, or
//     the same day but still listed after the cancellation (Omnia, 9 Oct
//     2026: ordered 11:38, cancelled 12:07, re-ordered that afternoon).
//
// "The same vehicle" is either
//   • the same registration, by the same exec or for the same customer —
//     a Re-Write often changes the customer (Mr Steven Braine's three vans
//     re-ordered under DEA Gate Automation), but a plate that moves to
//     another exec's customer is stock being reallocated, not a Re-Write; or
//   • the same customer and model — re-ordered before a plate was assigned,
//     or with the spec corrected (HFS Tarporley: 150 Sport to 136 Limited).
// A re-order must land within REWRITE_WINDOW_DAYS of the cancellation, and
// each order answers for one cancellation only, so three cancelled vans
// and one re-order are one Re-Write and two cancellations.

export const REWRITE_WINDOW_DAYS = 30;

/** A Dealbook line (order list or delivered list) as the matcher needs it. */
export interface DealbookLine {
  id: string;
  source: "orders" | "deliveries";
  orderDay: string;
  /** Exec code, as the Dealbook gives it. */
  exec: string;
  customer: string;
  model: string;
  vehicleRaw: string;
  registration: string | null;
  /** Wall clock of the latest export known to list this line. */
  seenAt: number;
  profit: number | null;
}

export type CancellationStatus = "rewrite" | "proper";

export interface ReOrder {
  orderDay: string;
  customer: string;
  vehicle: string;
  registration: string | null;
  exec: string;
  /** What tied it to the cancellation. */
  on: "registration" | "customer";
}

export interface CancellationMatch {
  status: CancellationStatus;
  /** The held order line that was cancelled, if we hold it. */
  originalId: string | null;
  originalProfit: number | null;
  reorder: ReOrder | null;
  /** The Dealbook line that is the re-order. */
  reorderId: string | null;
}

type CancelLike = Pick<TenAtTenCancellation, "id" | "exec" | "orderDay" | "cancelledAt" | "cancelledDay" | "customer" | "model" | "registration">;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * The order list and the delivered list are the same Dealbook report, so one
 * order can be held in both. Delivered-list lines are only added where they
 * hold more of a vehicle than the order list does — a re-order delivered
 * this month whose order month was never uploaded is still found, and an
 * order held twice can't answer for two cancellations.
 */
/**
 * Held order-list lines that the latest order list for their month no
 * longer carries. Dealerweb's order list is the whole month to date, and
 * every line of one export carries its time, so a line last seen before the
 * month's latest export has gone from Dealerweb: cancelled, or the same
 * order under a description Dealerweb has since changed. The order key
 * includes the description, so a change stores the deal again — DEA Gate's
 * three vans gained a trailing "10" on 14 Oct 2026 and Martin Dowey's Capri
 * its registration on 16 Oct, and each was held, and counted, twice.
 * Delivered-list lines are left alone: each deliveries upload syncs its month.
 */
export function staleOrderIds(lines: readonly Pick<DealbookLine, "id" | "source" | "orderDay" | "seenAt">[]): Set<string> {
  const latest = new Map<string, number>();
  for (const l of lines) {
    if (l.source !== "orders") continue;
    const m = l.orderDay.slice(0, 7);
    latest.set(m, Math.max(latest.get(m) ?? -Infinity, l.seenAt));
  }
  return new Set(lines.filter((l) => l.source === "orders" && l.seenAt < latest.get(l.orderDay.slice(0, 7))!).map((l) => l.id));
}

export function mergeDealbookLines(orders: DealbookLine[], deliveries: DealbookLine[]): DealbookLine[] {
  const keyOf = (l: DealbookLine) => `${l.orderDay}|${customerKey(l.customer)}|${l.vehicleRaw.toLowerCase()}|${l.registration ?? ""}`;
  const held = new Map<string, number>();
  for (const l of orders) held.set(keyOf(l), (held.get(keyOf(l)) ?? 0) + 1);
  const extra: DealbookLine[] = [];
  for (const l of deliveries) {
    const k = keyOf(l);
    const n = held.get(k) ?? 0;
    if (n > 0) held.set(k, n - 1);
    else extra.push(l);
  }
  return [...orders, ...extra];
}

/**
 * Classify every cancellation and find the held order lines that were
 * cancelled. `execCodesOf` turns the export's full name into the codes the
 * Dealbook uses for that person.
 */
export function matchCancellations(
  cancels: readonly CancelLike[],
  lines: readonly DealbookLine[],
  execCodesOf: (name: string) => string[] = (n) => [execCodeFromName(n)],
): { matches: Map<string, CancellationMatch>; originalIds: Set<string> } {
  const used = new Set<string>();
  const matches = new Map<string, CancellationMatch>();
  const order = [...cancels].sort((a, b) => a.cancelledAt - b.cancelledAt || a.id.localeCompare(b.id));
  for (const c of order) matches.set(c.id, { status: "proper", originalId: null, originalProfit: null, reorder: null, reorderId: null });

  const ck = new Map(order.map((c) => [c.id, customerKey(c.customer)]));
  const codes = new Map(order.map((c) => [c.id, new Set(execCodesOf(c.exec).map((x) => x.toLowerCase()).filter(Boolean))]));
  const samePlate = (c: CancelLike, l: DealbookLine) => !!c.registration && c.registration === l.registration;
  const sameCustomer = (c: CancelLike, l: DealbookLine) => ck.get(c.id) === customerKey(l.customer);
  const sameExec = (c: CancelLike, l: DealbookLine) => codes.get(c.id)!.has(l.exec.toLowerCase());

  // Which test a pass uses: registration first, so a cancellation matched
  // only by customer can't take a line another one matches by its plate.
  const tests: [ReOrder["on"], (c: CancelLike, l: DealbookLine) => boolean][] = [
    ["registration", (c, l) => samePlate(c, l) && (sameExec(c, l) || sameCustomer(c, l))],
    ["customer", (c, l) => sameCustomer(c, l) && c.model === l.model],
  ];

  // The originals: the cancelled orders we still hold.
  for (const [, test] of tests) {
    for (const c of order) {
      const m = matches.get(c.id)!;
      if (m.originalId) continue;
      const hit = lines.find((l) => l.source === "orders" && !used.has(l.id)
        && l.orderDay === c.orderDay && l.seenAt < c.cancelledAt && test(c, l));
      if (hit) { used.add(hit.id); m.originalId = hit.id; m.originalProfit = hit.profit; }
    }
  }

  // The re-orders, nearest the cancellation first — only from what Dealerweb
  // still lists, so an old copy of an order never stands in for the live one.
  const stale = staleOrderIds(lines);
  const latest = (c: CancelLike) => addDays(c.cancelledDay, REWRITE_WINDOW_DAYS);
  for (const [on, test] of tests) {
    for (const c of order) {
      const m = matches.get(c.id)!;
      if (m.reorder) continue;
      const hit = lines
        .filter((l) => !used.has(l.id) && !stale.has(l.id) && l.orderDay <= latest(c)
          && (l.orderDay > c.orderDay || (l.orderDay === c.orderDay && l.seenAt >= c.cancelledAt)) && test(c, l))
        .sort((a, b) => dayGap(a.orderDay, c.cancelledDay) - dayGap(b.orderDay, c.cancelledDay) || a.id.localeCompare(b.id))[0];
      if (!hit) continue;
      used.add(hit.id);
      m.status = "rewrite";
      m.reorderId = hit.id;
      m.reorder = { orderDay: hit.orderDay, customer: hit.customer, vehicle: hit.vehicleRaw, registration: hit.registration, exec: hit.exec, on };
    }
  }

  const originalIds = new Set([...matches.values()].map((m) => m.originalId).filter((x): x is string => !!x));
  return { matches, originalIds };
}

// ─── Order Take ────────────────────────────────────────────────────────────
//
// A Re-Write is admin putting a deal right, not a new sale (user,
// 2026-10-16): it is credited once, in the month the deal was first ordered,
// never again in the month it was keyed again — or an exec whose deals keep
// needing re-keying would show an inflated Order Take. Braine's three vans,
// ordered 29 Sep and re-ordered under DEA Gate Automation on 9 Oct, are
// three September orders, not three October ones too.

/**
 * Each Re-Write's re-order line, with the original order day it is credited
 * to. A manager's call outranks the matching's: "Not a Re-Write" leaves the
 * re-order a new sale on its own day, and "It's a Re-Write" where no
 * re-order was found leaves nothing to move.
 */
export function rewriteOrderDaysOf(
  cancels: readonly Pick<CancelLike, "id" | "orderDay">[],
  matches: ReadonlyMap<string, CancellationMatch>,
  manual: ReadonlyMap<string, CancellationStatus>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of cancels) {
    const m = matches.get(c.id);
    if (m?.reorderId && (manual.get(c.id) ?? m.status) === "rewrite") out.set(m.reorderId, c.orderDay);
  }
  return out;
}

/**
 * The held order lines as Order Take counts them: whatever Dealerweb's
 * order list no longer carries left out — cancelled originals and old
 * copies (`leftOut`) — and each Re-Write's re-order counted on the original
 * order day. The re-order is the line kept — it has the corrected customer,
 * spec and profit — but on the original's day, whether or not the original
 * itself was ever held.
 *
 * `rewriteOrderDays` maps a re-order's line id to the original order day,
 * for cancellations that count as Re-Writes (a manager's call over the
 * matching's). Days only ever move earlier: a re-order follows its original.
 */
export function creditOrders<T extends { id: string; orderDay: string }>(
  lines: readonly T[],
  leftOut: ReadonlySet<string>,
  rewriteOrderDays: ReadonlyMap<string, string>,
): { lines: T[]; moved: CreditedReOrder[] } {
  const moved: CreditedReOrder[] = [];
  const out: T[] = [];
  for (const l of lines) {
    if (leftOut.has(l.id)) continue;
    const day = rewriteOrderDays.get(l.id);
    if (day && day < l.orderDay) {
      moved.push({ reorderDay: l.orderDay, creditDay: day });
      out.push({ ...l, orderDay: day });
    } else out.push(l);
  }
  return { lines: out, moved };
}
