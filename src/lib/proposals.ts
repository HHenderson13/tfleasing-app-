import "server-only";
import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";
import { db } from "@/db";
import { customers, dealerFitOptions, groupSites, proposalEvents, proposalStageChecks, proposals, salesExecs, stageCheckDefs } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ORDER_STATUSES, PROPOSAL_SECTION_STATUSES, type ProposalStatus } from "./proposal-constants";
import { sendStatusChangeEmail } from "./email";
import {
  CUSTOMERS_TAG,
  GROUP_SITES_TAG,
  PROPOSALS_TAG,
  SALES_EXECS_TAG,
  STAGE_CHECK_DEFS_TAG,
} from "./cache-tags";

// Shared invalidation hook for proposal mutations. The /reports loaders
// (buildReport, getProposalsTimeseries, getDrilldown) live behind a 5-min
// cache tagged PROPOSALS_TAG — every write that affects them must bust it
// so admins immediately see status-change effects.
export function invalidateProposals() {
  updateTag(PROPOSALS_TAG);
}

// Two-tier cache for the small lookup tables every page reads.
//
//   • outer: unstable_cache survives across requests until the tag is
//     invalidated. Cuts a Turso round-trip off every authenticated page
//     load — these lookups happen 5-7× per render across most pages.
//   • inner: React cache() still dedupes within a single render so we
//     don't re-deserialise the cached payload N times.
//
// Invalidation happens in the admin actions that mutate each table — see
// updateTag calls in src/app/admin/{sales-execs,users,group-sites,
// order-checks}/actions.ts.
const ONE_DAY = 86_400;

const fetchSalesExecs       = unstable_cache(async () => db.select().from(salesExecs),       ["lookup-sales-execs"],       { tags: [SALES_EXECS_TAG],       revalidate: ONE_DAY });
const fetchCustomers        = unstable_cache(async () => db.select().from(customers),        ["lookup-customers"],         { tags: [CUSTOMERS_TAG],         revalidate: ONE_DAY });
const fetchGroupSites       = unstable_cache(async () => db.select().from(groupSites),       ["lookup-group-sites"],       { tags: [GROUP_SITES_TAG],       revalidate: ONE_DAY });
const fetchStageCheckDefs   = unstable_cache(async () => db.select().from(stageCheckDefs),   ["lookup-stage-check-defs"],  { tags: [STAGE_CHECK_DEFS_TAG],  revalidate: ONE_DAY });

