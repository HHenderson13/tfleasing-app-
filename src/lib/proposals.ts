import "server-only";
import { db } from "@/db";
import { customers, groupSites, proposalEvents, proposalStageChecks, proposals, salesExecs, stageCheckDefs } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ORDER_STATUSES, PROPOSAL_SECTION_STATUSES, type ProposalStatus } from "./proposal-constants";
import { sendStatusChangeEmail } from "./email";

export interface CreateProposalInput {
  customerName: string;
  salesExecId: string | null;
  capCode: string;
  model: string;
  derivative: string;
  contract: "PCH" | "BCH";
  maintenance: "customer" | "maintained";
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  funderId: string;
  funderName: string;
  funderRank: number;
  monthlyRental: number;
  financeProposalNumber: string;
  parentProposalId?: string;
  existingCustomerId?: string;
  isBroker?: boolean;
  brokerName?: string | null;
  brokerEmail?: string | null;
  isGroupBq?: boolean;
  groupSiteId?: string | null;
  isEv?: boolean;
  wallboxIncluded?: boolean;
  customerSavingGbp?: number | null;
}

export async function createProposal(input: CreateProposalInput) {
  const financeProposalNumber = input.financeProposalNumber.trim();
  if (!financeProposalNumber) throw new Error("Finance Proposal Number is required.");

  const isGroupBq = !!input.isGroupBq;
  const isBroker = !!input.isBroker;

  if (isGroupBq) {
    if (!input.groupSiteId) throw new Error("Pick a group site for this BQ deal.");
    const site = await db.select().from(groupSites).where(eq(groupSites.id, input.groupSiteId)).limit(1);
    if (!site.length) throw new Error("Group site not found");
  } else {
    if (!input.salesExecId) throw new Error("Assign a sales exec.");
    const exec = await db.select().from(salesExecs).where(eq(salesExecs.id, input.salesExecId)).limit(1);
    if (!exec.length) throw new Error("Sales exec not found");
  }

  const brokerName = isBroker ? (input.brokerName ?? "").trim() : "";
  const brokerEmail = isBroker ? (input.brokerEmail ?? "").trim() : "";
  if (isBroker && (!brokerName || !brokerEmail)) {
    throw new Error("Broker name and email are required when marking a proposal as broker.");
  }

  let customerId = input.existingCustomerId;
  if (!customerId) {
    const name = input.customerName.trim();
    if (!name) throw new Error("Customer name required");
    customerId = randomUUID();
    await db.insert(customers).values({ id: customerId, name, createdAt: new Date() });
  }

  const id = randomUUID();
  const now = new Date();
  await db.insert(proposals).values({
    id,
    customerId,
    salesExecId: isGroupBq ? null : input.salesExecId,
    isBroker,
    brokerName: isBroker ? brokerName : null,
    brokerEmail: isBroker ? brokerEmail : null,
    isGroupBq,
    groupSiteId: isGroupBq ? input.groupSiteId! : null,
    capCode: input.capCode,
    model: input.model,
    derivative: input.derivative,
    contract: input.contract,
    maintenance: input.maintenance,
    termMonths: input.termMonths,
    annualMileage: input.annualMileage,
    initialRentalMultiplier: input.initialRentalMultiplier,
    funderId: input.funderId,
    funderName: input.funderName,
    funderRank: input.funderRank,
    financeProposalNumber,
    monthlyRental: input.monthlyRental,
    parentProposalId: input.parentProposalId ?? null,
    isEv: !!input.isEv,
    wallboxIncluded: !!input.wallboxIncluded,
    customerSavingGbp: input.customerSavingGbp ?? null,
    status: "proposal_received",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(proposalEvents).values({
    proposalId: id,
    kind: "created",
    toStatus: "proposal_received",
    note: `Proposal logged with ${input.funderName} (rank #${input.funderRank}), finance proposal #${financeProposalNumber}, at £${input.monthlyRental.toFixed(2)}/mo.${isGroupBq ? " Group BQ deal." : ""}${isBroker ? ` Broker: ${brokerName} <${brokerEmail}>.` : ""}`,
    createdAt: now,
  });
  return { id, customerId };
}

export async function changeStatus(proposalId: string, toStatus: ProposalStatus, note?: string) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) throw new Error("Proposal not found");
  if (p.status === toStatus) return;
  if (toStatus === "referred_to_dealer" && !(note && note.trim())) {
    throw new Error("Underwriting details are required when referring to dealer.");
  }
  if (toStatus === "not_eligible" && !(note && note.trim())) {
    throw new Error("A reason is required when marking a proposal not eligible.");
  }
  if (toStatus === "cancelled" && !(note && note.trim())) {
    throw new Error("A reason is required when cancelling a deal.");
  }
  if (toStatus === "in_order" && p.status !== "accepted") {
    throw new Error("Only accepted proposals can move to order stage.");
  }
  if (toStatus === "awaiting_delivery") {
    if (p.status !== "in_order") throw new Error("Move to order stage first.");
    const isNovuna = p.funderId === "novuna";
    const isAld = p.funderId === "ald";
    const isBq = p.isGroupBq;
    if (isNovuna && !p.chipConfirmed) throw new Error("Confirm Novuna chip has been done.");
    if (!isBq && !p.motorCompleteSigned) throw new Error("Confirm MotorComplete order signed.");
    if (!isAld && !p.financeAgreementSigned) throw new Error("Confirm signed finance agreement received.");
    if (!isBq && !p.orderNumber && !p.vin) throw new Error("Enter an order number and/or VIN.");

    const defs = await db.select().from(stageCheckDefs);
    const applicable = defs.filter((d) => isBq ? d.appliesToBq : true);
    if (applicable.length) {
      const ticked = await db.select().from(proposalStageChecks).where(eq(proposalStageChecks.proposalId, proposalId));
      const tickedIds = new Set(ticked.map((t) => t.checkId));
      const missing = applicable.filter((d) => !tickedIds.has(d.id));
      if (missing.length) {
        throw new Error(`Confirm: ${missing.map((m) => m.label).join(", ")}.`);
      }
    }
  }

  const now = new Date();
  const patch: Record<string, unknown> = { status: toStatus, updatedAt: now };
  if (toStatus === "referred_to_dealer") patch.underwritingNotes = note!.trim();
  if (toStatus === "accepted" && !p.acceptedAt) patch.acceptedAt = now;
  await db.update(proposals).set(patch).where(eq(proposals.id, proposalId));
  await db.insert(proposalEvents).values({
    proposalId,
    kind: "status_change",
    fromStatus: p.status,
    toStatus,
    note: note?.trim() || null,
    createdAt: now,
  });
  await sendStatusChangeEmail({
    id: p.id,
    customerId: p.customerId,
    salesExecId: p.salesExecId,
    model: p.model,
    derivative: p.derivative,
    funderName: p.funderName,
    monthlyRental: p.monthlyRental,
    fromStatus: p.status as ProposalStatus,
    toStatus,
    note: note?.trim() || null,
  });
}

