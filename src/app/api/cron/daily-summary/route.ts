import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  customers,
  proposalEtaSnapshots,
  proposals,
  salesExecs,
  stockVehicles,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { sendMail, renderEmailShell, ctaButton, escapeHtml as esc, EMAIL_BRAND } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TF_BRANCH_CODES = ["62133", "62134"];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tfleasing-app.vercel.app";

function ukDateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDate(d: Date | null | undefined): string {
  return d ? ukDateLabel(d) : "TBA";
}
const escapeHtml = esc;
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export async function GET(req: Request) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` to scheduled crons.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only run when it's 07:30 UK time (so the same cron schedule works year-round
  // through BST/GMT — Vercel cron is UTC-only).
  const ukHour = parseInt(
    new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }),
    10,
  );
  if (ukHour !== 7 && req.headers.get("x-force") !== "1") {
    return NextResponse.json({ skipped: true, reason: `UK hour is ${ukHour}` });
  }

  const result = await runDailySummary();
  return NextResponse.json(result);
}

interface OrderRow {
  id: string;
  customerId: string;
  salesExecId: string | null;
  model: string;
  derivative: string;
  vin: string | null;
  orderNumber: string | null;
  status: string;
  manualEtaAt: Date | null;
  manualLocation: string | null;
  chipConfirmed: boolean;
  motorCompleteSigned: boolean;
  financeAgreementSigned: boolean;
  funderId: string;
  isGroupBq: boolean;
}

interface StockRow {
  vin: string | null;
  orderNo: string | null;
  dealerRaw: string | null;
  locationStatus: string | null;
  etaAt: Date | null;
}

function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === "DELIVERED" || u === "DEALER";
}

function matchStock(p: OrderRow, stock: StockRow[]): { etaAt: Date | null; location: string | null; delivered: boolean } {
  if (p.vin) {
    const hit = stock.find((s) => s.vin === p.vin);
    if (hit) {
      const delivered = isDeliveredStatus(hit.locationStatus);
      return { etaAt: delivered ? null : hit.etaAt, location: hit.locationStatus, delivered };
    }
  }
  if (p.orderNumber) {
    const hit = stock.find(
      (s) => s.orderNo === p.orderNumber && s.dealerRaw && TF_BRANCH_CODES.some((c) => s.dealerRaw!.includes(c)),
    );
    if (hit) {
      const delivered = isDeliveredStatus(hit.locationStatus);
      return { etaAt: delivered ? null : hit.etaAt, location: hit.locationStatus, delivered };
    }
  }
  return { etaAt: p.manualEtaAt, location: p.manualLocation, delivered: isDeliveredStatus(p.manualLocation) };
}

interface OutstandingAction {
  proposalId: string;
  customerId: string;
  vehicle: string;
  reason: string;
}

function outstandingActions(p: OrderRow): OutstandingAction[] {
  const out: OutstandingAction[] = [];
  const vehicle = `${p.model} ${p.derivative}`;
  const isNovuna = p.funderId === "novuna";
  const isAld = p.funderId === "ald";
  if (p.status !== "in_order") return out;
  if (isNovuna && !p.chipConfirmed) out.push({ proposalId: p.id, customerId: p.customerId, vehicle, reason: "Confirm Novuna chip" });
  if (!p.isGroupBq && !p.motorCompleteSigned) out.push({ proposalId: p.id, customerId: p.customerId, vehicle, reason: "Confirm MotorComplete signed" });
  if (!isAld && !p.financeAgreementSigned) out.push({ proposalId: p.id, customerId: p.customerId, vehicle, reason: "Finance agreement signed" });
  if (!p.isGroupBq && !p.orderNumber && !p.vin) out.push({ proposalId: p.id, customerId: p.customerId, vehicle, reason: "Add order number / VIN" });
  return out;
}

interface EtaMovement {
  proposalId: string;
  customerId: string;
  vehicle: string;
  fromEta: Date | null;
  toEta: Date | null;
  delivered: boolean;
  direction: "forward" | "back" | "delivered" | "set" | "cleared";
}

async function runDailySummary() {
  // Pull active orderbank.
  const orderProps = (await db
    .select({
      id: proposals.id,
      customerId: proposals.customerId,
      salesExecId: proposals.salesExecId,
      model: proposals.model,
      derivative: proposals.derivative,
      vin: proposals.vin,
      orderNumber: proposals.orderNumber,
      status: proposals.status,
      manualEtaAt: proposals.manualEtaAt,
      manualLocation: proposals.manualLocation,
      chipConfirmed: proposals.chipConfirmed,
      motorCompleteSigned: proposals.motorCompleteSigned,
      financeAgreementSigned: proposals.financeAgreementSigned,
      funderId: proposals.funderId,
      isGroupBq: proposals.isGroupBq,
    })
    .from(proposals)
    .where(inArray(proposals.status, ["in_order", "awaiting_delivery"]))) as OrderRow[];

  const stock = (await db
    .select({
      vin: stockVehicles.vin,
      orderNo: stockVehicles.orderNo,
      dealerRaw: stockVehicles.dealerRaw,
      locationStatus: stockVehicles.locationStatus,
      etaAt: stockVehicles.etaAt,
    })
    .from(stockVehicles)) as StockRow[];

  // Latest two ETA snapshots per proposal in the last 48h.
  const since = new Date(Date.now() - 1000 * 60 * 60 * 48);
  const propIds = orderProps.map((p) => p.id);
  const snapshots = propIds.length === 0
    ? []
    : await db
        .select()
        .from(proposalEtaSnapshots)
        .where(and(inArray(proposalEtaSnapshots.proposalId, propIds), gte(proposalEtaSnapshots.capturedAt, since)))
        .orderBy(asc(proposalEtaSnapshots.proposalId), desc(proposalEtaSnapshots.capturedAt));
  const snapByProp = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const arr = snapByProp.get(s.proposalId) ?? [];
    arr.push(s);
    snapByProp.set(s.proposalId, arr);
  }

  // Group execs.
  const execs = await db.select().from(salesExecs);
  const execById = new Map(execs.map((e) => [e.id, e]));

  const custIds = Array.from(new Set(orderProps.map((p) => p.customerId)));
  const custRows = custIds.length === 0 ? [] : await db.select().from(customers).where(inArray(customers.id, custIds));
  const custNameById = new Map(custRows.map((c) => [c.id, c.name]));
  const labelFor = (p: OrderRow) => {
    const cn = custNameById.get(p.customerId);
    return `${cn ? cn + " · " : ""}${p.model} ${p.derivative}`;
  };

  type ExecBucket = {
    movements: EtaMovement[];
    actions: OutstandingAction[];
    inOrderCount: number;
    awaitingCount: number;
  };
  const buckets = new Map<string, ExecBucket>();

  for (const p of orderProps) {
    if (!p.salesExecId) continue;
    const bucket = buckets.get(p.salesExecId) ?? { movements: [], actions: [], inOrderCount: 0, awaitingCount: 0 };
    if (p.status === "in_order") bucket.inOrderCount++;
    if (p.status === "awaiting_delivery") bucket.awaitingCount++;

    // ETA movement: compare latest 2 snapshots.
    const snaps = snapByProp.get(p.id) ?? [];
    if (snaps.length >= 2) {
      const [latest, prev] = snaps;
      const eta1 = prev.etaAt;
      const eta2 = latest.etaAt;
      const deliveredNow = isDeliveredStatus(latest.locationStatus);
      const deliveredPrev = isDeliveredStatus(prev.locationStatus);
      let direction: EtaMovement["direction"] | null = null;
      if (deliveredNow && !deliveredPrev) direction = "delivered";
      else if (eta1 && eta2 && !sameDay(eta1, eta2)) direction = eta2.getTime() > eta1.getTime() ? "back" : "forward";
      else if (!eta1 && eta2) direction = "set";
      else if (eta1 && !eta2 && !deliveredNow) direction = "cleared";
      if (direction) {
        bucket.movements.push({
          proposalId: p.id,
          customerId: p.customerId,
          vehicle: labelFor(p),
          fromEta: eta1,
          toEta: eta2,
          delivered: deliveredNow,
          direction,
        });
      }
    }

    // Outstanding actions (current state, not snapshot).
    const label = labelFor(p);
    bucket.actions.push(...outstandingActions(p).map((a) => ({ ...a, vehicle: label })));

    buckets.set(p.salesExecId, bucket);
  }

  let sent = 0;
  for (const [execId, bucket] of buckets) {
    const exec = execById.get(execId);
    if (!exec?.email) continue;
    if (bucket.movements.length === 0 && bucket.actions.length === 0 && bucket.inOrderCount === 0 && bucket.awaitingCount === 0) continue;
    await sendMail({
      to: exec.email,
      subject: `Daily orderbank summary — ${ukDateLabel(new Date())}`,
      text: buildText(exec.name, bucket),
      html: buildHtml(exec.name, bucket),
    });
    sent++;
  }
  return { ok: true, sent, considered: buckets.size };
}

function arrowFor(d: EtaMovement["direction"]): string {
  if (d === "forward") return "↑ pulled forward";
  if (d === "back") return "↓ pushed back";
  if (d === "delivered") return "✓ delivered";
  if (d === "set") return "+ ETA set";
  if (d === "cleared") return "− ETA cleared";
  return "";
}

function buildText(name: string, b: { movements: EtaMovement[]; actions: OutstandingAction[]; inOrderCount: number; awaitingCount: number }): string {
  const first = name.split(" ")[0];
  const lines: string[] = [`Hi ${first},`, ""];
  lines.push(`Today's orderbank: ${b.inOrderCount} in order · ${b.awaitingCount} awaiting delivery.`, "");

  if (b.movements.length) {
    lines.push("ETA movements (last 24h):");
    for (const m of b.movements) {
      lines.push(`  ${arrowFor(m.direction)}  ${m.vehicle}  ${fmtDate(m.fromEta)} → ${fmtDate(m.toEta)}`);
    }
    lines.push("");
  }
  if (b.actions.length) {
    lines.push("Outstanding actions:");
    for (const a of b.actions) lines.push(`  • ${a.vehicle}: ${a.reason}`);
    lines.push("");
  }
  if (b.movements.length === 0 && b.actions.length === 0) lines.push("No ETA changes or outstanding actions today.", "");
  lines.push(`Open: ${APP_URL}/orders`);
  lines.push("", "— TrustFord Leasing");
  return lines.join("\n");
}

