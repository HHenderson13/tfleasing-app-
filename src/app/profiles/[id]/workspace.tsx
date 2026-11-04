"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  APPRAISAL_URL, FORD_MODELS, HEAT, LOST_REASONS, PX_FIELDS, addDays, crmText, fieldsShown, filled, fmtDate, isRanger, kindFor, nextContactText,
  panelLayout, pounds, promptsOf, pxEquity, pxText, retiredLines, sectionProgress, sectionsFor, summaryOf, titleOf, topicsFor, ukNow, urgencyOf,
  type Ctx, type DocLine, type FieldValue, type Heat, type ProfileData, type ProfileKind, type ProfileStatus, type SectionDef,
} from "@/lib/customer-profiles";
import type { ProfileDoc, ProfileSnapshot } from "@/lib/customer-profiles-store";
import {
  deleteAppraisalAction, deleteProfileAction, finishAppraisalUploadAction, markCopiedAction, refreshProfileAction, saveProfileDataAction,
  setProfileStatusAction, startAppraisalUploadAction, updateProfileHeaderAction, uploadAppraisalChunkAction,
} from "../actions";
import { CARD, Glyph, HEAT_DOT, Icon, Modal, TONE, copyText } from "../ui";
import { AutoTextarea, FieldControl, Pill } from "./fields";

// The profile an exec works in while they're on the phone (user, 2026-11-04:
// "the most efficient system for a human to use on a sales call"). The front
// page is a summary: who, the agreed next contact, one tile per topic showing
// what's known, and the notes. Tap a tile to fill it in beside the summary
// (full screen on a phone); calls never follow the guide's order, so neither
// does this. Answers save themselves a moment after typing stops.

type SaveState = "saved" | "pending" | "saving" | "error";
const fieldOf = (id: string) => PX_FIELDS.find((f) => f.id === id)!;
const dateOfSec = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const num = (v: FieldValue | undefined) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return typeof v === "string" && v.trim() && Number.isFinite(n) ? n : null; };
const GLYPH: Record<string, string> = { vehicle: "car", why: "chat", business: "building", needs: "route", spec: "tools", charging: "plug", current: "key", terms: "pound", decision: "people" };