export async function updateOrderFields(
  proposalId: string,
  patch: Partial<{
    chipConfirmed: boolean;
    motorCompleteSigned: boolean;
    financeAgreementSigned: boolean;
    orderNumber: string | null;
    vin: string | null;
    model: string;
    derivative: string;
  }>
) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) throw new Error("Proposal not found");
  const now = new Date();
  const clean: Record<string, unknown> = { updatedAt: now };
  const events: { field: string; value: string }[] = [];
  if (typeof patch.model === "string") {
    const v = patch.model.trim();
    if (!v) throw new Error("Model can't be empty.");
    if (v !== p.model) { clean.model = v; events.push({ field: "Model", value: v }); }
  }
  if (typeof patch.derivative === "string") {
    const v = patch.derivative.trim();
    if (!v) throw new Error("Derivative can't be empty.");
    if (v !== p.derivative) { clean.derivative = v; events.push({ field: "Derivative", value: v }); }
  }
  if (typeof patch.chipConfirmed === "boolean" && patch.chipConfirmed !== p.chipConfirmed) {
    clean.chipConfirmed = patch.chipConfirmed;
    events.push({ field: "Novuna chip", value: patch.chipConfirmed ? "confirmed" : "cleared" });
  }
  if (typeof patch.motorCompleteSigned === "boolean" && patch.motorCompleteSigned !== p.motorCompleteSigned) {
    clean.motorCompleteSigned = patch.motorCompleteSigned;
    events.push({ field: "MotorComplete order", value: patch.motorCompleteSigned ? "signed" : "cleared" });
  }
  if (typeof patch.financeAgreementSigned === "boolean" && patch.financeAgreementSigned !== p.financeAgreementSigned) {
    clean.financeAgreementSigned = patch.financeAgreementSigned;
    events.push({ field: "Finance agreement", value: patch.financeAgreementSigned ? "signed" : "cleared" });
  }
  if (patch.orderNumber !== undefined) {
    const v = patch.orderNumber?.trim() || null;
    if (v !== (p.orderNumber ?? null)) {
      clean.orderNumber = v;
      events.push({ field: "Order number", value: v ?? "cleared" });
    }
  }
  if (patch.vin !== undefined) {
    const v = patch.vin?.trim().toUpperCase() || null;
    if (v && !/^[A-Z0-9]{11}$/.test(v)) {
      throw new Error("VIN must be exactly 11 characters (letters and numbers only).");
    }
    if (v !== (p.vin ?? null)) {
      clean.vin = v;
      events.push({ field: "VIN", value: v ?? "cleared" });
    }
  }
  if (Object.keys(clean).length === 1) return; // only updatedAt
  await db.update(proposals).set(clean).where(eq(proposals.id, proposalId));
  for (const e of events) {
    await db.insert(proposalEvents).values({
      proposalId,
      kind: "note",
      note: `${e.field} ${e.value}.`,
      createdAt: now,
    });
  }
}

