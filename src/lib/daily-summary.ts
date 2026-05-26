import "server-only";
import { db } from "@/db";
import {
  customers,
  proposalEtaSnapshots,
  proposals,
  salesExecs,
  stockVehicles,
  users,
} from "@/db/schema";
import { and, asc, desc, gte, inArray } from "drizzle-orm";
import { renderEmailShell, ctaButton, escapeHtml as esc, EMAIL_BRAND } from "@/lib/email";
import { matchProposalAgainstStock } from "@/lib/stock-match";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tfleasing-app.vercel.app";
const escapeHtml = esc;

export function ukDateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDate(d: Date | null | undefined): string { return d ? ukDateLabel(d) : "TBA"; }
function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === "DELIVERED" || u === "DEALER";
}
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
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
  funderName: string;
  isGroupBq: boolean;
  acceptedAt: Date | null;
  monthlyRental: number;
}

interface StockRow {
  vin: string | null;
  orderNo: string | null;
  dealerRaw: string | null;
  locationStatus: string | null;
  etaAt: Date | null;
}

function matchStock(p: OrderRow, stock: StockRow[]): { etaAt: Date | null; location: string | null; delivered: boolean } {
  const { hit } = matchProposalAgainstStock(p, stock);
  if (hit) {
    const delivered = isDeliveredStatus(hit.locationStatus);
    return { etaAt: delivered ? null : hit.etaAt, location: hit.locationStatus, delivered };
  }
  return { etaAt: p.manualEtaAt, location: p.manualLocation, delivered: isDeliveredStatus(p.manualLocation) };
}

interface ActionRow {
  customerId: string;
  customer: string;
  exec: string | null;
  funder: string;
  acceptedAt: Date | null;
  ageDays: number | null;
  proposalId: string;
}

interface MoveRow {
  customerId: string;
  customer: string;
  exec: string | null;
  funder: string;
  fromEta: Date | null;
  toEta: Date | null;
  proposalId: string;
}

export interface Bucket {
  acceptedCount: number;
  referredCount: number;
  inOrderCount: number;
  awaitingCount: number;
  deliveredToday: number;
  acceptedAwaiting: ActionRow[];
  referredToDealer: ActionRow[];
  motorComplete: ActionRow[];
  financeAgreement: ActionRow[];
  novunaChip: ActionRow[];
  vehicleIds: ActionRow[];
  etaPulledForward: MoveRow[];
  etaPushedBack: MoveRow[];
  etaSet: MoveRow[];
  etaCleared: MoveRow[];
  etaDelivered: MoveRow[];
  monthlySum: number;
}

function emptyBucket(): Bucket {
  return {
    acceptedCount: 0,
    referredCount: 0,
    inOrderCount: 0,
    awaitingCount: 0,
    deliveredToday: 0,
    acceptedAwaiting: [],
    referredToDealer: [],
    motorComplete: [],
    financeAgreement: [],
    novunaChip: [],
    vehicleIds: [],
    etaPulledForward: [],
    etaPushedBack: [],
    etaSet: [],
    etaCleared: [],
    etaDelivered: [],
    monthlySum: 0,
  };
}