function buildHtml(name: string, b: { movements: EtaMovement[]; actions: OutstandingAction[]; inOrderCount: number; awaitingCount: number }): string {
  const first = name.split(" ")[0];
  const colorFor = (d: EtaMovement["direction"]) =>
    d === "delivered" ? "#10b981" : d === "forward" || d === "set" ? "#3b82f6" : d === "back" ? "#ef4444" : "#64748b";

  const movements = b.movements
    .map((m) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:${colorFor(m.direction)};font-weight:600;white-space:nowrap">${arrowFor(m.direction)}</td>
        <td style="padding:6px 12px 6px 0">${escapeHtml(m.vehicle)}</td>
        <td style="padding:6px 0;color:#475569">${fmtDate(m.fromEta)} → <strong>${fmtDate(m.toEta)}</strong></td>
      </tr>`)
    .join("");
  const actions = b.actions
    .map((a) => `<li style="padding:2px 0"><strong>${escapeHtml(a.vehicle)}</strong> — ${escapeHtml(a.reason)}</li>`)
    .join("");

  const stat = (n: number, label: string, color: string) => `
    <td align="center" style="padding:14px 8px;background:${EMAIL_BRAND.bg};border:1px solid ${EMAIL_BRAND.border};border-radius:10px">
      <div style="font-size:22px;font-weight:700;color:${color};line-height:1.1">${n}</div>
      <div style="font-size:11px;color:${EMAIL_BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;margin-top:4px">${label}</div>
    </td>`;

  const body = `
    <p style="margin:0 0 16px 0">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 16px 0;color:${EMAIL_BRAND.muted}">Here's today's orderbank snapshot.</p>
    <table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate"><tr>
      ${stat(b.inOrderCount, "In order", "#1d4ed8")}
      ${stat(b.awaitingCount, "Awaiting", "#6d28d9")}
      ${stat(b.movements.length, "ETA moves", "#0f766e")}
      ${stat(b.actions.length, "Actions", "#b45309")}
    </tr></table>
    ${b.movements.length ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:${EMAIL_BRAND.muted};margin:24px 0 8px">ETA movements (last 24h)</h3><table style="border-collapse:collapse;font-size:14px;width:100%">${movements}</table>` : ""}
    ${b.actions.length ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:${EMAIL_BRAND.muted};margin:24px 0 8px">Outstanding actions</h3><ul style="font-size:14px;padding-left:18px;margin:0">${actions}</ul>` : ""}
    ${b.movements.length === 0 && b.actions.length === 0 ? `<p style="color:${EMAIL_BRAND.muted};margin-top:20px">No ETA changes or outstanding actions today.</p>` : ""}
    <p style="margin-top:24px">${ctaButton(`${APP_URL}/orders`, "Open orderbank")}</p>
  `;

  return renderEmailShell({
    preheader: `${b.inOrderCount} in order · ${b.awaitingCount} awaiting · ${b.movements.length} ETA moves · ${b.actions.length} actions`,
    heading: `Daily orderbank — ${ukDateLabel(new Date())}`,
    body,
  });
}