export async function setStageCheck(proposalId: string, checkId: string, value: boolean) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) throw new Error("Proposal not found");
  const [def] = await db.select().from(stageCheckDefs).where(eq(stageCheckDefs.id, checkId)).limit(1);
  if (!def) throw new Error("Check not found");
  const now = new Date();
  if (value) {
    const existing = await db.select().from(proposalStageChecks).where(and(eq(proposalStageChecks.proposalId, proposalId), eq(proposalStageChecks.checkId, checkId))).limit(1);
    if (!existing.length) {
      await db.insert(proposalStageChecks).values({ proposalId, checkId, checkedAt: now });
      await db.insert(proposalEvents).values({ proposalId, kind: "note", note: `${def.label} confirmed.`, createdAt: now });
    }
  } else {
    await db.delete(proposalStageChecks).where(and(eq(proposalStageChecks.proposalId, proposalId), eq(proposalStageChecks.checkId, checkId)));
    await db.insert(proposalEvents).values({ proposalId, kind: "note", note: `${def.label} cleared.`, createdAt: now });
  }
  await db.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, proposalId));
}

export async function countDeclinedForCustomer(customerId: string) {
  const rows = await db.select().from(proposals).where(and(eq(proposals.customerId, customerId), eq(proposals.status, "declined")));
  return rows.length;
}