const cachedSalesExecs      = cache(() => fetchSalesExecs());
const cachedCustomers       = cache(() => fetchCustomers());
const cachedGroupSites      = cache(() => fetchGroupSites());
const cachedStageCheckDefs  = cache(() => fetchStageCheckDefs());

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
    // New customer — bust the cross-request customers lookup tag so all
    // pages that read it see the fresh row immediately.
    updateTag(CUSTOMERS_TAG);
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
  invalidateProposals();
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

    const defs = await db.select().from(stageCheckDefs).where(eq(stageCheckDefs.stage, "order"));
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
  if (toStatus === "delivered") {
    if (p.status !== "awaiting_delivery") throw new Error("Move to awaiting delivery first.");
    if (!p.deliveryBookedAt) throw new Error("Set the delivery date first.");
    // Mandatory pre-delivery confirmations — set by the exec via the
    // tracker modal. Both must be true before the deal can move out of
    // awaiting_delivery.
    if (!p.deliveryPackSubmitted) throw new Error("Confirm the delivery pack has been submitted to the funder.");
    if (!p.deliveryDetailsChecked) throw new Error("Confirm all delivery details were checked before submission.");
    const isBq = p.isGroupBq;
    const defs = await db.select().from(stageCheckDefs).where(eq(stageCheckDefs.stage, "delivery"));
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
  if (toStatus === "delivered" && !p.deliveredAt) patch.deliveredAt = now;
  await db.update(proposals).set(patch).where(eq(proposals.id, proposalId));
  await db.insert(proposalEvents).values({
    proposalId,
    kind: "status_change",
    fromStatus: p.status,
    toStatus,
    note: note?.trim() || null,
    createdAt: now,
  });
  invalidateProposals();
  const [cust] = await db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1);
  void sendStatusChangeEmail({
    id: p.id,
    customerId: p.customerId,
    customerName: cust?.name ?? null,
    salesExecId: p.salesExecId,
    model: p.model,
    derivative: p.derivative,
    funderName: p.funderName,
    monthlyRental: p.monthlyRental,
    fromStatus: p.status as ProposalStatus,
    toStatus,
    note: note?.trim() || null,
  }).catch((e) => console.error("[email] sendStatusChangeEmail failed:", e));
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
    deliveryBookedAt: Date | null;
    regNumber: string | null;
    // Delivery tracker patch fields. Optional — only set the ones you're
    // editing. Each field gets its own audit event in proposalEvents.
    vehicleColour: string | null;
    factoryOptions: string | null;
    pdiDone: boolean;
    invoiced: boolean;
    itcComplete: boolean;
    gapPolicyStatus: "none" | "pending" | "complete";
    gapPolicyNumber: string | null;
    tfpPolicyStatus: "none" | "pending" | "complete";
    tfpPolicyNumber: string | null;
    taxed: boolean;
    deliveryNotes: string | null;
    deliveryPackSubmitted: boolean;
    deliveryDetailsChecked: boolean;
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
  if (patch.deliveryBookedAt !== undefined) {
    const v = patch.deliveryBookedAt;
    if (v && Number.isNaN(v.getTime())) throw new Error("Bad delivery date");
    const same = (v?.getTime() ?? null) === (p.deliveryBookedAt?.getTime() ?? null);
    if (!same) {
      clean.deliveryBookedAt = v;
      events.push({ field: "Delivery date", value: v ? v.toISOString().slice(0, 10) : "cleared" });
    }
  }
  if (patch.regNumber !== undefined) {
    const v = patch.regNumber?.trim().toUpperCase() || null;
    if (v !== (p.regNumber ?? null)) {
      clean.regNumber = v;
      events.push({ field: "Reg number", value: v ?? "cleared" });
    }
  }
  if (patch.vehicleColour !== undefined) {
    const v = patch.vehicleColour?.trim() || null;
    if (v !== (p.vehicleColour ?? null)) { clean.vehicleColour = v; events.push({ field: "Vehicle colour", value: v ?? "cleared" }); }
  }
  if (patch.factoryOptions !== undefined) {
    const v = patch.factoryOptions?.trim() || null;
    if (v !== (p.factoryOptions ?? null)) { clean.factoryOptions = v; events.push({ field: "Factory options", value: v ?? "cleared" }); }
  }
  if (typeof patch.pdiDone === "boolean" && patch.pdiDone !== p.pdiDone) {
    clean.pdiDone = patch.pdiDone;
    events.push({ field: "PDI", value: patch.pdiDone ? "done" : "cleared" });
  }
  if (typeof patch.invoiced === "boolean" && patch.invoiced !== p.invoiced) {
    clean.invoiced = patch.invoiced;
    events.push({ field: "Invoiced", value: patch.invoiced ? "yes" : "cleared" });
  }
  if (typeof patch.itcComplete === "boolean" && patch.itcComplete !== p.itcComplete) {
    clean.itcComplete = patch.itcComplete;
    events.push({ field: "ITC", value: patch.itcComplete ? "complete" : "cleared" });
  }
  if (patch.gapPolicyStatus && ["none", "pending", "complete"].includes(patch.gapPolicyStatus)) {
    if (patch.gapPolicyStatus !== p.gapPolicyStatus) { clean.gapPolicyStatus = patch.gapPolicyStatus; events.push({ field: "GAP policy", value: patch.gapPolicyStatus }); }
  }
  if (patch.gapPolicyNumber !== undefined) {
    const v = patch.gapPolicyNumber?.trim() || null;
    if (v !== (p.gapPolicyNumber ?? null)) { clean.gapPolicyNumber = v; events.push({ field: "GAP policy #", value: v ?? "cleared" }); }
  }
  if (patch.tfpPolicyStatus && ["none", "pending", "complete"].includes(patch.tfpPolicyStatus)) {
    if (patch.tfpPolicyStatus !== p.tfpPolicyStatus) { clean.tfpPolicyStatus = patch.tfpPolicyStatus; events.push({ field: "TFP policy", value: patch.tfpPolicyStatus }); }
  }
  if (patch.tfpPolicyNumber !== undefined) {
    const v = patch.tfpPolicyNumber?.trim() || null;
    if (v !== (p.tfpPolicyNumber ?? null)) { clean.tfpPolicyNumber = v; events.push({ field: "TFP policy #", value: v ?? "cleared" }); }
  }
  if (typeof patch.taxed === "boolean" && patch.taxed !== p.taxed) {
    clean.taxed = patch.taxed;
    events.push({ field: "Taxed", value: patch.taxed ? "yes" : "cleared" });
  }
  if (patch.deliveryNotes !== undefined) {
    const v = patch.deliveryNotes?.trim() || null;
    if (v !== (p.deliveryNotes ?? null)) { clean.deliveryNotes = v; events.push({ field: "Delivery notes", value: v ? "updated" : "cleared" }); }
  }
  if (typeof patch.deliveryPackSubmitted === "boolean" && patch.deliveryPackSubmitted !== p.deliveryPackSubmitted) {
    clean.deliveryPackSubmitted = patch.deliveryPackSubmitted;
    events.push({ field: "Delivery pack to funder", value: patch.deliveryPackSubmitted ? "submitted" : "cleared" });
  }
  if (typeof patch.deliveryDetailsChecked === "boolean" && patch.deliveryDetailsChecked !== p.deliveryDetailsChecked) {
    clean.deliveryDetailsChecked = patch.deliveryDetailsChecked;
    events.push({ field: "Delivery details", value: patch.deliveryDetailsChecked ? "checked" : "cleared" });
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
  invalidateProposals();
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
  // Parallel: customer + proposals + lookup tables. Was sequential — five
  // round-trips reduced to one batched fan-out. Plus the events fetch
  // below used to be N+1 (one query per proposal); now a single inArray.
  const [customerRows, ps, execs, sites] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    db.select().from(proposals).where(eq(proposals.customerId, customerId)).orderBy(asc(proposals.createdAt)),
    cachedSalesExecs(),
    cachedGroupSites(),
  ]);
  const customer = customerRows[0];
  if (!customer) return null;
  const execMap = new Map(execs.map((e) => [e.id, e]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  const proposalIds = ps.map((p) => p.id);
  const allEvents = proposalIds.length > 0
    ? await db.select().from(proposalEvents).where(inArray(proposalEvents.proposalId, proposalIds)).orderBy(asc(proposalEvents.createdAt))
    : [];
  const eventsByProposal = new Map<string, typeof allEvents>();
  for (const ev of allEvents) {
    const arr = eventsByProposal.get(ev.proposalId) ?? [];
    arr.push(ev);
    eventsByProposal.set(ev.proposalId, arr);
  }
  const withEvents = ps.map((p) => ({
    proposal: p,
    exec: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
    groupSite: p.groupSiteId ? siteMap.get(p.groupSiteId) ?? null : null,
    events: eventsByProposal.get(p.id) ?? [],
  }));
  return { customer, items: withEvents };
}

export type Section = "proposals" | "orders";
// Fast path for the awaiting-delivery tracker page. Skips the big
// listProposals fan-out by querying just the awaiting_delivery slice
// directly. Returns the same shape per row (customer / exec / group site
// joined) plus the dealer-fit options and delivery-stage check ticks
// pre-grouped, so the page handler is a thin orchestrator and the
// expensive joins-against-all-statuses path isn't touched.
export async function listAwaitingForTracker() {
  // SELECT only the awaiting_delivery rows — the byStatus index makes this
  // O(log n) instead of "scan ORDER_STATUSES then JS-filter to awaiting".
  const ps = await db
    .select()
    .from(proposals)
    .where(eq(proposals.status, "awaiting_delivery"))
    .orderBy(desc(proposals.updatedAt));

  if (ps.length === 0) {
    return {
      items: [] as Array<Awaited<ReturnType<typeof listProposals>>[number]>,
      ticksByProposal: new Map<string, Set<string>>(),
      dealerFitByProposal: new Map<string, { id: string; label: string; fitted: boolean }[]>(),
      deliveryDefs: [] as Array<{ id: string; label: string; appliesToBq: boolean; sortOrder: number; stage: string; createdAt: Date }>,
    };
  }

  const ids = ps.map((p) => p.id);

  const [execs, custs, sites, defs, ticks, dealerFit] = await Promise.all([
    cachedSalesExecs(),
    cachedCustomers(),
    cachedGroupSites(),
    cachedStageCheckDefs(),
    db.select().from(proposalStageChecks).where(inArray(proposalStageChecks.proposalId, ids)),
    db.select().from(dealerFitOptions).where(inArray(dealerFitOptions.proposalId, ids)).orderBy(asc(dealerFitOptions.sortOrder)),
  ]);

  const execMap = new Map(execs.map((e) => [e.id, e]));
  const custMap = new Map(custs.map((c) => [c.id, c]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  const ticksByProposal = new Map<string, Set<string>>();
  for (const t of ticks) {
    if (!ticksByProposal.has(t.proposalId)) ticksByProposal.set(t.proposalId, new Set());
    ticksByProposal.get(t.proposalId)!.add(t.checkId);
  }

  const dealerFitByProposal = new Map<string, { id: string; label: string; fitted: boolean }[]>();
  for (const o of dealerFit) {
    const list = dealerFitByProposal.get(o.proposalId) ?? [];
    list.push({ id: o.id, label: o.label, fitted: o.fitted });
    dealerFitByProposal.set(o.proposalId, list);
  }

  const items = ps.map((p) => {
    const ticked = ticksByProposal.get(p.id) ?? new Set<string>();
    const applicable = defs.filter((d) => d.stage === "delivery" && (p.isGroupBq ? d.appliesToBq : true));
    const customRemaining = applicable.filter((d) => !ticked.has(d.id)).length;
    return {
      ...p,
      exec: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
      customer: custMap.get(p.customerId) ?? null,
      groupSite: p.groupSiteId ? siteMap.get(p.groupSiteId) ?? null : null,
      customRemaining,
    };
  });

  const deliveryDefs = defs.filter((d) => d.stage === "delivery");
  return { items, ticksByProposal, dealerFitByProposal, deliveryDefs };
}

// Narrow variant of listProposals for /orders, which only renders in_order
// deals. listProposals("orders") pulls in_order + awaiting_delivery +
// delivered together (potentially thousands of rows) just for the page to
// JS-filter down to the in_order slice. This helper uses the byStatus
// index directly — same lookups, same shape per row, much less data.
export async function listInOrderProposals() {
  const ps = await db
    .select()
    .from(proposals)
    .where(eq(proposals.status, "in_order"))
    .orderBy(desc(proposals.updatedAt));

  if (ps.length === 0) return [];

  const [execs, custs, sites, defs, ticks] = await Promise.all([
    cachedSalesExecs(),
    cachedCustomers(),
    cachedGroupSites(),
    cachedStageCheckDefs(),
    db.select().from(proposalStageChecks).where(inArray(proposalStageChecks.proposalId, ps.map((p) => p.id))),
  ]);
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
    // /orders only renders in_order rows so the next-stage checks are
    // always the "order" stage defs.
    const applicable = defs.filter((d) => d.stage === "order" && (p.isGroupBq ? d.appliesToBq : true));
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

export async function listProposals(section?: Section) {
  // Two waves: proposals first (so the ticks query can use their IDs), then
  // four lookups + ticks in parallel. Was six sequential round-trips → two.
  const statuses = section === "orders" ? ORDER_STATUSES : section === "proposals" ? PROPOSAL_SECTION_STATUSES : null;
  const ps = statuses
    ? await db.select().from(proposals).where(inArray(proposals.status, statuses)).orderBy(desc(proposals.updatedAt))
    : await db.select().from(proposals).orderBy(desc(proposals.updatedAt));
  const [execs, custs, sites, defs, ticks] = await Promise.all([
    cachedSalesExecs(),
    cachedCustomers(),
    cachedGroupSites(),
    cachedStageCheckDefs(),
    ps.length
      ? db.select().from(proposalStageChecks).where(inArray(proposalStageChecks.proposalId, ps.map((p) => p.id)))
      : [],
  ]);
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
    // Count remaining checks for the *next* transition: order checks while in_order,
    // delivery checks while awaiting_delivery, none for terminal/other states.
    const stageNeeded = p.status === "in_order" ? "order" : p.status === "awaiting_delivery" ? "delivery" : null;
    const applicable = stageNeeded
      ? defs.filter((d) => d.stage === stageNeeded && (p.isGroupBq ? d.appliesToBq : true))
      : [];
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
  // Three independent reads — execs/customers shared via React cache so a
  // page that calls both getAlerts and getRecentlyDelivered (the home page)
  // only fetches each lookup table once.
  const [ps, execs, custs] = await Promise.all([
    db.select().from(proposals),
    cachedSalesExecs(),
    cachedCustomers(),
  ]);
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
  // Was three sequential SELECTs + scanning every proposal in JS. Now the
  // proposals scan filters to delivered-in-cutoff in SQL, and the lookup
  // tables run in parallel.
  // Push the cutoff into SQL — was scanning every proposal in JS, now
  // the DB only returns recently-delivered rows. NULL `deliveredDetectedAt`
  // values don't satisfy the predicate so they're filtered out for free.
  const [ps, custs, execs] = await Promise.all([
    db.select().from(proposals).where(gte(proposals.deliveredDetectedAt, cutoff)),
    cachedCustomers(),
    cachedSalesExecs(),
  ]);
  const custMap = new Map(custs.map((c) => [c.id, c]));
  const execMap = new Map(execs.map((e) => [e.id, e]));
  // Predicate already applied in SQL — just sort + limit here.
  return ps
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
  // Two waves: proposal lookup, then everything that depends on it in
  // parallel (six round-trips collapsed into one). Was seven sequential
  // queries, ~7× the latency for the order detail page.
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) return null;
  const [custRows, execRows, siteRows, events, defs, ticks] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1),
    p.salesExecId
      ? db.select().from(salesExecs).where(eq(salesExecs.id, p.salesExecId)).limit(1)
      : Promise.resolve([]),
    p.groupSiteId
      ? db.select().from(groupSites).where(eq(groupSites.id, p.groupSiteId)).limit(1)
      : Promise.resolve([]),
    db.select().from(proposalEvents).where(eq(proposalEvents.proposalId, p.id)).orderBy(asc(proposalEvents.createdAt)),
    db.select().from(stageCheckDefs).orderBy(asc(stageCheckDefs.sortOrder), asc(stageCheckDefs.label)),
    db.select().from(proposalStageChecks).where(eq(proposalStageChecks.proposalId, p.id)),
  ]);
  const cust = custRows[0];
  const exec = execRows[0];
  const site = siteRows[0];
  const tickedIds = new Set(ticks.map((t) => t.checkId));
  const customChecks = defs
    .filter((d) => d.stage === "order" && (p.isGroupBq ? d.appliesToBq : true))
    .map((d) => ({ id: d.id, label: d.label, checked: tickedIds.has(d.id) }));
  const deliveryChecks = defs
    .filter((d) => d.stage === "delivery" && (p.isGroupBq ? d.appliesToBq : true))
    .map((d) => ({ id: d.id, label: d.label, checked: tickedIds.has(d.id) }));
  return { proposal: p, customer: cust ?? null, exec: exec ?? null, groupSite: site ?? null, events, customChecks, deliveryChecks };
}