export function Workspace({ initial, now: now0, nowMs: nowMs0, canEdit, mine, canStock }: {
  initial: ProfileSnapshot; now: string; nowMs: number; canEdit: boolean; mine: boolean; canStock: boolean;
}) {
  const router = useRouter();
  const id = initial.id;
  const [clock, setClock] = useState({ now: now0, ms: nowMs0 });
  useEffect(() => { const t = setInterval(() => setClock({ now: ukNow(), ms: Date.now() }), 60_000); return () => clearInterval(t); }, []);
  const today = clock.now.slice(0, 10);

  const [name, setName] = useState(initial.customerName);
  const [kind, setKind] = useState<ProfileKind>(initial.kind);
  const [model, setModel] = useState(initial.model);
  const [data, setData] = useState<ProfileData>(initial.data);
  const [status, setStatus] = useState<ProfileStatus>(initial.status);
  const [closed, setClosed] = useState({ at: initial.closedAt, reason: initial.lostReason, note: initial.lostNote });
  const [docs, setDocs] = useState<ProfileDoc[]>(initial.docs);
  const [copied, setCopied] = useState(initial.copied);
  const c: Ctx = { kind, model, data };

  // ── Saving as they go ──
  const [save, setSave] = useState<SaveState>("saved");
  const pending = useRef<Record<string, FieldValue | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const headerPending = useRef<{ customerName?: string; model?: string; kind?: ProfileKind }>({});
  const headerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush(): Promise<void> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inflight.current) await inflight.current;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setSave("saving");
    const run = (async () => {
      let ok = false;
      try { ok = (await saveProfileDataAction(id, patch)).ok; } catch { ok = false; }
      if (ok) {
        setSave(Object.keys(pending.current).length ? "pending" : "saved");
      } else {
        // Keep anything not typed over since, and try again shortly.
        pending.current = { ...patch, ...pending.current };
        setSave("error");
        timer.current = setTimeout(() => void flush(), 4000);
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }

  function set(k: string, v: FieldValue) {
    if (!canEdit) return;
    setData((d) => { const n = { ...d }; if (filled(v)) n[k] = v; else delete n[k]; return n; });
    pending.current[k] = filled(v) ? v : null;
    setSave("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }

  async function flushHeader() {
    if (headerTimer.current) { clearTimeout(headerTimer.current); headerTimer.current = null; }
    const h = headerPending.current;
    if (!Object.keys(h).length) return;
    headerPending.current = {};
    if (h.customerName != null && !h.customerName.trim()) return;
    setSave("saving");
    const r = await updateProfileHeaderAction(id, h).catch(() => ({ ok: false }));
    setSave(r.ok ? "saved" : "error");
  }
  function setHeader(h: { customerName?: string; model?: string; kind?: ProfileKind }, wait = 800) {
    if (!canEdit) return;
    if (h.customerName != null) setName(h.customerName);
    if (h.model != null) setModel(h.model);
    if (h.kind != null) setKind(h.kind);
    headerPending.current = { ...headerPending.current, ...h };
    setSave("pending");
    if (headerTimer.current) clearTimeout(headerTimer.current);
    headerTimer.current = setTimeout(() => void flushHeader(), wait);
  }
  // The exec says personal or business; car or van follows the model (a Ranger is a van here).
  const who = kind === "personal" ? "personal" : "business";
  const setWho = (w: "personal" | "business") => setHeader({ kind: kindFor(w, model) }, 0);
  const setModelText = (m: string) => { const k = kindFor(who, m); setHeader(k === kind ? { model: m } : { model: m, kind: k }); };

  // Pick up the latest from the server on opening (the back button can show an
  // old copy of this page) and whenever the tab comes back into view.
  useEffect(() => {
    let live = true;
    const busy = () => Object.keys(pending.current).length > 0 || !!inflight.current || Object.keys(headerPending.current).length > 0;
    const pull = async () => {
      if (busy()) return;
      const r = await refreshProfileAction(id).catch(() => null);
      if (!live || !r?.ok || !r.profile || busy()) return;
      const p = r.profile;
      setName(p.customerName); setKind(p.kind); setModel(p.model); setData(p.data); setStatus(p.status);
      setClosed({ at: p.closedAt, reason: p.lostReason, note: p.lostNote }); setDocs(p.docs); setCopied(p.copied);
    };
    void pull();
    const onVis = () => { if (document.visibilityState === "visible") void pull(); else { void flush(); void flushHeader(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (busy()) e.preventDefault(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onLeave);
    return () => { live = false; document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onLeave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function go(href: string) {
    await Promise.all([flush(), flushHeader()]);
    router.push(href);
  }

  // ── The topic being filled in: beside the summary on a laptop, full screen on a phone ──
  const topics = topicsFor(kind);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const openSection = open && open !== "px" ? topics.find((s) => s.id === open) ?? null : null;

  // ── Copy for the CRM ──
  const docLines: DocLine[] = docs.map((d) => ({
    createdAt: d.createdAt,
    text: d.kind === "appraisal" ? `Part exchange appraisal received, ${fmtDate(dateOfSec(d.createdAt), today)}` : `${d.title}, ${fmtDate(dateOfSec(d.createdAt), today)}${d.detail ? `: ${d.detail}` : ""}`,
  }));
  const allText = crmText({ kind, model, data, docs: docLines, today });
  const newText = copied ? crmText({ kind, model, data, docs: docLines, since: copied, today }) : null;
  const [toast, setToast] = useState<{ text: string; copied?: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  async function copy(mode: "all" | "new" | string) {
    await Promise.all([flush(), flushHeader()]);
    const section = mode !== "all" && mode !== "new" ? mode : null;
    const text = mode === "all" ? allText : mode === "new" ? newText ?? allText : crmText({ kind, model, data, docs: docLines, only: section!, today });
    if (!text.trim()) { setToast({ text: mode === "new" ? "Nothing new since your last copy" : "Nothing to copy yet" }); return; }
    const ok = await copyText(text);
    if (!ok) { setPreview(text); return; }
    const lines = text.split("\n").filter((l) => l.trim()).length;
    setToast({ text: section ? `Copied ${section === "px" ? "Part exchange" : titleOf(sectionsFor(kind).find((s) => s.id === section)!, kind)}` : `Copied ${lines} line${lines === 1 ? "" : "s"}. Paste it into the CRM.`, copied: text });
    if (!section && canEdit) {
      const snap = { ...data };
      const r = await markCopiedAction(id).catch(() => null);
      if (r?.ok && r.at) setCopied({ data: snap, at: r.at });
    }
  }
  const newCount = newText ? newText.split("\n").filter((l) => l.trim() && !isHeading(l, kind)).length : 0;

  // ── Ordered, lost, back to live, delete. Ordered and lost go back to the customer list. ──
  const [modal, setModal] = useState<"ordered" | "lost" | "delete" | null>(null);
  async function setTo(next: ProfileStatus, reason?: string, note?: string) {
    await Promise.all([flush(), flushHeader()]);
    const r = await setProfileStatusAction(id, next, reason, note).catch(() => ({ ok: false }));
    if (!r.ok) { setToast({ text: "That didn't save. Please try again." }); return; }
    if (next !== "live") { router.push(`/profiles?moved=${id}`); return; }
    setStatus("live");
    setClosed({ at: null, reason: null, note: null });
    setToast({ text: `${name} is live again` });
  }

  const u = status === "live" ? urgencyOf(data, clock.now) : null;
  const heat = data.heat as Heat | undefined;
  const ranger = isRanger(model);

  const notes = (
    <NotesCard kind={kind} data={data} set={set} canEdit={canEdit} onCopy={() => void copy("notes")} />
  );
  const editor = open === "px" ? (
    <Panel title="Part exchange" glyphTone="teal" icon={<Icon name="swap" className="h-4 w-4" />} onClose={() => setOpen(null)} onCopy={() => void copy("px")}>
      <fieldset disabled={!canEdit} className="min-w-0">
        <PartExchange profileId={id} data={data} set={set} kind={kind} today={today} appraisals={docs.filter((d) => d.kind === "appraisal")} canEdit={canEdit}
          onAdd={(d) => setDocs((l) => [d, ...l])} onRemove={(fid) => setDocs((l) => l.filter((d) => d.id !== fid))} onToast={(t) => setToast({ text: t })} />
      </fieldset>
    </Panel>
  ) : openSection ? (
    <TopicEditor s={openSection} c={c} set={set} today={today} canEdit={canEdit} onClose={() => setOpen(null)} onCopy={() => void copy(openSection.id)}
      extra={openSection.id === "terms" && canStock && model.trim() ? <StockLink model={model} /> : undefined} />
  ) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-16">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1360px] items-center gap-3 px-4 sm:px-6">
          <Link href="/profiles" className="flex shrink-0 items-center gap-1 text-[14px] font-medium text-slate-600 transition hover:text-slate-900"
            onClick={(e) => { e.preventDefault(); void go("/profiles"); }}>
            <Icon name="back" />Customers
          </Link>
          <span className="h-5 w-px shrink-0 bg-slate-200" />
          <span className="min-w-0 truncate text-[14px] font-semibold text-slate-900">{name}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SaveBadge state={canEdit ? save : null} />
            {newText != null && newCount > 0 && (
              <button type="button" onClick={() => void copy("new")} title="Only what's new or changed since you last copied"
                className="hidden h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 lg:flex">
                Copy what&apos;s new<span className="rounded-full bg-emerald-100 px-1.5 text-[11.5px] font-semibold tabular-nums text-emerald-800">{newCount}</span>
              </button>
            )}
            <button type="button" onClick={() => void copy("all")}
              className="hidden h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 lg:flex">
              <Icon name="copy" />Copy for CRM
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1360px] px-4 pt-5 sm:px-6 sm:pt-6">
        {!canEdit && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900 ring-1 ring-inset ring-sky-200">
            <Icon name="person" className="h-4 w-4 shrink-0 text-sky-700" />
            {`This is ${initial.ownerName}'s customer. You can read everything here; only ${initial.ownerName} or a manager can change it.`}
          </div>
        )}
        {canEdit && !mine && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-slate-100 px-4 py-3 text-[13.5px] text-slate-700">
            <Icon name="person" className="h-4 w-4 shrink-0 text-slate-600" />
            {`${initial.ownerName}'s customer. You're editing as a manager.`}
          </div>
        )}
        {status !== "live" && (
          <div className={`mb-4 flex flex-col gap-3 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${status === "ordered" ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 ring-1 ring-inset ring-slate-200"}`}>
            <div className={`text-[15px] font-semibold ${status === "ordered" ? "text-emerald-900" : "text-slate-900"}`}>
              {status === "ordered" ? "Ordered" : "Lost sale"}{closed.at ? ` on ${fmtDate(dateOfSec(closed.at), today)}` : ""}
              {status === "lost" && closed.reason ? `: ${closed.reason}` : ""}
              {status === "lost" && closed.note && <span className="block text-[13px] font-normal text-slate-600">{closed.note}</span>}
            </div>
            {canEdit && (
              <button type="button" onClick={() => void setTo("live")}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-[13px] font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                <Icon name="undo" />Move back to live
              </button>
            )}
          </div>
        )}

        {/* ── Who, and the agreed next contact ── */}
        <fieldset disabled={!canEdit} className="min-w-0">
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <input value={name} onChange={(e) => setHeader({ customerName: e.target.value })} aria-label="Customer name" placeholder="Customer name"
                  className="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-900 transition hover:border-slate-200 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[28px]" />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <div role="radiogroup" aria-label="Personal or business" className="flex rounded-lg bg-slate-100 p-0.5">
                    {(["personal", "business"] as const).map((w) => (
                      <button key={w} type="button" role="radio" aria-checked={who === w} onClick={() => setWho(w)}
                        className={`h-7 rounded-md px-2.5 text-[12.5px] font-medium transition ${who === w ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                        {w === "personal" ? "Personal" : "Business"}
                      </button>
                    ))}
                  </div>
                  <input value={model} onChange={(e) => setModelText(e.target.value)} list="ford-models-ws" aria-label="Model they're interested in" placeholder="Model"
                    className="h-8 w-40 rounded-lg border border-slate-200 bg-white px-2.5 text-[13.5px] font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-500 hover:border-slate-300 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
                  <datalist id="ford-models-ws">{FORD_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
                  <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
                  <div className="flex gap-1">
                    {HEAT.map((h) => (
                      <button key={h} type="button" aria-pressed={heat === h} onClick={() => set("heat", heat === h ? "" : h)}
                        className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition ${heat === h ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                        <span className={`h-2 w-2 rounded-full ${HEAT_DOT[h]}`} />{h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {status === "live" && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setModal("ordered")}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 md:flex-none">
                    <Icon name="check" />Ordered
                  </button>
                  <button type="button" onClick={() => setModal("lost")}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-[13.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50 md:flex-none">
                    <Icon name="x" />Lost sale
                  </button>
                </div>
              )}
            </div>
            <NextContact data={data} today={today} u={u} set={set} />
          </section>
        </fieldset>

        {/* Phones and tablets: the notes come straight after, always to hand. */}
        <div className="mt-4 lg:hidden">{notes}</div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── The summary: one tile per topic ── */}
          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topics.map((s) => <Tile key={s.id} s={s} c={c} today={today} on={open === s.id} onOpen={() => setOpen(open === s.id ? null : s.id)} />)}
              <PxTile data={data} today={today} on={open === "px"} appraisal={docs.some((d) => d.kind === "appraisal")} onOpen={() => setOpen(open === "px" ? null : "px")} />
              <ToolTile title="Fuel cost" icon="bolt" tone="lime" about="Petrol or diesel against electric, filled in from here." docs={docs.filter((d) => d.kind === "fuel")} today={today}
                onOpen={() => void go(`/fuel-calculator?profile=${id}`)} />
              {ranger && (
                <ToolTile title="Ranger BIK" icon="truck" tone="blue" about="Car or van tax for every Ranger, with their seats and tax rate filled in." docs={docs.filter((d) => d.kind === "ranger")} today={today}
                  onOpen={() => void go(`/ranger-bik?profile=${id}`)} />
              )}
            </div>
            {canEdit && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={() => setModal("delete")} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-slate-600 transition hover:bg-rose-50 hover:text-rose-700">
                  <Icon name="trash" className="h-3.5 w-3.5" />Delete this profile
                </button>
              </div>
            )}
          </div>

          {/* ── Beside it on a laptop: the notes, or the topic being filled in ── */}
          <aside className="hidden lg:block">
            <div key={open ?? "notes"} className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-2xl [scrollbar-width:thin]">{editor ?? notes}</div>
          </aside>
        </div>
      </div>

      {/* Phone: the topic fills the screen. */}
      {editor && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-50 p-3 lg:hidden">{editor}</div>
      )}

      {/* Phone: copy always in reach. */}
      {!editor && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex gap-2">
            {newText != null && newCount > 0 && (
              <button type="button" onClick={() => void copy("new")} className="h-11 flex-1 rounded-xl text-[14px] font-medium text-slate-800 ring-1 ring-inset ring-slate-300">
                What&apos;s new ({newCount})
              </button>
            )}
            <button type="button" onClick={() => void copy("all")} className="flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white">
              <Icon name="copy" />Copy for CRM
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[14px] text-white shadow-xl">
            <Icon name="check" className="h-4 w-4 text-emerald-400" />
            <span>{toast.text}</span>
            {toast.copied && <button type="button" onClick={() => { setPreview(toast.copied!); setToast(null); }} className="font-semibold text-emerald-300 hover:text-emerald-200">See it</button>}
          </div>
        </div>
      )}
      {preview != null && (
        <Modal title="Notes for the CRM" onClose={() => setPreview(null)} wide>
          <p className="mb-3 text-[13px] text-slate-600">{`Everything except their name, personal or business, and the model, which the CRM already has.`}</p>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-[13.5px] leading-6 text-slate-800 ring-1 ring-inset ring-slate-200">{preview}</pre>
          <button type="button" onClick={async () => { if (await copyText(preview)) { setPreview(null); setToast({ text: "Copied" }); } }}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800">
            <Icon name="copy" />Copy
          </button>
        </Modal>
      )}
      {modal === "ordered" && (
        <Modal title="Mark as ordered?" onClose={() => setModal(null)}>
          <p className="text-[14px] leading-6 text-slate-600">{`${name} moves to Ordered and off your live list. You can move it back at any time.`}</p>
          <button type="button" onClick={() => void setTo("ordered")} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-[14px] font-semibold text-white hover:bg-emerald-700">
            <Icon name="check" />Mark as ordered
          </button>
        </Modal>
      )}
      {modal === "lost" && <LostModal name={name} onClose={() => setModal(null)} onSave={(r, n) => void setTo("lost", r, n)} />}
      {modal === "delete" && (
        <Modal title="Delete this profile?" onClose={() => setModal(null)}>
          <p className="text-[14px] leading-6 text-slate-600">{`Every note on ${name} goes, along with any appraisal uploaded here. Fuel and Ranger PDFs stay in their Saved comparisons. This can't be undone; if it's just a lost sale, use Lost sale instead.`}</p>
          <button type="button" onClick={async () => { const r = await deleteProfileAction(id); if (r.ok) router.push("/profiles"); }}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-[14px] font-semibold text-white hover:bg-rose-700">
            <Icon name="trash" />Delete for good
          </button>
        </Modal>
      )}
    </div>
  );
}

const isHeading = (l: string, kind: ProfileKind) =>
  ["Part exchange", "Documents"].includes(l) || sectionsFor(kind).some((s) => titleOf(s, kind) === l);

function SaveBadge({ state }: { state: SaveState | null }) {
  if (!state) return <span className="hidden items-center gap-1.5 text-[12.5px] text-slate-600 sm:flex">Read only</span>;
  const s = {
    saved: { t: "Saved", c: "text-slate-600", dot: "bg-emerald-500" },
    pending: { t: "Saving", c: "text-slate-600", dot: "bg-amber-400" },
    saving: { t: "Saving", c: "text-slate-600", dot: "bg-amber-400 animate-pulse" },
    error: { t: "Not saved, retrying", c: "text-rose-700", dot: "bg-rose-500" },
  }[state];
  return <span className={`flex items-center gap-1.5 text-[12.5px] font-medium ${s.c}`} aria-live="polite"><span className={`h-2 w-2 rounded-full ${s.dot}`} /><span className={state === "error" ? "" : "hidden sm:inline"}>{s.t}</span></span>;
}

/**
 * What's been agreed for the next contact: "ring me back tomorrow at 10am" is
 * three taps (Call, Tomorrow, 10am), and it folds away to the sentence once
 * the day and time are in. It decides where the customer sits in the list and
 * is the first line copied for the CRM.
 */
function NextContact({ data, today, u, set }: { data: ProfileData; today: string; u: ReturnType<typeof urgencyOf> | null; set: (k: string, v: FieldValue) => void }) {
  const how = typeof data.contactBy === "string" ? data.contactBy : "";
  const day = typeof data.callbackDate === "string" ? data.callbackDate : "";
  const time = typeof data.callbackTime === "string" ? data.callbackTime : "";
  const said = nextContactText(data, today);
  const [editing, setEditing] = useState(false);
  const showPicker = editing || !day;
  const days: [string, string][] = [["Today", today], ["Tomorrow", addDays(today, 1)], ["Next week", addDays(today, 7)]];
  const times: [string, string][] = [["9am", "09:00"], ["10am", "10:00"], ["12pm", "12:00"], ["2pm", "14:00"], ["4pm", "16:00"]];
  const overdue = u?.tier === 0 && !!said;
  // Stays open while it's being filled in; once the day and time are both in,
  // that's the agreement, so it folds away to the sentence.
  const pickDay = (d: string) => { const next = day === d ? "" : d; set("callbackDate", next); setEditing(!(next && time)); };
  const pickTime = (t: string) => { const next = time === t ? "" : t; set("callbackTime", next); setEditing(!(next && day)); };
  const box = "h-7 rounded-lg border border-slate-300 bg-white px-1.5 text-[12.5px] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10";
  return (
    <div className={`border-t px-5 py-3 sm:px-6 ${overdue ? "border-rose-100 bg-rose-50/60" : "border-orange-100 bg-orange-50/50"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${overdue ? "text-rose-800" : "text-orange-900"}`}>
          <Icon name="clock" className="h-4 w-4" />Next contact
        </span>
        {!showPicker && said ? (
          <>
            <span className={`text-[15px] font-semibold ${overdue ? "text-rose-800" : "text-slate-900"}`}>{said}{overdue ? ", overdue" : ""}</span>
            <button type="button" onClick={() => setEditing(true)} className="text-[12.5px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">Change</button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {["Call", "Text", "Email"].map((h) => <Pill key={h} small on={how === h} onClick={() => set("contactBy", how === h ? "" : h)}>{h}</Pill>)}
            <span className="mx-1 h-4 w-px bg-orange-200" />
            {days.map(([l, d]) => <Pill key={l} small on={day === d} onClick={() => pickDay(d)}>{l}</Pill>)}
            <input type="date" value={day} onChange={(e) => pickDay(e.target.value)} aria-label="Next contact day" className={`${box} w-[8.5rem]`} />
            <span className="mx-1 h-4 w-px bg-orange-200" />
            {times.map(([l, t]) => <Pill key={l} small on={time === t} onClick={() => pickTime(t)}>{l}</Pill>)}
            <input type="time" value={time} onChange={(e) => pickTime(e.target.value)} aria-label="Next contact time" className={`${box} w-[6.5rem]`} />
            {day && <button type="button" onClick={() => setEditing(false)} className="ml-1 h-7 rounded-lg bg-slate-900 px-2.5 text-[12.5px] font-semibold text-white">Done</button>}
          </div>
        )}
        {(how || day || time) && (
          <button type="button" onClick={() => { set("contactBy", ""); set("callbackDate", ""); set("callbackTime", ""); setEditing(false); }}
            className="ml-auto text-[12.5px] font-medium text-slate-600 hover:text-slate-900">Clear</button>
        )}
      </div>
    </div>
  );
}

function Tile({ s, c, today, on, onOpen }: { s: SectionDef; c: Ctx; today: string; on: boolean; onOpen: () => void }) {
  const p = sectionProgress(s, c);
  const sum = summaryOf(s, c, today, 4);
  const t = TONE[s.tone];
  const glyph = s.id === "vehicle" && c.kind === "business_van" ? "van" : GLYPH[s.id] ?? "note";
  return (
    <button type="button" onClick={onOpen} aria-expanded={on}
      className={`${CARD} group flex min-h-[132px] flex-col p-4 text-left transition hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.16),0_8px_20px_-12px_rgba(15,23,42,0.25)] ${on ? "!shadow-[0_0_0_2px_rgba(15,23,42,0.9)]" : ""}`}>
      <div className="flex w-full items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${t.solid}`}><Glyph name={glyph} className="h-4 w-4" /></span>
        <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-slate-900">{titleOf(s, c.kind)}</h3>
        <Count answered={p.answered} total={p.total} />
      </div>
      {sum.rows.length ? (
        <div className="mt-3 w-full">
          {/* Labels as wide as this tile's longest, so they line up and the answers get the rest. */}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] leading-5">
            {sum.rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="max-w-[8rem] truncate text-slate-600">{k}</dt>
                <dd className="truncate font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {sum.more > 0 && <div className="mt-1 text-[12.5px] font-medium text-slate-600">{`+${sum.more} more`}</div>}
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-slate-600">{sum.ask.join(" · ")}</p>
      )}
    </button>
  );
}

/** How much of a topic is answered: "2/5", the same width everywhere so nothing beside it moves. */
function Count({ answered, total }: { answered: number; total: number }) {
  return (
    <span className={`w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums ${total && answered === total ? "text-emerald-700" : answered ? "text-slate-600" : "text-slate-500"}`}
      aria-label={`${answered} of ${total} answered`}>
      {answered}/{total}
    </span>
  );
}

function PxTile({ data, today, on, appraisal, onOpen }: { data: ProfileData; today: string; on: boolean; appraisal: boolean; onOpen: () => void }) {
  const text = pxText(data, today);
  return (
    <button type="button" onClick={onOpen} aria-expanded={on}
      className={`${CARD} flex min-h-[132px] flex-col p-4 text-left transition hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.16),0_8px_20px_-12px_rgba(15,23,42,0.25)] ${on ? "!shadow-[0_0_0_2px_rgba(15,23,42,0.9)]" : ""}`}>
      <div className="flex w-full items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${TONE.teal.solid}`}><Icon name="swap" className="h-4 w-4" /></span>
        <h3 className="flex-1 text-[14.5px] font-semibold text-slate-900">Part exchange</h3>
        {appraisal && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11.5px] font-semibold text-teal-700">Appraisal in</span>}
      </div>
      <p className={`mt-3 text-[13px] leading-5 ${text ? "font-medium text-slate-900" : "text-slate-600"}`}>{text ?? "Do they have one? Reg, mileage, CitNOW appraisal"}</p>
    </button>
  );
}

function ToolTile({ title, icon, tone, about, docs, today, onOpen }: {
  title: string; icon: string; tone: "lime" | "blue"; about: string; docs: ProfileDoc[]; today: string; onOpen: () => void;
}) {
  return (
    <div className={`${CARD} flex min-h-[132px] flex-col p-4`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${TONE[tone].solid}`}><Icon name={icon} className="h-4 w-4" /></span>
        <h3 className="flex-1 text-[14.5px] font-semibold text-slate-900">{title}</h3>
      </div>
      {docs.length ? (
        <ul className="mt-3 space-y-1">
          {docs.slice(0, 2).map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[13px] leading-5">
              <a href={d.href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">{d.detail ?? d.title}</a>
              <span className="shrink-0 text-[12px] text-slate-600">{fmtDate(dateOfSec(d.createdAt), today)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-slate-600">{about}</p>
      )}
      <div className="mt-auto pt-3">
        <button type="button" onClick={onOpen}
          className="flex h-9 items-center justify-center gap-1 rounded-xl px-3 text-[13px] font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50">
          {title === "Fuel cost" ? "Open the calculator" : "Open Ranger BIK"}<Icon name="chevron" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Panel({ title, icon, glyphTone, onClose, onCopy, progress, children }: {
  title: string; icon: ReactNode; glyphTone: keyof typeof TONE; onClose: () => void; onCopy?: () => void; progress?: ReactNode; children: ReactNode;
}) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${TONE[glyphTone].solid}`}>{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-[15.5px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {progress ?? <span className="w-9 shrink-0" />}
        <CopyButton onClick={() => onCopy?.()} disabled={!onCopy} />
        <button type="button" onClick={onClose} className="h-8 shrink-0 rounded-lg bg-slate-900 px-3 text-[13px] font-semibold text-white hover:bg-slate-800">Done</button>
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function TopicEditor({ s, c, set, today, canEdit, onClose, onCopy, extra }: {
  s: SectionDef; c: Ctx; set: (k: string, v: FieldValue) => void; today: string; canEdit: boolean; onClose: () => void; onCopy: () => void; extra?: ReactNode;
}) {
  const p = sectionProgress(s, c);
  const glyph = s.id === "vehicle" && c.kind === "business_van" ? "van" : GLYPH[s.id] ?? "note";
  return (
    <Panel title={titleOf(s, c.kind)} glyphTone={s.tone} icon={<Glyph name={glyph} className="h-4 w-4" />} onClose={onClose} onCopy={p.answered ? onCopy : undefined}
      progress={<Count answered={p.answered} total={p.total} />}>
      <fieldset disabled={!canEdit} className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-5">
        {panelLayout(fieldsShown(s, c), c.kind).map(({ f, half }) => (
          <FieldControl key={f.id} f={f} kind={c.kind} value={c.data[f.id]} onChange={(v) => set(f.id, v)} today={today} half={half} />
        ))}
      </fieldset>
      {extra && <div className="mt-4">{extra}</div>}
    </Panel>
  );
}

function NotesCard({ kind, data, set, canEdit, onCopy }: { kind: ProfileKind; data: ProfileData; set: (k: string, v: FieldValue) => void; canEdit: boolean; onCopy: () => void }) {
  const s = sectionsFor(kind).find((x) => x.id === "notes")!;
  const prompts = promptsOf(s, kind);
  const value = typeof data.otherNotes === "string" ? data.otherNotes : "";
  const earlier = retiredLines(data);
  const add = (p: string) => { const t = value.replace(/\s+$/, ""); set("otherNotes", `${t}${t ? "\n" : ""}${p}: `); };
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${TONE.slate.solid}`}><Glyph name="note" className="h-4 w-4" /></span>
        <h2 className="flex-1 text-[15.5px] font-semibold tracking-tight text-slate-900">Notes</h2>
        {(value.trim() || earlier.length > 0) && <CopyButton onClick={onCopy} />}
      </div>
      <fieldset disabled={!canEdit} className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {prompts.map((p) => (
            <button key={p} type="button" onClick={() => add(p)}
              className="h-7 rounded-full bg-white px-2.5 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">+ {p}</button>
          ))}
        </div>
        <AutoTextarea value={value} onChange={(v) => set("otherNotes", v)} placeholder="Anything from the call, as it comes up" label="Notes" minRows={8} />
      </fieldset>
      {earlier.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-slate-600">
          <div className="mb-1 font-semibold text-slate-700">From before</div>
          {earlier.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
    </section>
  );
}

/** A span, not a button, so it still works on a profile you can only read (the fieldset disables real buttons). Copying is reading. */
function CopyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <span role="button" tabIndex={disabled ? -1 : 0} aria-label="Copy this for the CRM" aria-disabled={disabled} title="Copy this for the CRM"
      onClick={() => { if (!disabled) onClick(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); onClick(); } }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${disabled ? "text-slate-500" : "cursor-pointer text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
      <Icon name="copy" />
    </span>
  );
}

/** The Stock tab, searching for the model, in a new tab so the profile stays open on the call. Just a link. */
function StockLink({ model }: { model: string }) {
  const q = model.replace(/^ford\s+/i, "").trim();
  return (
    <a href={`/stock?q=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer"
      className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
      {`Check stock for ${q}`}<Icon name="external" className="h-3.5 w-3.5" />
    </a>
  );
}

function DocList({ docs, today, onRemove, canEdit }: { docs: ProfileDoc[]; today: string; onRemove?: (d: ProfileDoc) => void; canEdit?: boolean }) {
  if (!docs.length) return null;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-inset ring-slate-200">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 bg-white px-3.5 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><Icon name="doc" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-slate-900">{d.detail ?? d.title}</div>
            <div className="text-[12px] text-slate-600">{fmtDate(dateOfSec(d.createdAt), today)}</div>
          </div>
          <a href={d.href} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Open</a>
          {onRemove && canEdit && (
            <button type="button" onClick={() => onRemove(d)} aria-label={`Remove ${d.filename}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700">
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function PartExchange({ profileId, data, set, kind, today, appraisals, canEdit, onAdd, onRemove, onToast }: {
  profileId: string; data: ProfileData; set: (k: string, v: FieldValue) => void; kind: ProfileKind; today: string; appraisals: ProfileDoc[]; canEdit: boolean;
  onAdd: (d: ProfileDoc) => void; onRemove: (id: string) => void; onToast: (t: string) => void;
}) {
  const has = data.pxHas;
  const value = num(data.pxValue);
  const settle = num(data.pxSettlement);
  const sent = typeof data.pxLinkSent === "string" ? data.pxLinkSent : "";
  const [up, setUp] = useState<{ name: string; pct: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setErr(null);
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setErr("That isn't a PDF. The appraisal comes through as a PDF."); return; }
    setUp({ name: file.name, pct: 0 });
    try {
      const s = await startAppraisalUploadAction({ profileId, filename: /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`, size: file.size });
      if (!s.ok || !s.fileId || !s.chunks || !s.chunkBytes) throw new Error(s.error ?? "Couldn't start the upload.");
      for (let i = 0; i < s.chunks; i++) {
        const fd = new FormData();
        fd.set("fileId", s.fileId);
        fd.set("seq", String(i));
        fd.set("chunk", file.slice(i * s.chunkBytes, (i + 1) * s.chunkBytes));
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) ok = (await uploadAppraisalChunkAction(fd).catch(() => ({ ok: false }))).ok;
        if (!ok) throw new Error("The upload stopped part way. Please try again.");
        setUp({ name: file.name, pct: Math.round(((i + 1) / s.chunks) * 100) });
      }
      const f = await finishAppraisalUploadAction(s.fileId);
      if (!f.ok || !f.doc) throw new Error(f.error ?? "Couldn't save the appraisal.");
      onAdd(f.doc);
      onToast("Appraisal saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload that file.");
    } finally {
      setUp(null);
    }
  }

  const step = (n: number, done: boolean, title: string, body: ReactNode) => (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${done ? "bg-teal-700 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"}`}>
        {done ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900">{title}</div>
        <div className="mt-2">{body}</div>
      </div>
    </li>
  );

  return (
    <div>
      <FieldControl f={fieldOf("pxHas")} kind={kind} value={data.pxHas} onChange={(v) => set("pxHas", v)} today={today} />
      {has !== "No" && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5">
            <FieldControl f={fieldOf("pxReg")} kind={kind} value={data.pxReg} onChange={(v) => set("pxReg", typeof v === "string" ? v.toUpperCase() : v)} today={today} half />
            <FieldControl f={fieldOf("pxMileage")} kind={kind} value={data.pxMileage} onChange={(v) => set("pxMileage", v)} today={today} half />
          </div>
          <ol className="relative mt-5 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-slate-200">
            {step(1, !!sent, "Send them the CitNOW appraisal", (
              <div className="flex flex-wrap items-center gap-2">
                <a href={APPRAISAL_URL} target="_blank" rel="noreferrer"
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12.5px] font-semibold text-white hover:bg-slate-800">
                  Open it<Icon name="external" className="h-3.5 w-3.5" />
                </a>
                <button type="button" onClick={async () => { if (await copyText(APPRAISAL_URL)) { onToast("Appraisal link copied, ready to text or email"); if (!sent) set("pxLinkSent", today); } }}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <Icon name="link" className="h-3.5 w-3.5" />Copy link
                </button>
                <Pill small on={!!sent} onClick={() => set("pxLinkSent", sent ? "" : today)}>{sent ? `Sent ${fmtDate(sent, today)}` : "Mark as sent"}</Pill>
              </div>
            ))}
            {step(2, appraisals.length > 0, "The appraisal PDF", (
              <div className="space-y-2">
                <DocList docs={appraisals} today={today} canEdit={canEdit}
                  onRemove={async (d) => { if ((await deleteAppraisalAction(d.id)).ok) onRemove(d.id); }} />
                <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && canEdit) void upload(f); }}
                  className={`rounded-xl border-2 border-dashed px-3 py-3 text-center transition ${drag ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50/60"}`}>
                  {up ? (
                    <div>
                      <div className="truncate text-[12.5px] font-medium text-slate-700">{`Uploading ${up.name}`}</div>
                      <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${up.pct}%` }} /></div>
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-slate-600">
                      Drop it here, or{" "}
                      <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">choose the file</button>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
                </div>
                {err && <p className="text-[12.5px] text-rose-700">{err}</p>}
              </div>
            ))}
            {step(3, value != null, "The valuation", (
              <div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <FieldControl f={fieldOf("pxValue")} kind={kind} value={data.pxValue} onChange={(v) => set("pxValue", v)} today={today} half />
                  <FieldControl f={fieldOf("pxSettlement")} kind={kind} value={data.pxSettlement} onChange={(v) => set("pxSettlement", v)} today={today} half />
                  <FieldControl f={fieldOf("pxValidUntil")} kind={kind} value={data.pxValidUntil} onChange={(v) => set("pxValidUntil", v)} today={today} plain />
                </div>
                {value != null && settle != null && settle > 0 && (() => {
                  const eq = pxEquity(value, settle);
                  return (
                    <div className={`mt-3 flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 ${eq >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                      <span className="text-[12.5px]">{`${pounds(value)} less ${pounds(settle)}`}</span>
                      <span className="text-[15px] font-semibold tabular-nums">{eq >= 0 ? `${pounds(eq)} equity` : `${pounds(-eq)} negative equity`}</span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function LostModal({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Lost sale" onClose={onClose}>
      <p className="text-[14px] leading-6 text-slate-600">{`Why did ${name} not go ahead? It moves to Lost sales, where you can find it again or move it back.`}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {LOST_REASONS.map((r) => <Pill key={r} on={reason === r} onClick={() => setReason(reason === r ? "" : r)}>{r}</Pill>)}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything worth remembering (optional)"
        className="mt-4 w-full resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14px]" />
      <button type="button" disabled={!reason} onClick={() => onSave(reason, note)}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
        Move to Lost sales
      </button>
    </Modal>
  );
}
