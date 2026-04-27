"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction, setStageCheckAction, updateOrderFieldsAction } from "../../proposals/actions";
import { STATUS_LABELS, statusColor, statusLabel, type ProposalStatus } from "@/lib/proposal-constants";
import { SalesExecPicker } from "@/components/sales-exec-picker";
import { CancelDealButton, DealEditor } from "@/components/deal-editor";

type P = {
  id: string;
  status: string;
  funderId: string;
  funderName: string;
  funderRank: number;
  financeProposalNumber: string | null;
  model: string;
  derivative: string;
  contract: string;
  maintenance: string;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  monthlyRental: number;
  acceptedAt: string | null;
  chipConfirmed: boolean;
  motorCompleteSigned: boolean;
  financeAgreementSigned: boolean;
  orderNumber: string | null;
  vin: string | null;
  isBroker: boolean;
  brokerName: string | null;
  brokerEmail: string | null;
  isGroupBq: boolean;
  groupSiteName: string | null;
  isEv: boolean;
  wallboxIncluded: boolean;
  customerSavingGbp: number | null;
};

type CustomCheck = { id: string; label: string; checked: boolean };

export function OrderDetail({ proposal, exec, execs, customChecks }: { proposal: P; exec: { id: string; name: string; email: string } | null; execs: { id: string; name: string }[]; customChecks: CustomCheck[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState(proposal.orderNumber ?? "");
  const [vin, setVin] = useState(proposal.vin ?? "");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const status = proposal.status as ProposalStatus;
  const c = statusColor(status);
  const isNovuna = proposal.funderId === "novuna";
  const isAld = proposal.funderId === "ald";
  const isBq = proposal.isGroupBq;

  const countdown = useMemo(() => {
    if (isAld) return null;
    if (!proposal.acceptedAt) return null;
    const accepted = new Date(proposal.acceptedAt).getTime();
    const deadline = accepted + 30 * 24 * 60 * 60 * 1000;
    const diffMs = deadline - now;
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return { days, deadline: new Date(deadline) };
  }, [proposal.acceptedAt, now, isAld]);

  const hasVehicleDetails = !!(proposal.orderNumber || proposal.vin);
  const allCustomChecked = customChecks.every((c) => c.checked);
  const readyForDelivery =
    (!isNovuna || proposal.chipConfirmed) &&
    (isBq || proposal.motorCompleteSigned) &&
    (isAld || proposal.financeAgreementSigned) &&
    (isBq || hasVehicleDetails) &&
    allCustomChecked;

  function setCheck(field: "chipConfirmed" | "motorCompleteSigned" | "financeAgreementSigned", value: boolean) {
    setError(null);
    start(async () => {
      const res = await updateOrderFieldsAction(proposal.id, { [field]: value });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function setCustomCheck(checkId: string, value: boolean) {
    setError(null);
    start(async () => {
      const res = await setStageCheckAction(proposal.id, checkId, value);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function saveVehicleDetails() {
    setError(null);
    start(async () => {
      const res = await updateOrderFieldsAction(proposal.id, {
        orderNumber: orderNumber.trim() || null,
        vin: vin.trim() || null,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function moveToDelivery() {
    setError(null);
    start(async () => {
      const res = await changeStatusAction(proposal.id, "awaiting_delivery");
      if (!res.ok) setError(res.error);
      else if (res.nextPage) router.push(res.nextPage);
      else router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
            {statusLabel(status)}
          </span>
          <span className="text-xs text-slate-400">Funder #{proposal.funderRank}</span>
          {proposal.financeProposalNumber && <span className="font-mono text-[11px] text-slate-500">FP {proposal.financeProposalNumber}</span>}
          {proposal.isEv && (
            proposal.wallboxIncluded ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">EV · Wallbox</span>
            ) : proposal.customerSavingGbp ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">EV · £{proposal.customerSavingGbp.toFixed(0)} saving</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">EV</span>
            )
          )}
          <div className="ml-auto flex items-center gap-2">
            <DealEditor
              proposalId={proposal.id}
              initialModel={proposal.model}
              initialDerivative={proposal.derivative}
              initialOrderNumber={proposal.orderNumber}
              initialVin={proposal.vin}
              showVehicleIds={!isBq}
            />
            <CancelDealButton proposalId={proposal.id} currentStatus={proposal.status} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-slate-500 md:grid-cols-4">
          <div><div className="text-[10px] uppercase tracking-wide">Funder</div><div className="mt-0.5 text-sm text-slate-900">{proposal.funderName}</div></div>
          <div><div className="text-[10px] uppercase tracking-wide">Monthly</div><div className="mt-0.5 text-sm text-slate-900 tabular-nums">£{proposal.monthlyRental.toFixed(2)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wide">Config</div><div className="mt-0.5 text-sm text-slate-900">{proposal.contract} {proposal.maintenance === "maintained" ? "maintained" : "customer"} · {proposal.termMonths}m / {proposal.annualMileage.toLocaleString()}mi / {proposal.initialRentalMultiplier}×</div></div>
          <div>
            <div className="text-[10px] uppercase tracking-wide">{isBq ? "Assigned to" : "Sales exec"}</div>
            {isBq ? (
              <>
                <div className="mt-0.5 text-sm text-slate-900">Group BQ Deal</div>
                {proposal.groupSiteName && <div className="text-[11px] text-slate-400">{proposal.groupSiteName}</div>}
              </>
            ) : (
              <>
                <div className="mt-0.5">
                  <SalesExecPicker proposalId={proposal.id} execs={execs} currentId={exec?.id ?? null} />
                </div>
                {exec && <div className="mt-0.5 text-[11px] text-slate-400">{exec.email}</div>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Order checks</h2>
        <p className="mt-0.5 text-xs text-slate-500">All required items must be confirmed before moving to awaiting delivery.</p>

        <div className="mt-4 space-y-2">
          {isNovuna && (
            <CheckRow
              label="Novuna chip has been done"
              hint="Required for Novuna-funded deals only"
              checked={proposal.chipConfirmed}
              onChange={(v) => setCheck("chipConfirmed", v)}
            />
          )}
          {!isBq && (
            <CheckRow
              label="MotorComplete order signed"
              checked={proposal.motorCompleteSigned}
              onChange={(v) => setCheck("motorCompleteSigned", v)}
            />
          )}
          {!isAld && (
            <CheckRow
              label="Signed finance agreement received"
              hint={countdown ? <CountdownHint days={countdown.days} deadline={countdown.deadline} /> : undefined}
              checked={proposal.financeAgreementSigned}
              onChange={(v) => setCheck("financeAgreementSigned", v)}
            />
          )}
          {customChecks.map((c) => (
            <CheckRow
              key={c.id}
              label={c.label}
              checked={c.checked}
              onChange={(v) => setCustomCheck(c.id, v)}
            />
          ))}
        </div>
      </div>

      {!isBq && (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Vehicle details</h2>
        <p className="mt-0.5 text-xs text-slate-500">Enter an order number and/or VIN. At least one is required to move to awaiting delivery.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Order number</span>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="e.g. ORD-123456"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">VIN</span>
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="17-character VIN"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={saveVehicleDetails}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Save vehicle details
          </button>
          {(proposal.orderNumber || proposal.vin) && (
            <span className="text-[11px] text-slate-500">Saved: {proposal.orderNumber ? `Order ${proposal.orderNumber}` : ""}{proposal.orderNumber && proposal.vin ? " · " : ""}{proposal.vin ? `VIN ${proposal.vin}` : ""}</span>
          )}
        </div>
      </div>
      )}

      {(proposal.isBroker || isBq) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Deal source</h2>
          <div className="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
            {isBq && (
              <div>
                <div className="text-[10px] uppercase tracking-wide">Group BQ site</div>
                <div className="mt-0.5 text-sm text-slate-900">{proposal.groupSiteName ?? "—"}</div>
              </div>
            )}
            {proposal.isBroker && (
              <div>
                <div className="text-[10px] uppercase tracking-wide">Broker</div>
                <div className="mt-0.5 text-sm text-slate-900">{proposal.brokerName ?? "—"}</div>
                {proposal.brokerEmail && <div className="text-[11px] text-slate-400">{proposal.brokerEmail}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {status === "in_order" && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm font-medium text-slate-900">Ready to move to awaiting delivery?</div>
            <div className="text-xs text-slate-500">
              {readyForDelivery ? "All checks complete." : "Complete all checks and vehicle details above first."}
            </div>
          </div>
          <button
            onClick={moveToDelivery}
            disabled={!readyForDelivery}
            className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          >
            → Awaiting delivery
          </button>
        </div>
      )}

      {status === "awaiting_delivery" && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          This deal is awaiting delivery.
        </div>
      )}
    </div>
  );
}

function CheckRow({
  label, hint, checked, onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
    </label>
  );
}

function CountdownHint({ days, deadline }: { days: number; deadline: Date }) {
  const deadlineStr = deadline.toLocaleDateString();
  if (days < 0) return <span className="font-medium text-red-600">Overdue by {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} (deadline {deadlineStr})</span>;
  if (days === 0) return <span className="font-medium text-red-600">Due today ({deadlineStr})</span>;
  if (days <= 7) return <span className="font-medium text-amber-700">{days} day{days === 1 ? "" : "s"} remaining (by {deadlineStr})</span>;
  return <span>{days} days remaining (by {deadlineStr})</span>;
}
