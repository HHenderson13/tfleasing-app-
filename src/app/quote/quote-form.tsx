"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDerivativesAction, listGroupSitesAction, listSalesExecsAction, quoteAction, saveProposalAction } from "./actions";
import type { QuoteResult } from "@/lib/quote";

const TERMS = [24, 36, 48];
const MILEAGES = [5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000];
const UPFRONTS = [1, 3, 6, 9, 12];
const RANKING_UPFRONT = 6;

export function QuoteForm({ models }: { models: string[] }) {
  const [contract, setContract] = useState<"PCH" | "BCH">("PCH");
  const [maintenance, setMaintenance] = useState<"customer" | "maintained">("customer");
  const [model, setModel] = useState(models[0] ?? "");
  const [derivatives, setDerivatives] = useState<string[]>([]);
  const [derivative, setDerivative] = useState("");
  const [term, setTerm] = useState(36);
  const [mileage, setMileage] = useState(10000);
  const [upfront, setUpfront] = useState(6);
  const [wallbox, setWallbox] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!model) return;
    getDerivativesAction(model).then((d) => {
      setDerivatives(d);
      setDerivative(d[0] ?? "");
    });
  }, [model]);

  const canQuote = !!(model && derivative);
  const reqId = useRef(0);

  useEffect(() => {
    if (!canQuote) return;
    const myId = ++reqId.current;
    start(async () => {
      const r = await quoteAction({
        contract,
        maintenance,
        model,
        derivative,
        termMonths: term,
        annualMileage: mileage,
        initialRentalMultiplier: RANKING_UPFRONT,
        wallbox,
      });
      if (myId === reqId.current) setResult(r);
    });
  }, [canQuote, contract, maintenance, model, derivative, term, mileage, wallbox]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
      <div className="space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
        <div className="space-y-3">
          <Segmented
            label="Contract"
            value={contract}
            onChange={(v) => setContract(v as "PCH" | "BCH")}
            options={[
              { value: "PCH", label: "PCH", hint: "inc. VAT" },
              { value: "BCH", label: "BCH", hint: "ex. VAT" },
            ]}
          />
          <Segmented
            label="Maintenance"
            value={maintenance}
            onChange={(v) => setMaintenance(v as "customer" | "maintained")}
            options={[
              { value: "customer", label: "Customer" },
              { value: "maintained", label: "Maintained" },
            ]}
          />
        </div>

        <div className="space-y-3">
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              {models.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </Field>

          <Field label="Derivative">
            <select value={derivative} onChange={(e) => setDerivative(e.target.value)} className={inputCls}>
              {derivatives.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <PillPicker label="Term (months)" value={term} options={TERMS} onChange={setTerm} />
          <PillPicker label="Mileage per year" value={mileage} options={MILEAGES} onChange={setMileage} format={(v) => v.toLocaleString()} />
          <PillPicker label="Initial rental (months)" value={upfront} options={UPFRONTS} onChange={setUpfront} />
          <div className="text-[11px] text-slate-400">Funders ranked at 6× upfront; your selection is saved on the proposal.</div>
        </div>

        {result?.wallboxAvailable && (
          <Segmented
            label="EV incentive"
            value={wallbox ? "wallbox" : "saving"}
            onChange={(v) => setWallbox(v === "wallbox")}
            options={[
              { value: "saving", label: "Customer saving" },
              { value: "wallbox", label: "Wallbox" },
            ]}
          />
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${pending ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
          {pending ? "Updating…" : "Live — changes apply instantly"}
        </div>
      </div>

      <div>
        <Results
          result={result}
          pending={pending}
          config={{ contract, maintenance, termMonths: term, annualMileage: mileage, initialRentalMultiplier: upfront }}
        />
      </div>
    </div>
  );
}

type QuoteConfig = {
  contract: "PCH" | "BCH";
  maintenance: "customer" | "maintained";
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
};

function Results({ result, pending, config }: { result: QuoteResult | null; pending: boolean; config: QuoteConfig }) {
  const router = useRouter();
  const [saveFor, setSaveFor] = useState<{ funderId: string; funderName: string; rank: number; monthlyRental: number } | null>(null);

  if (!result) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center">
        <div className="text-sm font-medium text-slate-500">No quote yet</div>
        <div className="text-xs text-slate-400">Pick a vehicle and press &ldquo;Rank funders&rdquo; to see monthly rentals across all funders.</div>
      </div>
    );
  }
  if (!result.funders.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <div className="font-medium">No funder has a rate for this configuration.</div>
          <div className="mt-1 text-xs text-amber-800">Discount % is still shown below — get a manual quote from each funder, then save the winner.</div>
        </div>
        {result.missing.length > 0 && (
          <MissingFundersList
            missing={result.missing}
            ratedCount={0}
            onPick={(funderId, funderName, rank, monthlyRental) =>
              setSaveFor({ funderId, funderName, rank, monthlyRental })
            }
          />
        )}
        {saveFor && (
          <SaveProposalModal
            result={result}
            config={config}
            funder={saveFor}
            onClose={() => setSaveFor(null)}
            onSaved={(r) => { setSaveFor(null); router.push(`/customers/${r.customerId}`); }}
          />
        )}
      </div>
    );
  }

  const best = result.funders[0];

  return (
    <div className={`space-y-4 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">{result.model}</div>
            <div className="text-lg font-semibold text-slate-900">{result.derivative}</div>
            {result.discountLabel && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                Profile: {result.discountLabel}
              </div>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            {typeof result.listPriceNet === "number" && (
              <div className="text-slate-400">List <span className="font-medium text-slate-700">£{result.listPriceNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            )}
            {result.grantText && <div className="text-emerald-600">{result.grantText}</div>}
            {result.wallboxIncluded ? (
              <div className="font-medium text-emerald-700">Wallbox Included</div>
            ) : typeof result.customerSavingGbp === "number" && (
              <div>Customer saving <span className="font-medium text-slate-700">£{result.customerSavingGbp}</span></div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Best funder</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{best.funderName}</div>
          </div>
          {result.funders.length > 1 && (
            <div className="text-right text-xs text-slate-500">
              <div className="text-slate-400">{result.funders.length} funders returned rates</div>
            </div>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {result.funders.map((f) => {
          const isBest = f.rank === 1;
          return (
            <li
              key={f.funderId}
              className={`flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition ${
                isBest ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                isBest ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"
              }`}>
                {f.rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{f.funderName}</span>
                  {isBest && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Best</span>}
                  {f.novunaChipPct > 0 && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                      Includes {(f.novunaChipPct * 100).toFixed(2)}% chip
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {f.discountPct != null ? `${(f.discountPct * 100).toFixed(2)}% discount` : "discount n/a"}
                  <span className="mx-1.5 text-slate-300">·</span>
                  £{f.commissionGbp} commission
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  {isBest ? (
                    <>
                      <div className="text-lg font-semibold tabular-nums text-emerald-700">Cheapest</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">rank #1</div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold tabular-nums text-slate-900">+£{(f.totalMonthly - best.totalMonthly).toFixed(2)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">/ month vs #1</div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setSaveFor({ funderId: f.funderId, funderName: f.funderName, rank: f.rank, monthlyRental: f.totalMonthly })}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Save proposal
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {result.missing.length > 0 && (
        <MissingFundersList
          missing={result.missing}
          ratedCount={result.funders.length}
          onPick={(funderId, funderName, rank, monthlyRental) =>
            setSaveFor({ funderId, funderName, rank, monthlyRental })
          }
        />
      )}

      {saveFor && (
        <SaveProposalModal
          result={result}
          config={config}
          funder={saveFor}
          onClose={() => setSaveFor(null)}
          onSaved={(r) => { setSaveFor(null); router.push(`/customers/${r.customerId}`); }}
        />
      )}
    </div>
  );
}

function SaveProposalModal({
  result, config, funder, onClose, onSaved,
}: {
  result: QuoteResult;
  config: QuoteConfig;
  funder: { funderId: string; funderName: string; rank: number; monthlyRental: number };
  onClose: () => void;
  onSaved: (r: { customerId: string; customerName: string }) => void;
}) {
  const [pending, start] = useTransition();
  const [execs, setExecs] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [sites, setSites] = useState<{ id: string; name: string; kind: "car" | "cv" }[] | null>(null);
  const [salesExecId, setSalesExecId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [financeProposalNumber, setFinanceProposalNumber] = useState("");
  const [isBroker, setIsBroker] = useState(false);
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [isGroupBq, setIsGroupBq] = useState(false);
  const [bqKind, setBqKind] = useState<"car" | "cv">("car");
  const [groupSiteId, setGroupSiteId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSalesExecsAction(), listGroupSitesAction()]).then(([execRows, siteRows]) => {
      if (cancelled) return;
      setExecs(execRows);
      setSalesExecId(execRows[0]?.id ?? "");
      setSites(siteRows);
    });
    return () => { cancelled = true; };
  }, []);

  const sitesForKind = sites?.filter((s) => s.kind === bqKind) ?? null;
  useEffect(() => {
    if (!sitesForKind) return;
    if (!sitesForKind.some((s) => s.id === groupSiteId)) {
      setGroupSiteId(sitesForKind[0]?.id ?? "");
    }
  }, [bqKind, sitesForKind, groupSiteId]);

  function submit() {
    setError(null);
    if (!customerName.trim()) { setError("Customer name is required."); return; }
    if (!financeProposalNumber.trim()) { setError("Finance Proposal Number is required."); return; }
    if (isGroupBq) {
      if (!groupSiteId) { setError("Pick a group site for this BQ deal."); return; }
    } else {
      if (!salesExecId) { setError("Assign a sales exec."); return; }
    }
    if (isBroker) {
      if (!brokerName.trim()) { setError("Broker name is required."); return; }
      if (!brokerEmail.trim()) { setError("Broker email is required."); return; }
    }
    start(async () => {
      const res = await saveProposalAction({
        customerName: customerName.trim(),
        salesExecId: isGroupBq ? null : salesExecId,
        capCode: result.capCode,
        model: result.model,
        derivative: result.derivative,
        contract: config.contract,
        maintenance: config.maintenance,
        termMonths: config.termMonths,
        annualMileage: config.annualMileage,
        initialRentalMultiplier: config.initialRentalMultiplier,
        funderId: funder.funderId,
        funderName: funder.funderName,
        funderRank: funder.rank,
        monthlyRental: funder.monthlyRental,
        financeProposalNumber: financeProposalNumber.trim(),
        isBroker,
        brokerName: isBroker ? brokerName.trim() : null,
        brokerEmail: isBroker ? brokerEmail.trim() : null,
        isGroupBq,
        groupSiteId: isGroupBq ? groupSiteId : null,
        isEv: result.wallboxAvailable,
        wallboxIncluded: result.wallboxIncluded,
        customerSavingGbp: result.wallboxIncluded ? null : (result.customerSavingGbp ?? null),
      });
      if (!res.ok) { setError(res.error); return; }
      onSaved({ customerId: res.customerId, customerName: customerName.trim() });
    });
  }

  const noExecs = execs !== null && execs.length === 0;
  const noSites = sitesForKind !== null && sitesForKind.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Save proposal</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{result.model} {result.derivative}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {funder.funderName} (rank #{funder.rank}) · £{funder.monthlyRental.toFixed(2)}/mo · {config.contract} {config.maintenance === "maintained" ? "maintained" : "customer maint."} · {config.termMonths}m / {config.annualMileage.toLocaleString()}mi / {config.initialRentalMultiplier}×
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Customer name</span>
            <input
              autoFocus
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. John Smith"
              className={inputCls}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Finance Proposal Number</span>
            <input
              value={financeProposalNumber}
              onChange={(e) => setFinanceProposalNumber(e.target.value)}
              placeholder="e.g. FP-00012345"
              className={inputCls}
            />
          </label>

          <YesNo label="Broker deal?" value={isBroker} onChange={setIsBroker} />
          {isBroker && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Broker name</span>
                <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="e.g. Acme Broker Ltd" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Broker email</span>
                <input type="email" value={brokerEmail} onChange={(e) => setBrokerEmail(e.target.value)} placeholder="deals@acmebroker.com" className={inputCls} />
              </label>
            </div>
          )}

          <YesNo label="Group BQ deal?" value={isGroupBq} onChange={setIsGroupBq} />

          {isGroupBq ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Site type</span>
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs">
                  {(["car", "cv"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBqKind(k)}
                      className={`rounded-lg px-3 py-1 font-medium ${bqKind === k ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      {k === "car" ? "Car" : "CV"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{bqKind === "car" ? "Car" : "CV"} site</span>
                {sitesForKind === null ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">Loading…</div>
                ) : noSites ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No {bqKind === "car" ? "car" : "CV"} sites yet. <Link href="/admin/group-sites" className="font-medium underline">Add one →</Link>
                  </div>
                ) : (
                  <select value={groupSiteId} onChange={(e) => setGroupSiteId(e.target.value)} className={inputCls}>
                    {sitesForKind.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <span className="mt-1 block text-[11px] text-slate-400">Auto-assigned to Group BQ Deal — no sales exec.</span>
              </label>
            </div>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Assign to sales exec</span>
              {execs === null ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">Loading…</div>
              ) : noExecs ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No sales execs yet. <Link href="/admin/sales-execs" className="font-medium underline">Add one →</Link>
                </div>
              ) : (
                <select value={salesExecId} onChange={(e) => setSalesExecId(e.target.value)} className={inputCls}>
                  {execs.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.email}</option>)}
                </select>
              )}
            </label>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">Cancel</button>
          <button
            onClick={submit}
            disabled={pending || execs === null || sites === null || (isGroupBq ? noSites : noExecs)}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MissingFundersList({
  missing, ratedCount, onPick,
}: {
  missing: QuoteResult["missing"];
  ratedCount: number;
  onPick: (funderId: string, funderName: string, rank: number, monthlyRental: number) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const parsed = parseFloat(raw);
  const valid = Number.isFinite(parsed) && parsed > 0;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">No ratebook data — manually check</div>
        <div className="text-[11px] text-amber-700">{missing.length} funder{missing.length === 1 ? "" : "s"}</div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {missing.map((m, i) => {
          const open = openId === m.funderId;
          return (
            <li key={m.funderId} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-slate-800">{m.funderName}</span>
                  <span className="text-slate-600">
                    {m.discountPct != null ? (
                      <>Target discount <span className="font-semibold tabular-nums text-slate-900">{(m.discountPct * 100).toFixed(2)}%</span></>
                    ) : (
                      <span className="text-slate-400">discount n/a</span>
                    )}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">£{m.commissionGbp} comm.</span>
                </div>
                {!open && (
                  <button
                    type="button"
                    onClick={() => { setOpenId(m.funderId); setRaw(""); }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Save proposal
                  </button>
                )}
              </div>
              {open && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-amber-100 pt-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">£</span>
                    <input
                      autoFocus
                      inputMode="decimal"
                      placeholder="monthly"
                      value={raw}
                      onChange={(e) => setRaw(e.target.value)}
                      className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 pl-5 text-xs tabular-nums shadow-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!valid}
                    onClick={() => onPick(m.funderId, m.funderName, ratedCount + i + 1, parsed)}
                    className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:bg-slate-300"
                  >
                    Save proposal
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div>
      {label && <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {o.label}
            {o.hint && <span className={`ml-1 text-[10px] ${value === o.value ? "text-slate-400" : "text-slate-400"}`}>{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function PillPicker<T extends number>({
  label, value, options, onChange, format,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-full px-3 py-1 text-xs font-medium tabular-nums transition ${
              value === o
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
            }`}
          >
            {format ? format(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {[
          { v: false, label: "No" },
          { v: true, label: "Yes" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              value === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-0";
