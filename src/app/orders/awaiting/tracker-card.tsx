"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDealerFitOptionAction,
  changeStatusAction,
  deleteDealerFitOptionAction,
  setDealerFitOptionFittedAction,
  setStageCheckAction,
  updateOrderFieldsAction,
} from "../../proposals/actions";

// All editable fields on the tracker card. Each one commits on blur (text/
// date) or on change (booleans/selects) so the user never has to hit "save".
export interface TrackerCardData {
  id: string;
  // Display-only summary fields
  customerName: string;
  customerId: string;
  businessName: string | null;
  model: string;
  derivative: string;
  funderName: string;
  isGroupBq: boolean;
  execName: string | null;
  isEv: boolean;
  wallboxIncluded: boolean;
  customerSavingGbp: number | null;
  monthlyRental: number;
  financeProposalNumber: string | null;
  locationLabel: string | null;     // current stock location ("Pre-Gate", "Delivered", etc.)
  etaLabel: string | null;          // formatted ETA text from stock match
  // Editable fields
  orderNumber: string | null;
  vin: string | null;
  vehicleColour: string | null;
  factoryOptions: string | null;
  regNumber: string | null;
  pdiDone: boolean;
  financeAgreementSigned: boolean;
  invoiced: boolean;
  itcComplete: boolean;
  taxed: boolean;
  deliveryBookedAt: string | null;  // ISO yyyy-mm-dd
  gapPolicyStatus: "none" | "pending" | "complete";
  gapPolicyNumber: string | null;
  tfpPolicyStatus: "none" | "pending" | "complete";
  tfpPolicyNumber: string | null;
  deliveryNotes: string | null;
  deliveryPackSubmitted: boolean;
  deliveryDetailsChecked: boolean;
  // Custom stage checks loaded server-side
  checks: { id: string; label: string; checked: boolean }[];
  // Dealer-fit options the customer has ordered
  dealerFitOptions: { id: string; label: string; fitted: boolean }[];
}

// Custom delivery checks that overlap with the core toggle cards above are
// hidden so the same thing isn't toggled twice with different effects. Match
// is case-insensitive after stripping punctuation. The labels here mirror
// historical admin-defined check names (Lou's spreadsheet had "PDI + Plates
// pushed", "Invoiced", "Delivery pack submitted to funder" as customs).
const DEDUP_LABELS = new Set([
  "pdi", "pdi plates", "pdi plates pushed", "pdi done",
  "fd", "finance docs", "finance docs signed",
  "invoiced",
  "itc", "itc complete",
  "taxed",
  "delivery pack", "delivery pack submitted", "delivery pack submitted to funder",
  "delivery details checked", "details checked",
]);
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

const POLICY_LABEL = { none: "No", pending: "Yes · pending", complete: "Yes · complete" } as const;