export async function getCustomerTimeline(customerId: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;
  const ps = await db.select().from(proposals).where(eq(proposals.customerId, customerId)).orderBy(asc(proposals.createdAt));
  const execs = await db.select().from(salesExecs);
  const sites = await db.select().from(groupSites);
  const execMap = new Map(execs.map((e) => [e.id, e]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const withEvents = await Promise.all(
    ps.map(async (p) => {
      const events = await db.select().from(proposalEvents).where(eq(proposalEvents.proposalId, p.id)).orderBy(asc(proposalEvents.createdAt));
      return {
        proposal: p,
        exec: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
        groupSite: p.groupSiteId ? siteMap.get(p.groupSiteId) ?? null : null,
        events,
      };
    })
  );
  return { customer, items: withEvents };
}

export type Section = "proposals" | "orders";
export async function listProposals(section?: Section) {
  const statuses = section === "orders" ? ORDER_STATUSES : section === "proposals" ? PROPOSAL_SECTION_STATUSES : null;
  const ps = statuses
    ? await db.select().from(proposals).where(inArray(proposals.status, statuses)).orderBy(desc(proposals.updatedAt))
    : await db.select().from(proposals).orderBy(desc(proposals.updatedAt));
  const execs = await db.select().from(salesExecs);
  const custs = await db.select().from(customers);
  const sites = await db.select().from(groupSites);
  const defs = await db.select().from(stageCheckDefs);
  const ticks = ps.length
    ? await db.select().from(proposalStageChecks).where(inArray(proposalStageChecks.proposalId, ps.map((p) => p.id)))
    : [];
  const execMap = new Map(execs.map((e) => [e.id, e]));
  const custMap = new Map(custs.map((c) => [c.id, c]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const ticksByProposal = new Map<string, Set<string>>();
  for (const t of ticks) {
    if (!ticksByProposal.has(t.proposalId)) ticksByProposal.set(t.proposalId, new Set());
    ticksByProposal.get(t.proposalId)!.add(t.checkId);
  }
  return ps.map((p) => {
    const ticked = ticksByProposal.get(p.id) ?? new Set<string>();
    const applicable = defs.filter((d) => p.isGroupBq ? d.appliesToBq : true);
    const customRemaining = applicable.filter((d) => !ticked.has(d.id)).length;
    return {
      ...p,
      exec: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
      customer: custMap.get(p.customerId) ?? null,
      groupSite: p.groupSiteId ? siteMap.get(p.groupSiteId) ?? null : null,
      customRemaining,
    };
  });
}

export type AlertKind =
  | "sign_deadline_soon"
  | "sign_deadline_passed"
  | "missing_order_after_acceptance"
  | "missing_vin_after_order"
  | "awaiting_too_long"
  | "eta_passed";

export interface Alert {
  kind: AlertKind;
  proposalId: string;
  customerId: string;
  customerName: string;
  model: string;
  derivative: string;
  execId: string | null;
  execName: string | null;
  message: string;
  ageDays: number;
  severity: "warn" | "danger";
}

export async function getAlerts(execIdFilter: string | null = null): Promise<Alert[]> {
  const ps = await db.select().from(proposals);
  const execs = await db.select().from(salesExecs);
  const custs = await db.select().from(customers);
  const execMap = new Map(execs.map((e) => [e.id, e]));
  const custMap = new Map(custs.map((c) => [c.id, c]));
  const now = Date.now();
  const dayMs = 86_400_000;
  const out: Alert[] = [];
  for (const p of ps) {
    if (execIdFilter && p.salesExecId !== execIdFilter) continue;
    const exec = p.salesExecId ? execMap.get(p.salesExecId) ?? null : null;
    const cust = custMap.get(p.customerId);
    if (!cust) continue;
    const base = {
      proposalId: p.id,
      customerId: p.customerId,
      customerName: cust.name,
      model: p.model,
      derivative: p.derivative,
      execId: exec?.id ?? null,
      execName: exec?.name ?? null,
    };
    if (p.status === "accepted" && p.acceptedAt) {
      const days = Math.floor((now - p.acceptedAt.getTime()) / dayMs);
      if (days >= 30) {
        out.push({ ...base, kind: "sign_deadline_passed", ageDays: days, severity: "danger", message: `Finance window passed (${days}d since acceptance) — no order yet` });
      } else if (days >= 25 && !p.orderNumber) {
        out.push({ ...base, kind: "sign_deadline_soon", ageDays: days, severity: "warn", message: `Finance window closes in ${30 - days}d — still no order number` });
      }
    }
    if ((p.status === "accepted" || p.status === "in_order") && !p.orderNumber) {
      const since = (p.acceptedAt ?? p.createdAt).getTime();
      const days = Math.floor((now - since) / dayMs);
      if (days >= 14) {
        out.push({ ...base, kind: "missing_order_after_acceptance", ageDays: days, severity: "warn", message: `No order number after ${days}d` });
      }
    }
    if ((p.status === "in_order" || p.status === "awaiting_delivery") && !p.vin && !p.isGroupBq) {
      const since = (p.acceptedAt ?? p.createdAt).getTime();
      const days = Math.floor((now - since) / dayMs);
      if (days >= 21) {
        out.push({ ...base, kind: "missing_vin_after_order", ageDays: days, severity: "warn", message: `No VIN after ${days}d in order stage` });
      }
    }
    if (p.status === "awaiting_delivery") {
      const since = (p.acceptedAt ?? p.createdAt).getTime();
      const days = Math.floor((now - since) / dayMs);
      if (days >= 120) {
        out.push({ ...base, kind: "awaiting_too_long", ageDays: days, severity: "danger", message: `Awaiting delivery ${days}d — chase Ford / dealer` });
      }
      if (p.manualEtaAt && p.manualEtaAt.getTime() < now) {
        const passed = Math.floor((now - p.manualEtaAt.getTime()) / dayMs);
        out.push({ ...base, kind: "eta_passed", ageDays: passed, severity: "warn", message: `Manual ETA passed ${passed}d ago — confirm or update` });
      }
    }
  }
  out.sort((a, b) => (b.severity === "danger" ? 1 : 0) - (a.severity === "danger" ? 1 : 0) || b.ageDays - a.ageDays);
  return out;
}

export async function getRecentlyDelivered(limit = 10) {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const ps = await db.select().from(proposals);
  const custs = await db.select().from(customers);
  const execs = await db.select().from(salesExecs);
  const custMap = new Map(custs.map((c) => [c.id, c]));
  const execMap = new Map(execs.map((e) => [e.id, e]));
  return ps
    .filter((p) => p.deliveredDetectedAt && p.deliveredDetectedAt >= cutoff)
    .sort((a, b) => (b.deliveredDetectedAt!.getTime()) - (a.deliveredDetectedAt!.getTime()))
    .slice(0, limit)
    .map((p) => ({
      proposalId: p.id,
      customerId: p.customerId,
      customerName: custMap.get(p.customerId)?.name ?? "—",
      model: p.model,
      derivative: p.derivative,
      execName: p.salesExecId ? execMap.get(p.salesExecId)?.name ?? null : null,
      deliveredAt: p.deliveredDetectedAt!.toISOString(),
    }));
}

export async function getProposalWithContext(proposalId: string) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) return null;
  const [cust] = await db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1);
  const [exec] = p.salesExecId
    ? await db.select().from(salesExecs).where(eq(salesExecs.id, p.salesExecId)).limit(1)
    : [undefined];
  const [site] = p.groupSiteId
    ? await db.select().from(groupSites).where(eq(groupSites.id, p.groupSiteId)).limit(1)
    : [undefined];
  const events = await db.select().from(proposalEvents).where(eq(proposalEvents.proposalId, p.id)).orderBy(asc(proposalEvents.createdAt));
  const defs = await db.select().from(stageCheckDefs).orderBy(asc(stageCheckDefs.sortOrder), asc(stageCheckDefs.label));
  const ticks = await db.select().from(proposalStageChecks).where(eq(proposalStageChecks.proposalId, p.id));
  const tickedIds = new Set(ticks.map((t) => t.checkId));
  const customChecks = defs
    .filter((d) => p.isGroupBq ? d.appliesToBq : true)
    .map((d) => ({ id: d.id, label: d.label, checked: tickedIds.has(d.id) }));
  return { proposal: p, customer: cust ?? null, exec: exec ?? null, groupSite: site ?? null, events, customChecks };
}
