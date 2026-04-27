"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { changeStatusAction, listFundersForConfigAction, reproposeAction } from "../../proposals/actions";
import { PROPOSAL_STATUSES, STATUS_LABELS, TERMINAL_STATUSES, statusColor, statusLabel, type ProposalStatus } from "@/lib/proposal-constants";
import { SalesExecPicker } from "@/components/sales-exec-picker";
import { DealEditor, CancelDealButton } from "@/components/deal-editor";

type Proposal = {
  id: string;
  model: string;
  derivative: string;
  contract: string;
  maintenance: string;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  funderId: string;
  funderName: string;
  funderRank: number;
  financeProposalNumber: string | null;
  monthlyRental: number;
  status: string;
  underwritingNotes: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isBroker: boolean;
  brokerName: string | null;
  brokerEmail: string | null;
  isGroupBq: boolean;
  orderNumber: string | null;
  vin: string | null;
};
type Event = {
  id: number;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
};
type Item = {
  proposal: Proposal;
  exec: { id: string; name: string; email: string } | null;
  groupSite: { id: string; name: string } | null;
  events: Event[];
};

// Transitions available from the Proposals view (excludes order-stage moves).
const PROPOSAL_TRANSITIONS: ProposalStatus[] = ["proposal_received", "accepted", "declined", "referred_to_dealer", "referred_to_underwriter"];

export function CustomerTimeline({ items, customerId: _customerId, declinedCount, execs }: { items: Item[]; customerId: string; declinedCount: number; execs: { id: string; name: string }[] }) {
  return (
    <div className="space-y-6">
      {declinedCount >= 3 && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <span className="font-medium">Three declines recorded.</span> This is a lost sale — mark any remaining open proposal as lost.
        </div>
      )}
      {items.map((it) => (
        <ProposalCard key={it.proposal.id} item={it} declinedCount={declinedCount} execs={execs} />
      ))}
    </div>
  );
}