function ageDays(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export async function buildBuckets() {
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
      funderName: proposals.funderName,
      isGroupBq: proposals.isGroupBq,
      acceptedAt: proposals.acceptedAt,
      monthlyRental: proposals.monthlyRental,
    })
    .from(proposals)
    .where(inArray(proposals.status, ["accepted", "referred_to_dealer", "in_order", "awaiting_delivery"]))) as OrderRow[];

  const stock = (await db
    .select({
      vin: stockVehicles.vin,
      orderNo: stockVehicles.orderNo,
      dealerRaw: stockVehicles.dealerRaw,
      locationStatus: stockVehicles.locationStatus,
      etaAt: stockVehicles.etaAt,
    })
    .from(stockVehicles)) as StockRow[];

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

  const execs = await db.select().from(salesExecs);
  const execById = new Map(execs.map((e) => [e.id, e]));
  const custIds = Array.from(new Set(orderProps.map((p) => p.customerId)));
  const custRows = custIds.length === 0 ? [] : await db.select().from(customers).where(inArray(customers.id, custIds));
  const custName = new Map(custRows.map((c) => [c.id, c.name]));

  const allUsers = await db.select().from(users);
  const adminEmails = allUsers
    .filter((u) => {
      try {
        const r = JSON.parse(u.roles) as string[];
        return Array.isArray(r) && r.includes("admin");
      } catch { return false; }
    })
    .map((u) => ({ name: u.name, email: u.email }));

  const buckets = new Map<string | "ALL", Bucket>();
  buckets.set("ALL", emptyBucket());

  for (const p of orderProps) {
    const execName = p.salesExecId ? execById.get(p.salesExecId)?.name ?? null : (p.isGroupBq ? "Group BQ" : null);
    const cust = custName.get(p.customerId) ?? "—";
    const all = buckets.get("ALL")!;
    let perExec: Bucket | null = null;
    if (p.salesExecId) {
      perExec = buckets.get(p.salesExecId) ?? emptyBucket();
      buckets.set(p.salesExecId, perExec);
    }
    const targets = perExec ? [all, perExec] : [all];

    for (const b of targets) {
      if (p.status === "accepted") b.acceptedCount++;
      if (p.status === "referred_to_dealer") b.referredCount++;
      if (p.status === "in_order") b.inOrderCount++;
      if (p.status === "awaiting_delivery") b.awaitingCount++;
      b.monthlySum += p.monthlyRental ?? 0;
    }

    const a: ActionRow = {
      customerId: p.customerId,
      customer: cust,
      exec: execName,
      funder: p.funderName,
      acceptedAt: p.acceptedAt,
      ageDays: ageDays(p.acceptedAt),
      proposalId: p.id,
    };
    const isNov = p.funderId === "novuna";
    const isAld = p.funderId === "ald";

    if (p.status === "accepted") {
      for (const b of targets) b.acceptedAwaiting.push(a);
    }
    if (p.status === "referred_to_dealer") {
      for (const b of targets) b.referredToDealer.push(a);
    }
    // Novuna chip: needed any time post-accept until confirmed.
    if (isNov && !p.chipConfirmed && (p.status === "accepted" || p.status === "in_order")) {
      for (const b of targets) b.novunaChip.push(a);
    }
    if (p.status === "in_order") {
      if (!p.isGroupBq && !p.motorCompleteSigned) for (const b of targets) b.motorComplete.push(a);
      if (!isAld && !p.financeAgreementSigned) for (const b of targets) b.financeAgreement.push(a);
      if (!p.isGroupBq && !p.orderNumber && !p.vin) for (const b of targets) b.vehicleIds.push(a);
    }

    if (p.status === "awaiting_delivery" && !p.isGroupBq) {
      const snaps = snapByProp.get(p.id) ?? [];
      if (snaps.length >= 2) {
        const [latest, prev] = snaps;
        const eta1 = prev.etaAt;
        const eta2 = latest.etaAt;
        const dNow = isDeliveredStatus(latest.locationStatus);
        const dPrev = isDeliveredStatus(prev.locationStatus);
        const m: MoveRow = {
          customerId: p.customerId,
          customer: cust,
          exec: execName,
          funder: p.funderName,
          fromEta: eta1,
          toEta: eta2,
          proposalId: p.id,
        };
        if (dNow && !dPrev) {
          for (const b of targets) { b.etaDelivered.push(m); b.deliveredToday++; }
        } else if (eta1 && eta2 && !sameDay(eta1, eta2)) {
          if (eta2.getTime() > eta1.getTime()) for (const b of targets) b.etaPushedBack.push(m);
          else for (const b of targets) b.etaPulledForward.push(m);
        } else if (!eta1 && eta2) {
          for (const b of targets) b.etaSet.push(m);
        } else if (eta1 && !eta2 && !dNow) {
          for (const b of targets) b.etaCleared.push(m);
        }
      }
      void matchStock(p, stock);
    }
  }

  return { buckets, execById, adminEmails };
}

export function hasContent(b: Bucket): boolean {
  return (
    b.acceptedCount > 0 ||
    b.referredCount > 0 ||
    b.inOrderCount > 0 ||
    b.awaitingCount > 0 ||
    b.acceptedAwaiting.length > 0 ||
    b.referredToDealer.length > 0 ||
    b.motorComplete.length > 0 ||
    b.financeAgreement.length > 0 ||
    b.novunaChip.length > 0 ||
    b.vehicleIds.length > 0 ||
    b.etaPulledForward.length > 0 ||
    b.etaPushedBack.length > 0 ||
    b.etaSet.length > 0 ||
    b.etaCleared.length > 0 ||
    b.etaDelivered.length > 0
  );
}