export function TrackerCard({ data, openByDefault = false }: { data: TrackerCardData; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault);
  // Now-five core toggles — completedCount is informational only.
  const completedCount =
    (data.pdiDone ? 1 : 0) + (data.financeAgreementSigned ? 1 : 0) +
    (data.invoiced ? 1 : 0) + (data.itcComplete ? 1 : 0) + (data.taxed ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-slate-900">{data.customerName}</span>
            {data.businessName && data.businessName !== "Not Applicable" && (
              <span className="text-xs text-slate-500">· {data.businessName}</span>
            )}
            {data.isGroupBq && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-800">Group BQ</span>}
            {data.isEv && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">⚡ EV</span>}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            {data.model} {data.derivative}
            <span className="mx-1 text-slate-300">·</span>
            <span className="font-medium text-slate-700">{data.funderName}</span>
            <span className="mx-1 text-slate-300">·</span>
            £{data.monthlyRental.toFixed(2)}/mo
            {data.execName && <><span className="mx-1 text-slate-300">·</span>{data.execName}</>}
          </div>
          {/* ETA tile — Ford location + ETA date prominent on the card so
              the exec doesn't have to expand to see when the vehicle's
              expected. The whole tracker bucket is already date-ordered;
              this lets you eyeball the date inside the bucket too. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {data.etaLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200">
                <span aria-hidden>🚚</span>
                <span>ETA {data.etaLabel}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                ETA TBA
              </span>
            )}
            {data.locationLabel && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                📍 {data.locationLabel}
              </span>
            )}
            {data.deliveryBookedAt && (
              <span className="rounded-md bg-teal-100 px-2 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-200">
                📅 Customer {fmtDateUk(data.deliveryBookedAt)}
              </span>
            )}
            {data.regNumber && (
              <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] font-bold uppercase text-white">{data.regNumber}</span>
            )}
            <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">{completedCount}/5 ✓</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{open ? "Close" : "Open"}</span>
        </div>
      </button>

      {open && <TrackerCardBody data={data} />}
    </div>
  );
}

function TrackerCardBody({ data }: { data: TrackerCardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // commit helpers — narrow patch shape, optimistic in that we just call
  // router.refresh() on success rather than re-querying state into local.
  type FieldPatch = Parameters<typeof updateOrderFieldsAction>[1];
  function commit(patch: FieldPatch) {
    setErr(null);
    start(async () => {
      const res = await updateOrderFieldsAction(data.id, patch);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }
  function toggleCheck(id: string, value: boolean) {
    setErr(null);
    start(async () => {
      const res = await setStageCheckAction(data.id, id, value);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }
  function markDelivered() {
    setErr(null);
    start(async () => {
      const res = await changeStatusAction(data.id, "delivered");
      if (!res.ok) setErr(res.error);
      else if (res.nextPage) router.push(res.nextPage);
    });
  }

  const allChecksDone = data.checks.every((c) => c.checked);
  const canMarkDelivered =
    !!data.deliveryBookedAt &&
    data.deliveryPackSubmitted &&
    data.deliveryDetailsChecked &&
    allChecksDone;

  return (
    <div className="border-t border-slate-100 bg-slate-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Order # + VIN — paired side-by-side as per exec preference. */}
        <Field label="Order number">
          <BlurInput
            initial={data.orderNumber ?? ""}
            placeholder="J0123"
            onCommit={(v) => commit({ orderNumber: v || null })}
            pending={pending}
            uppercase
          />
        </Field>
        <Field label="VIN">
          <BlurInput
            initial={data.vin ?? ""}
            placeholder="WF0xxx (11 chars)"
            onCommit={(v) => commit({ vin: v || null })}
            pending={pending}
            uppercase
          />
        </Field>

        <Field label="Quote / finance prop #">
          <BlurInput
            initial={data.financeProposalNumber ?? ""}
            placeholder="25xxxxxx"
            onCommit={() => { /* finance prop number isn't in updateOrderFields — read only */ }}
            disabled
          />
        </Field>
        <Field label="Reg number">
          <BlurInput
            initial={data.regNumber ?? ""}
            placeholder="AB12CDE"
            onCommit={(v) => commit({ regNumber: v || null })}
            pending={pending}
            uppercase
          />
        </Field>

        <Field label="Vehicle colour" hint="optional">
          <BlurInput
            initial={data.vehicleColour ?? ""}
            placeholder="Agate Black"
            onCommit={(v) => commit({ vehicleColour: v || null })}
            pending={pending}
          />
        </Field>
        <Field label="Factory options" hint="optional">
          <BlurInput
            initial={data.factoryOptions ?? ""}
            placeholder="Winter Pack"
            onCommit={(v) => commit({ factoryOptions: v || null })}
            pending={pending}
          />
        </Field>

        <Field label="Confirmed delivery date">
          <input
            type="date"
            value={data.deliveryBookedAt ?? ""}
            onChange={(e) => commit({ deliveryBookedAt: e.target.value ? new Date(e.target.value) : null })}
            disabled={pending}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums disabled:opacity-50"
          />
        </Field>
        <Field label="Wallbox / customer saving" hint="EV only">
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700">
            {data.isEv
              ? (data.wallboxIncluded
                  ? "Wallbox"
                  : data.customerSavingGbp
                    ? `Customer saving · £${data.customerSavingGbp.toFixed(0)}`
                    : "—")
              : <span className="text-slate-400">Not EV</span>}
          </div>
        </Field>
      </div>

      {/* Core delivery checks — 5 across at desktop, 2 across at mobile.
          Now also includes Taxed (promoted from the old admin custom-check
          list because every delivery needs it). Plus any custom delivery
          checks the admin has defined that DON'T duplicate one of these. */}
      <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <CheckRow label="PDI done" checked={data.pdiDone} onChange={(v) => commit({ pdiDone: v })} disabled={pending} />
        <CheckRow label="Finance docs signed" checked={data.financeAgreementSigned} onChange={(v) => commit({ financeAgreementSigned: v })} disabled={pending} />
        <CheckRow label="Invoiced" checked={data.invoiced} onChange={(v) => commit({ invoiced: v })} disabled={pending} />
        <CheckRow label="Taxed" checked={data.taxed} onChange={(v) => commit({ taxed: v })} disabled={pending} />
        <CheckRow label="ITC complete" checked={data.itcComplete} onChange={(v) => commit({ itcComplete: v })} disabled={pending} />
        {/* Surface remaining custom checks as the same big tile so it all
            reads as a single grid. */}
        {data.checks
          .filter((c) => !DEDUP_LABELS.has(normalizeLabel(c.label)))
          .map((c) => (
            <CheckRow
              key={c.id}
              label={c.label}
              checked={c.checked}
              onChange={(v) => toggleCheck(c.id, v)}
              disabled={pending}
            />
          ))}
      </div>

      {/* Policies — GAP + TF Protect tri-state, with policy number sub-field
          revealed once the customer has actually purchased one. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <Field label="GAP policy">
            <PolicySelect
              value={data.gapPolicyStatus}
              onChange={(v) => commit({ gapPolicyStatus: v })}
              disabled={pending}
            />
          </Field>
          {data.gapPolicyStatus !== "none" && (
            <div className="mt-2">
              <Field label="GAP policy number">
                <BlurInput
                  initial={data.gapPolicyNumber ?? ""}
                  placeholder="From the GAP insurer"
                  onCommit={(v) => commit({ gapPolicyNumber: v || null })}
                  pending={pending}
                />
              </Field>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <Field label="TrustFord Protect">
            <PolicySelect
              value={data.tfpPolicyStatus}
              onChange={(v) => commit({ tfpPolicyStatus: v })}
              disabled={pending}
            />
          </Field>
          {data.tfpPolicyStatus !== "none" && (
            <div className="mt-2">
              <Field label="TFP policy number">
                <BlurInput
                  initial={data.tfpPolicyNumber ?? ""}
                  placeholder="From TFP"
                  onCommit={(v) => commit({ tfpPolicyNumber: v || null })}
                  pending={pending}
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Dealer-fit options — anything we're fitting in-house (tow bar,
          mats, paint protection, etc). Exec adds rows, ticks fitted when
          installed, and can remove a row entirely if the customer changes
          their mind. */}
      <div className="mt-4">
        <DealerFitOptionsEditor proposalId={data.id} initial={data.dealerFitOptions} />
      </div>

      {/* Notes — full-width textarea */}
      <div className="mt-4">
        <Field label="Notes" hint="visible only on this tracker">
          <BlurTextarea
            initial={data.deliveryNotes ?? ""}
            placeholder="Anything to flag for delivery day…"
            onCommit={(v) => commit({ deliveryNotes: v || null })}
            pending={pending}
          />
        </Field>
      </div>

      {/* Footer — mark delivered + link to full proposal page */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <Link
          href={`/orders/${data.id}`}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          Full proposal detail →
        </Link>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-600">{err}</span>}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending || !data.deliveryBookedAt || !allChecksDone}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              !data.deliveryBookedAt
                ? "Set the delivery date first"
                : !allChecksDone
                  ? "Tick all custom checks first"
                  : "Mark this deal as delivered"
            }
          >
            Mark as delivered →
          </button>
        </div>
      </div>

      {confirmOpen && (
        <MarkDeliveredModal
          data={data}
          pending={pending}
          canMark={canMarkDelivered}
          onConfirmPack={(v) => commit({ deliveryPackSubmitted: v })}
          onConfirmDetails={(v) => commit({ deliveryDetailsChecked: v })}
          onMarkDelivered={() => { setConfirmOpen(false); markDelivered(); }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Mark delivered modal — the two-checkbox gate ──────────────────────────

function MarkDeliveredModal({
  data, pending, canMark, onConfirmPack, onConfirmDetails, onMarkDelivered, onClose,
}: {
  data: TrackerCardData;
  pending: boolean;
  canMark: boolean;
  onConfirmPack: (v: boolean) => void;
  onConfirmDetails: (v: boolean) => void;
  onMarkDelivered: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Mark as delivered</h3>
            <p className="mt-0.5 text-xs text-slate-500">{data.customerName} · {data.model} {data.derivative}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-600">
            Both confirmations are required before this deal can move to the Delivered tab.
            Tick each one only after you&apos;ve actually done it.
          </p>
          <label className="flex items-start gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={data.deliveryPackSubmitted}
              disabled={pending}
              onChange={(e) => onConfirmPack(e.currentTarget.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900">Delivery pack submitted to the funder</span>
              <span className="block text-[11px] text-slate-500">Full pack — finance documents, invoice, ITC etc — sent to {data.funderName}.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={data.deliveryDetailsChecked}
              disabled={pending}
              onChange={(e) => onConfirmDetails(e.currentTarget.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900">Delivery details checked before submission</span>
              <span className="block text-[11px] text-slate-500">Reg, VIN, dates, customer info — all reviewed and correct.</span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={onMarkDelivered}
            disabled={!canMark || pending}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Mark as delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small inputs ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        {label}{hint && <span className="ml-1 text-slate-400 italic">({hint})</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function BlurInput({
  initial, onCommit, placeholder, uppercase, disabled, pending,
}: {
  initial: string; onCommit: (v: string) => void; placeholder?: string;
  uppercase?: boolean; disabled?: boolean; pending?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onBlur={() => { if (value !== initial) onCommit(value.trim()); }}
      disabled={disabled || pending}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${uppercase ? "uppercase tabular-nums" : ""}`}
    />
  );
}

function BlurTextarea({
  initial, onCommit, placeholder, pending,
}: { initial: string; onCommit: (v: string) => void; placeholder?: string; pending?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value !== initial) onCommit(value.trim()); }}
      disabled={pending}
      placeholder={placeholder}
      rows={2}
      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function CheckRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700"} ${disabled ? "opacity-50" : "hover:border-slate-400"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} className="h-4 w-4" />
      <span className="font-medium">{label}</span>
    </label>
  );
}

function PolicySelect({ value, onChange, disabled }: { value: "none" | "pending" | "complete"; onChange: (v: "none" | "pending" | "complete") => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "none" | "pending" | "complete")}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-50"
    >
      <option value="none">{POLICY_LABEL.none}</option>
      <option value="pending">{POLICY_LABEL.pending}</option>
      <option value="complete">{POLICY_LABEL.complete}</option>
    </select>
  );
}

// Dealer-fit options — list + add row + per-row fitted toggle + delete.
// Keeps local state for the add input + the option list so the user gets
// immediate feedback; the server actions return ok/error which we react to.
function DealerFitOptionsEditor({
  proposalId,
  initial,
}: {
  proposalId: string;
  initial: { id: string; label: string; fitted: boolean }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [options, setOptions] = useState(initial);
  const [newLabel, setNewLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    setErr(null);
    start(async () => {
      const res = await addDealerFitOptionAction(proposalId, label);
      if (!res.ok) { setErr(res.error); return; }
      setOptions((cur) => [...cur, { id: res.id, label, fitted: false }]);
      setNewLabel("");
      router.refresh();
    });
  }
  function toggleFitted(id: string, fitted: boolean) {
    setOptions((cur) => cur.map((o) => o.id === id ? { ...o, fitted } : o));
    start(async () => {
      const res = await setDealerFitOptionFittedAction(id, fitted);
      if (!res.ok) {
        setErr(res.error);
        // Roll back the optimistic update if the server rejected.
        setOptions((cur) => cur.map((o) => o.id === id ? { ...o, fitted: !fitted } : o));
      } else {
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteDealerFitOptionAction(id);
      if (!res.ok) { setErr(res.error); return; }
      setOptions((cur) => cur.filter((o) => o.id !== id));
      router.refresh();
    });
  }

  const fittedCount = options.filter((o) => o.fitted).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Dealer-fit options</div>
        {options.length > 0 && (
          <div className="text-[10px] font-medium text-slate-500 tabular-nums">{fittedCount}/{options.length} fitted</div>
        )}
      </div>
      {options.length > 0 && (
        <div className="mt-2 grid gap-2 grid-cols-1 sm:grid-cols-2">
          {options.map((o) => (
            <div
              key={o.id}
              className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition ${
                o.fitted ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={o.fitted}
                disabled={pending}
                onChange={(e) => toggleFitted(o.id, e.currentTarget.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className={`flex-1 truncate font-medium ${o.fitted ? "text-emerald-900" : "text-slate-700"}`}>{o.label}</span>
              <button
                type="button"
                onClick={() => remove(o.id)}
                disabled={pending}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-700 disabled:opacity-50"
                aria-label="Remove option"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Add new */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          disabled={pending}
          placeholder="Tow bar, mats, paint protection…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !newLabel.trim()}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      {err && <p className="mt-1 text-[11px] text-rose-700">{err}</p>}
    </div>
  );
}

function fmtDateUk(iso: string) {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${String(y).slice(-2)}`;
}