function ProposalCard({ item, declinedCount, execs }: { item: Item; declinedCount: number; execs: { id: string; name: string }[] }) {
  const { proposal: p, exec, groupSite, events } = item;
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReferDealer, setShowReferDealer] = useState(false);
  const [underwritingNote, setUnderwritingNote] = useState("");
  const [showNotEligible, setShowNotEligible] = useState(false);
  const [notEligibleNote, setNotEligibleNote] = useState("");
  const [showLostSale, setShowLostSale] = useState(false);
  const [lostSaleNote, setLostSaleNote] = useState("");
  const [showRepropose, setShowRepropose] = useState(false);
  const status = p.status as ProposalStatus;
  const c = statusColor(status);
  const isTerminal = (TERMINAL_STATUSES as ProposalStatus[]).includes(status);

  const canReproposeAfterDecline = status === "declined" && p.funderRank < 3 && declinedCount < 3;

  function changeStatus(to: ProposalStatus, note?: string) {
    setError(null);
    start(async () => {
      const res = await changeStatusAction(p.id, to, note);
      if (!res.ok) setError(res.error);
      else { setShowReferDealer(false); setUnderwritingNote(""); }
    });
  }
  function submitReferDealer() {
    if (!underwritingNote.trim()) { setError("Underwriting details are required."); return; }
    changeStatus("referred_to_dealer", underwritingNote);
  }
  function submitNotEligible() {
    if (!notEligibleNote.trim()) { setError("A reason is required."); return; }
    start(async () => {
      const res = await changeStatusAction(p.id, "not_eligible", notEligibleNote);
      if (!res.ok) { setError(res.error); return; }
      setShowNotEligible(false); setNotEligibleNote("");
    });
  }
  function submitLostSale() {
    start(async () => {
      const res = await changeStatusAction(p.id, "lost_sale", lostSaleNote.trim() || undefined);
      if (!res.ok) { setError(res.error); return; }
      setShowLostSale(false); setLostSaleNote("");
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
              {statusLabel(status)}
            </span>
            <span className="text-xs text-slate-400">Funder rank #{p.funderRank} of 3</span>
            {p.financeProposalNumber && (
              <span className="font-mono text-[11px] text-slate-500">FP {p.financeProposalNumber}</span>
            )}
            {(status === "in_order" || status === "awaiting_delivery") && (
              <Link href={`/orders/${p.id}`} className="text-[11px] font-medium text-blue-600 hover:underline">
                Open in Orders →
              </Link>
            )}
          </div>
          <div className="mt-1.5 text-base font-semibold text-slate-900">{p.model} {p.derivative}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {p.funderName} · £{p.monthlyRental.toFixed(2)}/mo · {p.contract} {p.maintenance === "maintained" ? "maintained" : "customer maint."} · {p.termMonths}m / {p.annualMileage.toLocaleString()}mi / {p.initialRentalMultiplier}×
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <DealEditor
              proposalId={p.id}
              initialModel={p.model}
              initialDerivative={p.derivative}
              initialOrderNumber={p.orderNumber}
              initialVin={p.vin}
              showVehicleIds={!p.isGroupBq}
            />
            {!isTerminal && <CancelDealButton proposalId={p.id} currentStatus={p.status} />}
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Assigned to</div>
          {p.isGroupBq ? (
            <>
              <div className="font-medium text-slate-700">Group BQ Deal</div>
              {groupSite && <div className="text-slate-400">{groupSite.name}</div>}
            </>
          ) : (
            <>
              <SalesExecPicker proposalId={p.id} execs={execs} currentId={exec?.id ?? null} />
              {exec && <div className="mt-0.5 text-slate-400">{exec.email}</div>}
            </>
          )}
          {p.isBroker && (
            <div className="mt-1 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
              Broker · {p.brokerName}
            </div>
          )}
        </div>
      </header>

      {p.underwritingNotes && (
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900">
          <div className="font-medium">Underwriting details requested</div>
          <div className="mt-0.5 whitespace-pre-wrap">{p.underwritingNotes}</div>
        </div>
      )}

      {!isTerminal && (
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        {PROPOSAL_TRANSITIONS.filter((s) => s !== p.status).map((s) => {
          if (s === "referred_to_dealer") {
            return (
              <button
                key={s}
                onClick={() => setShowReferDealer((v) => !v)}
                className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
              >
                → {STATUS_LABELS[s]}
              </button>
            );
          }
          return (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              → {STATUS_LABELS[s]}
            </button>
          );
        })}

        {status === "accepted" && (
          <button
            onClick={() => changeStatus("in_order")}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            → Move to order stage
          </button>
        )}

        {canReproposeAfterDecline && (
          <button
            onClick={() => setShowRepropose(true)}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            Log next funder…
          </button>
        )}

        <button
          onClick={() => setShowNotEligible((v) => !v)}
          className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-xs font-medium text-orange-800 hover:bg-orange-50"
        >
          → Not eligible
        </button>
        <button
          onClick={() => setShowLostSale((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          → Lost sale
        </button>
      </div>
      )}

      {showReferDealer && (
        <div className="space-y-2 border-t border-slate-100 bg-amber-50/40 px-5 py-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-amber-900">Underwriting details requested</span>
            <textarea
              value={underwritingNote}
              onChange={(e) => setUnderwritingNote(e.target.value)}
              rows={3}
              placeholder="e.g. Three months of bank statements, signed director's guarantee…"
              className="w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={submitReferDealer} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">
              Refer to dealer
            </button>
            <button onClick={() => { setShowReferDealer(false); setUnderwritingNote(""); setError(null); }} className="text-xs text-slate-500 hover:text-slate-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showNotEligible && (
        <div className="space-y-2 border-t border-slate-100 bg-orange-50/40 px-5 py-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-orange-900">Why is this not eligible?</span>
            <textarea
              value={notEligibleNote}
              onChange={(e) => setNotEligibleNote(e.target.value)}
              rows={3}
              placeholder="e.g. Customer does not meet minimum trading history requirement."
              className="w-full rounded-md border border-orange-200 bg-white px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={submitNotEligible} className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700">
              Mark not eligible
            </button>
            <button onClick={() => { setShowNotEligible(false); setNotEligibleNote(""); setError(null); }} className="text-xs text-slate-500 hover:text-slate-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showLostSale && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">Reason (optional)</span>
            <textarea
              value={lostSaleNote}
              onChange={(e) => setLostSaleNote(e.target.value)}
              rows={2}
              placeholder="e.g. Customer bought elsewhere."
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={submitLostSale} className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900">
              Mark lost sale
            </button>
            <button onClick={() => { setShowLostSale(false); setLostSaleNote(""); setError(null); }} className="text-xs text-slate-500 hover:text-slate-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>}

      <div className="border-t border-slate-100 px-5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Timeline</div>
        <ol className="mt-2 space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-xs">
              <span className="w-32 shrink-0 text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
              <span className="flex-1">
                {e.kind === "created" && <span className="text-slate-700">Proposal created</span>}
                {e.kind === "status_change" && (
                  <span className="text-slate-700">
                    {e.fromStatus ? statusLabel(e.fromStatus) : "—"}
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{e.toStatus ? statusLabel(e.toStatus) : "—"}</span>
                  </span>
                )}
                {e.kind === "note" && <span className="text-slate-700">Note</span>}
                {e.note && <div className="mt-0.5 text-slate-500">{e.note}</div>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {showRepropose && (
        <ReproposeModal
          proposalId={p.id}
          currentFunderId={p.funderId}
          nextRank={p.funderRank + 1}
          onClose={() => setShowRepropose(false)}
          onError={setError}
        />
      )}
    </section>
  );
}

function ReproposeModal({
  proposalId, currentFunderId, nextRank, onClose, onError,
}: {
  proposalId: string;
  currentFunderId: string;
  nextRank: number;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [funders, setFunders] = useState<{ id: string; name: string; rank: number; monthly: number }[] | null>(null);
  const [funderId, setFunderId] = useState("");
  const [fpn, setFpn] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFundersForConfigAction(proposalId).then((rows) => {
      if (cancelled) return;
      const available = rows.filter((r) => r.id !== currentFunderId);
      setFunders(available);
      const nextBest = available.find((r) => r.rank === nextRank) ?? available[0];
      setFunderId(nextBest?.id ?? "");
    });
    return () => { cancelled = true; };
  }, [proposalId, currentFunderId, nextRank]);

  function submit() {
    setLocalError(null);
    if (!funderId) { setLocalError("Pick a funder."); return; }
    if (!fpn.trim()) { setLocalError("Finance Proposal Number is required."); return; }
    start(async () => {
      const res = await reproposeAction({ parentProposalId: proposalId, funderId, financeProposalNumber: fpn });
      if (!res.ok) { onError(res.error); onClose(); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Log proposal with another funder</div>
          <div className="mt-0.5 text-xs text-slate-500">Attempt #{nextRank} of 3</div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Funder</span>
            {funders === null ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">Loading…</div>
            ) : funders.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No other funders have a rate for this configuration.
              </div>
            ) : (
              <select value={funderId} onChange={(e) => setFunderId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {funders.map((f) => (
                  <option key={f.id} value={f.id}>
                    #{f.rank} {f.name} · £{f.monthly.toFixed(2)}/mo
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Finance Proposal Number</span>
            <input
              value={fpn}
              onChange={(e) => setFpn(e.target.value)}
              placeholder="e.g. FP-00012345"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>

          {localError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{localError}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">Cancel</button>
          <button
            onClick={submit}
            disabled={pending || funders === null || funders.length === 0}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Log proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Keep the symbol used to avoid unused imports when types change.
void PROPOSAL_STATUSES;