export function buildText(name: string, b: Bucket, isAdmin: boolean): string {
  const first = name.split(" ")[0];
  const lines: string[] = [`Hi ${first},`, ""];
  lines.push(`Today's orderbank: ${b.acceptedCount} accepted · ${b.referredCount} referred · ${b.inOrderCount} in order · ${b.awaitingCount} awaiting delivery.`, "");
  if (b.acceptedAwaiting.length) lines.push(`Accepted — awaiting move to order (${b.acceptedAwaiting.length}):`, ...b.acceptedAwaiting.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""} — ${a.funder}${a.ageDays != null ? ` (${a.ageDays}d)` : ""}`), "");
  if (b.referredToDealer.length) lines.push(`Referred to dealer (${b.referredToDealer.length}):`, ...b.referredToDealer.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""} — ${a.funder}${a.ageDays != null ? ` (${a.ageDays}d)` : ""}`), "");
  if (b.motorComplete.length) lines.push(`MotorComplete to sign (${b.motorComplete.length}):`, ...b.motorComplete.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""} — ${a.funder}`), "");
  if (b.financeAgreement.length) lines.push(`Finance agreement to sign (${b.financeAgreement.length}):`, ...b.financeAgreement.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""} — ${a.funder}${a.ageDays != null ? ` (${a.ageDays}d)` : ""}`), "");
  if (b.novunaChip.length) lines.push(`Novuna chip (${b.novunaChip.length}):`, ...b.novunaChip.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""}`), "");
  if (b.vehicleIds.length) lines.push(`Add order number / VIN (${b.vehicleIds.length}):`, ...b.vehicleIds.map((a) => `  • ${a.customer}${isAdmin ? ` — ${a.exec ?? "—"}` : ""} — ${a.funder}`), "");
  lines.push(`Open: ${APP_URL}/orders`, "", "— TrustFord Leasing");
  return lines.join("\n");
}

const C = {
  red:    { bg: "#fef2f2", border: "#fecaca", fg: "#b91c1c", chip: "#b91c1c" },
  amber:  { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", chip: "#b45309" },
  blue:   { bg: "#eff6ff", border: "#bfdbfe", fg: "#1d4ed8", chip: "#1d4ed8" },
  green:  { bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857", chip: "#047857" },
  violet: { bg: "#f5f3ff", border: "#ddd6fe", fg: "#6d28d9", chip: "#6d28d9" },
  slate:  { bg: "#f8fafc", border: "#e2e8f0", fg: "#334155", chip: "#475569" },
};
type Tone = keyof typeof C;
function urgencyTone(ageDays: number | null): Tone {
  if (ageDays == null) return "slate";
  if (ageDays >= 21) return "red";
  if (ageDays >= 10) return "amber";
  return "blue";
}
function ageBadge(d: number | null): string {
  if (d == null) return "";
  const t = C[urgencyTone(d)];
  return `<span style="display:inline-block;background:${t.bg};color:${t.fg};border:1px solid ${t.border};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${d}d</span>`;
}
function statTile(n: number, label: string, color: string): string {
  return `
    <td align="center" style="padding:14px 8px;background:${EMAIL_BRAND.bg};border:1px solid ${EMAIL_BRAND.border};border-radius:10px;width:25%">
      <div style="font-size:24px;font-weight:700;color:${color};line-height:1.1">${n}</div>
      <div style="font-size:11px;color:${EMAIL_BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;margin-top:4px">${label}</div>
    </td>`;
}
function sectionHeader(title: string, count: number, tone: Tone, blurb: string): string {
  const t = C[tone];
  return `
    <div style="margin:28px 0 10px 0">
      <div>
        <span style="display:inline-block;background:${t.bg};color:${t.fg};border:1px solid ${t.border};padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${count} · ${escapeHtml(title)}</span>
      </div>
      <div style="font-size:12px;color:${EMAIL_BRAND.muted};margin-top:6px">${escapeHtml(blurb)}</div>
    </div>`;
}
function actionTable(rows: ActionRow[], tone: Tone, isAdmin: boolean, opts: { showAge?: boolean; showFunder?: boolean }): string {
  if (rows.length === 0) return "";
  const t = C[tone];
  const showAge = opts.showAge !== false;
  const showFunder = opts.showFunder !== false;
  const head = `
    <tr style="background:${t.bg}">
      <th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Customer</th>
      ${isAdmin ? `<th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Exec</th>` : ""}
      ${showFunder ? `<th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Funder</th>` : ""}
      ${showAge ? `<th align="right" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Age</th>` : ""}
    </tr>`;
  const body = [...rows]
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
    .map((r, i) => {
      const stripe = i % 2 === 0 ? "#ffffff" : "#fafbfc";
      const link = `${APP_URL}/customers/${r.customerId}`;
      return `
        <tr style="background:${stripe}">
          <td style="padding:9px 12px;font-size:14px;border-bottom:1px solid ${EMAIL_BRAND.border}"><a href="${link}" style="color:${EMAIL_BRAND.text};font-weight:600;text-decoration:none">${escapeHtml(r.customer)}</a></td>
          ${isAdmin ? `<td style="padding:9px 12px;font-size:13px;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.border}">${escapeHtml(r.exec ?? "—")}</td>` : ""}
          ${showFunder ? `<td style="padding:9px 12px;font-size:13px;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.border}">${escapeHtml(r.funder)}</td>` : ""}
          ${showAge ? `<td align="right" style="padding:9px 12px;border-bottom:1px solid ${EMAIL_BRAND.border}">${ageBadge(r.ageDays)}</td>` : ""}
        </tr>`;
    }).join("");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid ${t.border};border-radius:10px;overflow:hidden">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>`;
}
function moveTable(rows: MoveRow[], tone: Tone, isAdmin: boolean): string {
  if (rows.length === 0) return "";
  const t = C[tone];
  const head = `
    <tr style="background:${t.bg}">
      <th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Customer</th>
      ${isAdmin ? `<th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">Exec</th>` : ""}
      <th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">From</th>
      <th align="left" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${t.fg};border-bottom:1px solid ${t.border}">To</th>
    </tr>`;
  const body = rows.map((r, i) => {
    const stripe = i % 2 === 0 ? "#ffffff" : "#fafbfc";
    const link = `${APP_URL}/customers/${r.customerId}`;
    return `
      <tr style="background:${stripe}">
        <td style="padding:9px 12px;font-size:14px;border-bottom:1px solid ${EMAIL_BRAND.border}"><a href="${link}" style="color:${EMAIL_BRAND.text};font-weight:600;text-decoration:none">${escapeHtml(r.customer)}</a></td>
        ${isAdmin ? `<td style="padding:9px 12px;font-size:13px;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.border}">${escapeHtml(r.exec ?? "—")}</td>` : ""}
        <td style="padding:9px 12px;font-size:13px;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.border}">${fmtDate(r.fromEta)}</td>
        <td style="padding:9px 12px;font-size:13px;color:${EMAIL_BRAND.text};font-weight:600;border-bottom:1px solid ${EMAIL_BRAND.border}">${fmtDate(r.toEta)}</td>
      </tr>`;
  }).join("");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid ${t.border};border-radius:10px;overflow:hidden">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>`;
}

export function buildHtml(name: string, b: Bucket, isAdmin: boolean): string {
  const first = name.split(" ")[0];
  const totalActions = b.acceptedAwaiting.length + b.referredToDealer.length + b.motorComplete.length + b.financeAgreement.length + b.novunaChip.length + b.vehicleIds.length;
  const totalEtaMoves = b.etaPulledForward.length + b.etaPushedBack.length + b.etaSet.length + b.etaCleared.length + b.etaDelivered.length;
  const ctx = isAdmin ? "Across all execs." : "Your assigned deals only.";

  const tiles = `
    <table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;margin:0 0 6px 0">
      <tr>
        ${statTile(b.acceptedCount, "Accepted", C.green.fg)}
        ${statTile(b.referredCount, "Referred", C.amber.chip)}
        ${statTile(b.inOrderCount, "In order", C.blue.fg)}
        ${statTile(b.awaitingCount, "Awaiting", C.violet.fg)}
      </tr>
      <tr>
        ${statTile(totalActions, "Actions", totalActions > 0 ? C.amber.chip : C.slate.fg)}
        ${statTile(totalEtaMoves, "ETA moves", totalEtaMoves > 0 ? C.green.fg : C.slate.fg)}
        ${statTile(b.novunaChip.length, "Chips to do", b.novunaChip.length > 0 ? C.amber.chip : C.slate.fg)}
        ${statTile(b.deliveredToday, "Delivered", b.deliveredToday > 0 ? C.green.fg : C.slate.fg)}
      </tr>
    </table>`;

  const sections: string[] = [];
  if (b.acceptedAwaiting.length) {
    sections.push(sectionHeader("Accepted — awaiting move to order", b.acceptedAwaiting.length, "green", "Push these to in-order once the customer is committed."));
    sections.push(actionTable(b.acceptedAwaiting, "green", isAdmin, { showAge: true, showFunder: true }));
  }
  if (b.referredToDealer.length) {
    sections.push(sectionHeader("Referred to dealer", b.referredToDealer.length, "amber", "Awaiting your input — chase the funder or update the deal."));
    sections.push(actionTable(b.referredToDealer, "amber", isAdmin, { showAge: true, showFunder: true }));
  }
  if (b.financeAgreement.length) {
    sections.push(sectionHeader("Finance agreements to sign", b.financeAgreement.length, "red", "Customer must sign and return — chase if aged."));
    sections.push(actionTable(b.financeAgreement, "red", isAdmin, { showAge: true, showFunder: true }));
  }
  if (b.motorComplete.length) {
    sections.push(sectionHeader("MotorComplete orders to sign", b.motorComplete.length, "amber", "Internal sign-off needed before order can progress."));
    sections.push(actionTable(b.motorComplete, "amber", isAdmin, { showAge: true, showFunder: true }));
  }
  if (b.novunaChip.length) {
    sections.push(sectionHeader("Novuna chip to confirm", b.novunaChip.length, "amber", "Required for Novuna-funded deals."));
    sections.push(actionTable(b.novunaChip, "amber", isAdmin, { showAge: true, showFunder: false }));
  }
  if (b.vehicleIds.length) {
    sections.push(sectionHeader("Add order number / VIN", b.vehicleIds.length, "blue", "Vehicle identifiers needed before delivery tracking can begin."));
    sections.push(actionTable(b.vehicleIds, "blue", isAdmin, { showAge: true, showFunder: true }));
  }
  if (b.etaDelivered.length) {
    sections.push(sectionHeader("Delivered yesterday", b.etaDelivered.length, "green", "Vehicles arrived at us — book customer delivery."));
    sections.push(moveTable(b.etaDelivered, "green", isAdmin));
  }
  if (b.etaPulledForward.length) {
    sections.push(sectionHeader("ETA pulled forward", b.etaPulledForward.length, "green", "Earlier than previously expected."));
    sections.push(moveTable(b.etaPulledForward, "green", isAdmin));
  }
  if (b.etaPushedBack.length) {
    sections.push(sectionHeader("ETA pushed back", b.etaPushedBack.length, "red", "Customer may need to be notified."));
    sections.push(moveTable(b.etaPushedBack, "red", isAdmin));
  }
  if (b.etaSet.length) {
    sections.push(sectionHeader("ETA confirmed", b.etaSet.length, "blue", "First ETA appeared on stock."));
    sections.push(moveTable(b.etaSet, "blue", isAdmin));
  }
  if (b.etaCleared.length) {
    sections.push(sectionHeader("ETA cleared", b.etaCleared.length, "amber", "Previously had an ETA — now blank."));
    sections.push(moveTable(b.etaCleared, "amber", isAdmin));
  }
  if (sections.length === 0) {
    sections.push(`<p style="color:${EMAIL_BRAND.muted};margin:24px 0 0 0">No outstanding actions or ETA changes today. ✓</p>`);
  }

  const body = `
    <p style="margin:0 0 6px 0;font-size:15px">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 18px 0;color:${EMAIL_BRAND.muted};font-size:13px">${escapeHtml(ctx)}</p>
    ${tiles}
    ${sections.join("\n")}
    <p style="margin-top:28px">${ctaButton(`${APP_URL}/orders`, "Open orderbank")}</p>
  `;

  const preheader = `${b.inOrderCount} in order · ${b.awaitingCount} awaiting · ${totalActions} actions · ${totalEtaMoves} ETA moves`;
  return renderEmailShell({
    preheader,
    heading: isAdmin ? `Daily orderbank — all execs — ${ukDateLabel(new Date())}` : `Daily orderbank — ${ukDateLabel(new Date())}`,
    body,
  });
}
