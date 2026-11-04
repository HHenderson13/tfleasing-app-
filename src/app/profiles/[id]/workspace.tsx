"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  APPRAISAL_URL, FORD_MODELS, HEAT, KIND_LABEL, LOST_REASONS, PX_FIELDS, addDays, crmText, fieldsShown, filled, fmtDate, fuelPrefillOf, hintOf, isRanger,
  navTitleOf, nextContactText, pounds, promptsOf, pxEquity, rangerPrefillOf, sectionProgress, sectionsFor, titleOf, ukNow, urgencyOf,
  type DocLine, type FieldValue, type Heat, type ProfileData, type ProfileKind, type ProfileStatus, type SectionDef, type Tone,
} from "@/lib/customer-profiles";
import { rangerById } from "@/lib/ranger-tax";
import type { ProfileDoc, ProfileSnapshot } from "@/lib/customer-profiles-store";
import {
  deleteAppraisalAction, deleteProfileAction, finishAppraisalUploadAction, markCopiedAction, refreshProfileAction, saveProfileDataAction,
  setProfileStatusAction, startAppraisalUploadAction, updateProfileHeaderAction, uploadAppraisalChunkAction,
} from "../actions";
import { CARD, HEAT_DOT, Icon, Modal, TONE, ago, copyText } from "../ui";
import { AutoTextarea, FieldControl, Pill } from "./fields";

// The profile an exec works in while they're on the phone. Every section is
// on the page at once, so nothing is ever behind a "next"; the side list
// jumps to any of them. Answers save themselves a moment after typing stops.

type SaveState = "saved" | "pending" | "saving" | "error";
const fieldOf = (id: string) => PX_FIELDS.find((f) => f.id === id)!;
const dateOfSec = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const num = (v: FieldValue | undefined) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return typeof v === "string" && v.trim() && Number.isFinite(n) ? n : null; };

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
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);

  // ── Saving as they go ──
  const [save, setSave] = useState<SaveState>("saved");
  const pending = useRef<Record<string, FieldValue | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const headerPending = useRef<{ customerName?: string; model?: string }>({});
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
        setUpdatedAt(Math.floor(Date.now() / 1000));
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
  function setHeader(h: { customerName?: string; model?: string }) {
    if (!canEdit) return;
    if (h.customerName != null) setName(h.customerName);
    if (h.model != null) setModel(h.model);
    headerPending.current = { ...headerPending.current, ...h };
    setSave("pending");
    if (headerTimer.current) clearTimeout(headerTimer.current);
    headerTimer.current = setTimeout(() => void flushHeader(), 800);
  }
  async function changeKind(k: ProfileKind) {
    if (!canEdit || k === kind) return;
    setKind(k);
    setSave("saving");
    const r = await updateProfileHeaderAction(id, { kind: k }).catch(() => ({ ok: false }));
    setSave(r.ok ? "saved" : "error");
  }

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
      setClosed({ at: p.closedAt, reason: p.lostReason, note: p.lostNote }); setDocs(p.docs); setCopied(p.copied); setUpdatedAt(p.updatedAt);
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

  // ── The sections ──
  const sections = sectionsFor(kind);
  const questions = sections.filter((s) => !["next", "insight", "notes"].includes(s.id));
  const notes = sections.filter((s) => s.id === "insight" || s.id === "notes");
  const ranger = isRanger(model);
  const tools: { id: string; title: string; tone: Tone; icon: string; badge: string | null }[] = [
    { id: "px", title: "Part exchange", tone: "teal", icon: "swap", badge: data.pxHas === "No" ? "None" : num(data.pxValue) != null ? "Valued" : docs.some((d) => d.kind === "appraisal") ? "PDF in" : data.pxLinkSent ? "Link sent" : null },
    { id: "fuel", title: "Fuel cost", tone: "lime", icon: "bolt", badge: countOf(docs, "fuel") },
    ...(ranger ? [{ id: "ranger", title: "Ranger BIK", tone: "blue" as Tone, icon: "truck", badge: countOf(docs, "ranger") }] : []),
  ];
  const navIds = [...questions.map((s) => s.id), ...notes.map((s) => s.id), ...tools.map((t) => t.id)];

  // Which section is on screen, for the side list: the last one whose top has
  // reached the top bar. At the very bottom of the page the last sections can
  // never scroll that far, so there it's the lowest one in view.
  const [active, setActive] = useState(navIds[0]);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const els = navIds.map((n) => document.getElementById(`s-${n}`)).filter((e): e is HTMLElement => !!e && e.offsetParent !== null);
      if (!els.length) return;
      const line = window.innerWidth >= 1024 ? 100 : 150;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      let on = els[0];
      for (const el of els) if (el.getBoundingClientRect().top <= (atBottom ? window.innerHeight * 0.6 : line)) on = el;
      setActive(on.id.slice(2));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navIds.join("|")]);

  const quickNotes = useRef<HTMLTextAreaElement>(null);
  function jump(sid: string) {
    if (sid === "notes" && window.matchMedia("(min-width: 1280px)").matches && quickNotes.current) {
      quickNotes.current.focus();
      return;
    }
    const el = document.getElementById(`s-${sid}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(sid);
    if (window.matchMedia("(min-width: 1024px)").matches) {
      const first = el.querySelector<HTMLElement>("input:not([type=date]):not([type=time]):not([disabled]), textarea:not([disabled])");
      setTimeout(() => first?.focus({ preventScroll: true }), 350);
    }
  }

  // ── Copy for the CRM ──
  const docLines: DocLine[] = docs.map((d) => ({
    createdAt: d.createdAt,
    text: d.kind === "appraisal" ? `Part exchange appraisal received, ${fmtDate(dateOfSec(d.createdAt), today)}` : `${d.title}, ${fmtDate(dateOfSec(d.createdAt), today)}${d.detail ? `: ${d.detail}` : ""}`,
  }));
  const allText = crmText({ kind, data, docs: docLines, today });
  const newText = copied ? crmText({ kind, data, docs: docLines, since: copied, today }) : null;
  const [toast, setToast] = useState<{ text: string; copied?: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  async function copy(mode: "all" | "new" | string) {
    await Promise.all([flush(), flushHeader()]);
    const section = mode !== "all" && mode !== "new" ? mode : null;
    const text = mode === "all" ? allText : mode === "new" ? newText ?? allText : crmText({ kind, data, docs: docLines, only: section!, today });
    if (!text.trim()) { setToast({ text: mode === "new" ? "Nothing new since your last copy" : "Nothing to copy yet" }); return; }
    const ok = await copyText(text);
    if (!ok) { setPreview(text); return; }
    const lines = text.split("\n").filter((l) => l.trim()).length;
    setToast({ text: section ? `Copied ${sectionName(section)}` : `Copied ${lines} line${lines === 1 ? "" : "s"}. Paste it into the CRM.`, copied: text });
    if (!section && canEdit) {
      const snap = { ...data };
      const r = await markCopiedAction(id).catch(() => null);
      if (r?.ok && r.at) setCopied({ data: snap, at: r.at });
    }
  }
  const sectionName = (sid: string) => sid === "px" ? "Part exchange" : sid === "docs" ? "Documents" : titleOf(sections.find((s) => s.id === sid)!, kind);
  const newCount = newText ? newText.split("\n").filter((l) => l.trim() && !isHeading(l, kind)).length : 0;

  // ── Ordered, lost, back to live, delete ──
  const [modal, setModal] = useState<"ordered" | "lost" | "delete" | null>(null);
  async function setTo(next: ProfileStatus, reason?: string, note?: string) {
    await Promise.all([flush(), flushHeader()]);
    const r = await setProfileStatusAction(id, next, reason, note).catch(() => ({ ok: false }));
    if (!r.ok) { setToast({ text: "That didn't save. Please try again." }); return; }
    setStatus(next);
    setClosed({ at: next === "live" ? null : Math.floor(Date.now() / 1000), reason: next === "lost" ? reason ?? null : null, note: next === "lost" ? note ?? null : null });
    setModal(null);
    setToast({ text: next === "ordered" ? `${name} moved to Ordered` : next === "lost" ? `${name} moved to Lost sales` : `${name} is live again` });
  }

  const u = status === "live" ? urgencyOf(data, clock.now) : null;
  const heat = data.heat as Heat | undefined;
  const fuelDocs = docs.filter((d) => d.kind === "fuel");
  const rangerDocs = docs.filter((d) => d.kind === "ranger");
  const appraisals = docs.filter((d) => d.kind === "appraisal");

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-16">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <Link href="/profiles" className="flex shrink-0 items-center gap-1 text-[14px] font-medium text-slate-500 transition hover:text-slate-900"
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
        {/* Phones and tablets: the sections as a strip to swipe along. */}
        <nav aria-label="Sections" className="border-t border-slate-100 lg:hidden">
          <div className="mx-auto flex max-w-[1440px] gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6">
            {[...questions, ...notes].map((s, i) => {
              const p = sectionProgress(s, kind, data);
              return (
                <button key={s.id} type="button" onClick={() => jump(s.id)}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition ${active === s.id ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200"}`}>
                  {i < questions.length && <span className="tabular-nums opacity-60">{i + 1}</span>}
                  {navTitleOf(s, kind)}
                  {p.answered > 0 && <span className={`h-1.5 w-1.5 rounded-full ${p.answered === p.total ? "bg-emerald-400" : "bg-amber-400"}`} />}
                </button>
              );
            })}
            {tools.map((t) => (
              <button key={t.id} type="button" onClick={() => jump(t.id)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition ${active === t.id ? "bg-slate-900 text-white" : `${TONE[t.tone].soft} ${TONE[t.tone].text}`}`}>
                <Icon name={t.icon} className="h-3.5 w-3.5" />{t.title}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6 sm:pt-6">
        {!canEdit && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900 ring-1 ring-inset ring-sky-200">
            <Icon name="person" className="h-4 w-4 shrink-0 text-sky-600" />
            {`This is ${initial.ownerName}'s customer. You can read everything here; only ${initial.ownerName} or a manager can change it.`}
          </div>
        )}
        {canEdit && !mine && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-slate-100 px-4 py-3 text-[13.5px] text-slate-700">
            <Icon name="person" className="h-4 w-4 shrink-0 text-slate-500" />
            {`${initial.ownerName}'s customer. You're editing as a manager.`}
          </div>
        )}
        {status !== "live" && (
          <div className={`mb-4 flex flex-col gap-3 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${status === "ordered" ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 ring-1 ring-inset ring-slate-200"}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${status === "ordered" ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}`}>
                <Icon name={status === "ordered" ? "check" : "x"} />
              </span>
              <div>
                <div className={`text-[15px] font-semibold ${status === "ordered" ? "text-emerald-900" : "text-slate-900"}`}>
                  {status === "ordered" ? "Ordered" : "Lost sale"}{closed.at ? ` on ${fmtDate(dateOfSec(closed.at), today)}` : ""}
                  {status === "lost" && closed.reason ? `: ${closed.reason}` : ""}
                </div>
                <div className="text-[13px] text-slate-600">
                  {status === "lost" && closed.note ? closed.note : "Off the live list and kept here, so you can find it again."}
                </div>
              </div>
            </div>
            {canEdit && (
              <button type="button" onClick={() => void setTo("live")}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-[13px] font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                <Icon name="undo" />Move back to live
              </button>
            )}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[212px_minmax(0,1fr)_300px]">
          {/* ── Side list: jump anywhere ── */}
          <aside className="hidden lg:block">
            <nav aria-label="Sections" className="sticky top-[76px] max-h-[calc(100vh-92px)] space-y-5 overflow-y-auto pb-6 pr-1 [scrollbar-width:thin]">
              <NavGroup label="On the call">
                {questions.map((s, i) => <NavItem key={s.id} s={s} n={i + 1} kind={kind} data={data} on={active === s.id} onClick={() => jump(s.id)} />)}
              </NavGroup>
              <NavGroup label="Notes">
                {notes.map((s) => <NavItem key={s.id} s={s} kind={kind} data={data} on={active === s.id} onClick={() => jump(s.id)} />)}
              </NavGroup>
              <NavGroup label="Tools">
                {tools.map((t) => (
                  <button key={t.id} type="button" onClick={() => jump(t.id)}
                    className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition ${active === t.id ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-900/5" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${TONE[t.tone].solid} text-white`}><Icon name={t.icon} className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {t.badge && <span className="shrink-0 rounded-full bg-slate-200/70 px-1.5 text-[11px] font-medium text-slate-600">{t.badge}</span>}
                  </button>
                ))}
              </NavGroup>
            </nav>
          </aside>

          {/* ── The page ── */}
          <main className="min-w-0 space-y-4">
            <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
              <Hero name={name} kind={kind} model={model} heat={heat} data={data} today={today} u={u} status={status} updatedAt={updatedAt} nowMs={clock.ms}
                onName={(v) => setHeader({ customerName: v })} onModel={(v) => setHeader({ model: v })} onKind={changeKind} set={set}
                onOrdered={() => setModal("ordered")} onLost={() => setModal("lost")} />

              {questions.map((s, i) => (
                <SectionCard key={s.id} s={s} n={i + 1} kind={kind} data={data} set={set} today={today} onCopy={() => void copy(s.id)}
                  extra={s.id === "search" && canStock && model.trim() ? <StockLink model={model} /> : undefined} />
              ))}
              {notes.map((s) => (
                <div key={s.id} className={s.id === "notes" ? "xl:hidden" : ""}>
                  <SectionCard s={s} kind={kind} data={data} set={set} today={today} onCopy={() => void copy(s.id)} />
                </div>
              ))}

              <ToolSection id="px" title="Part exchange" tone="teal" icon="swap" hint="Their current vehicle, valued by Vehicle Vision" onCopy={() => void copy("px")}>
                <PartExchange profileId={id} data={data} set={set} kind={kind} today={today} appraisals={appraisals} canEdit={canEdit}
                  onAdd={(d) => setDocs((l) => [d, ...l])} onRemove={(fid) => setDocs((l) => l.filter((d) => d.id !== fid))} onToast={(t) => setToast({ text: t })} />
              </ToolSection>
            </fieldset>

            <ToolSection id="fuel" title="Fuel cost" tone="lime" icon="bolt" hint="Petrol or diesel against electric, for this customer">
              <ToolBody
                about="Opens the Fuel Cost Calculator with what you already know filled in. Export the PDF there and it's saved here."
                chips={fuelChips(fuelPrefillOf({ customerName: name, kind, model, data }))}
                action="Open the Fuel Cost Calculator" onOpen={() => void go(`/fuel-calculator?profile=${id}`)} docs={fuelDocs} today={today} />
            </ToolSection>

            {ranger && (
              <ToolSection id="ranger" title="Ranger BIK" tone="blue" icon="truck" hint="Car or van tax for every Ranger, side by side">
                <ToolBody
                  about="Opens the Ranger BIK Calculator with their Ranger and tax details filled in. Export the PDF there and it's saved here."
                  chips={rangerChips(rangerPrefillOf({ customerName: name, kind, model, data }))}
                  action="Open the Ranger BIK Calculator" onOpen={() => void go(`/ranger-bik?profile=${id}`)} docs={rangerDocs} today={today} />
              </ToolSection>
            )}

            {canEdit && (
              <div className="flex justify-center pt-4">
                <button type="button" onClick={() => setModal("delete")} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-700">
                  <Icon name="trash" className="h-3.5 w-3.5" />Delete this profile
                </button>
              </div>
            )}
          </main>

          {/* ── Right rail on wide screens: notes always in reach ── */}
          <aside className="hidden xl:block">
            <div className="sticky top-[76px] space-y-4">
              <div className={`${CARD} p-4`}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-slate-900">Quick notes</h2>
                  <span className="text-[12px] text-slate-400">Other notes</span>
                </div>
                <fieldset disabled={!canEdit}>
                  <AutoTextarea focusRef={quickNotes} value={typeof data.otherNotes === "string" ? data.otherNotes : ""} onChange={(v) => set("otherNotes", v)}
                    placeholder="Jot anything down while you talk" label="Quick notes" minRows={7} />
                </fieldset>
              </div>
              <Glance data={data} today={today} docs={docs} kind={kind} onJump={jump} />
            </div>
          </aside>
        </div>
      </div>

      {/* Phone: copy always in reach. */}
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
          <p className="mb-3 text-[13px] text-slate-500">{`Everything except their name, personal or business, and the model, which the CRM already has.`}</p>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-[13.5px] leading-6 text-slate-800 ring-1 ring-inset ring-slate-200">{preview}</pre>
          <button type="button" onClick={async () => { if (await copyText(preview)) { setPreview(null); setToast({ text: "Copied" }); } }}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800">
            <Icon name="copy" />Copy
          </button>
        </Modal>
      )}
      {modal === "ordered" && (
        <Modal title="Mark as ordered?" onClose={() => setModal(null)}>
          <p className="text-[14px] leading-6 text-slate-600">{`${name} comes off your live list and is kept under Ordered. You can move it back at any time.`}</p>
          <button type="button" onClick={() => void setTo("ordered")} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[14px] font-semibold text-white hover:bg-emerald-700">
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

const countOf = (docs: ProfileDoc[], k: ProfileDoc["kind"]) => { const n = docs.filter((d) => d.kind === k).length; return n ? `${n} PDF${n === 1 ? "" : "s"}` : null; };
const isHeading = (l: string, kind: ProfileKind) =>
  ["Part exchange", "Documents"].includes(l) || sectionsFor(kind).some((s) => titleOf(s, kind) === l);

function SaveBadge({ state }: { state: SaveState | null }) {
  if (!state) return <span className="hidden items-center gap-1.5 text-[12.5px] text-slate-500 sm:flex">Read only</span>;
  const s = {
    saved: { t: "Saved", c: "text-slate-500", dot: "bg-emerald-500" },
    pending: { t: "Saving", c: "text-slate-500", dot: "bg-amber-400" },
    saving: { t: "Saving", c: "text-slate-500", dot: "bg-amber-400 animate-pulse" },
    error: { t: "Not saved, retrying", c: "text-rose-700", dot: "bg-rose-500" },
  }[state];
  return <span className={`flex items-center gap-1.5 text-[12.5px] font-medium ${s.c}`} aria-live="polite"><span className={`h-2 w-2 rounded-full ${s.dot}`} /><span className={state === "error" ? "" : "hidden sm:inline"}>{s.t}</span></span>;
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ s, n, kind, data, on, onClick }: { s: SectionDef; n?: number; kind: ProfileKind; data: ProfileData; on: boolean; onClick: () => void }) {
  const p = sectionProgress(s, kind, data);
  const full = p.total > 0 && p.answered === p.total;
  const t = TONE[s.tone];
  return (
    <button type="button" onClick={onClick} aria-current={on ? "true" : undefined}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition ${on ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-900/5" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11.5px] font-semibold tabular-nums transition ${
        full ? "bg-emerald-500 text-white" : p.answered > 0 ? `${t.solid} text-white` : "bg-white text-slate-500 ring-1 ring-inset ring-slate-300"}`}>
        {full ? <Icon name="check" className="h-3.5 w-3.5" /> : n ?? <Icon name="doc" className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate" title={titleOf(s, kind)}>{navTitleOf(s, kind)}</span>
      {s.fields.length > 1 && <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-slate-400">{p.answered}/{p.total}</span>}
    </button>
  );
}

function Hero({ name, kind, model, heat, data, today, u, status, updatedAt, nowMs, onName, onModel, onKind, set, onOrdered, onLost }: {
  name: string; kind: ProfileKind; model: string; heat: Heat | undefined; data: ProfileData; today: string; u: ReturnType<typeof urgencyOf> | null;
  status: ProfileStatus; updatedAt: number; nowMs: number;
  onName: (v: string) => void; onModel: (v: string) => void; onKind: (k: ProfileKind) => void; set: (k: string, v: FieldValue) => void;
  onOrdered: () => void; onLost: () => void;
}) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-5 pb-5 pt-5 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <input value={name} onChange={(e) => onName(e.target.value)} aria-label="Customer name" placeholder="Customer name"
              className="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[26px] font-semibold leading-tight tracking-tight text-slate-900 transition hover:border-slate-200 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[30px]" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Personal or business" className="flex rounded-lg bg-slate-100 p-0.5">
                {(["personal", "business_car", "business_van"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => onKind(k)}
                    className={`h-7 whitespace-nowrap rounded-md px-2.5 text-[12.5px] font-medium transition ${kind === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input value={model} onChange={(e) => onModel(e.target.value)} list="ford-models-ws" aria-label="Model they're interested in" placeholder="Model"
                  className="h-8 w-44 rounded-lg border border-slate-200 bg-white px-2.5 text-[13.5px] font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
                <datalist id="ford-models-ws">{FORD_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
              </div>
            </div>
          </div>
          {status === "live" && (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onOrdered}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 md:flex-none">
                <Icon name="check" />Ordered
              </button>
              <button type="button" onClick={onLost}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-[13.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50 md:flex-none">
                <Icon name="x" />Lost sale
              </button>
            </div>
          )}
        </div>
      </div>
      <NextContact data={data} today={today} u={u} set={set} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3.5 sm:px-6">
        <span className="text-[12.5px] font-medium text-slate-500">How warm?</span>
        <div className="flex gap-1.5">
          {HEAT.map((h) => (
            <button key={h} type="button" aria-pressed={heat === h} onClick={() => set("heat", heat === h ? "" : h)}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition ${heat === h ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:ring-slate-400"}`}>
              <span className={`h-2 w-2 rounded-full ${HEAT_DOT[h]}`} />{h}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-slate-400">Updated {ago(updatedAt, nowMs)}</span>
      </div>
    </section>
  );
}

/**
 * What's been agreed for the next contact: "ring me back tomorrow at 10am" is
 * three taps (Call, Tomorrow, 10am). It decides where the customer sits in the
 * list and is the first line copied for the CRM.
 */
function NextContact({ data, today, u, set }: { data: ProfileData; today: string; u: ReturnType<typeof urgencyOf> | null; set: (k: string, v: FieldValue) => void }) {
  const how = typeof data.contactBy === "string" ? data.contactBy : "";
  const day = typeof data.callbackDate === "string" ? data.callbackDate : "";
  const time = typeof data.callbackTime === "string" ? data.callbackTime : "";
  const said = nextContactText(data, today);
  const days: [string, string][] = [["Today", today], ["Tomorrow", addDays(today, 1)], ["In 2 days", addDays(today, 2)], ["Next week", addDays(today, 7)]];
  const times: [string, string][] = [["9am", "09:00"], ["10am", "10:00"], ["12pm", "12:00"], ["2pm", "14:00"], ["4pm", "16:00"], ["5pm", "17:00"]];
  const tone = !u || !said ? "bg-white text-slate-500 ring-slate-200" : u.tier === 0 ? "bg-rose-50 text-rose-800 ring-rose-200" : u.tier === 1 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-slate-900 ring-slate-200";
  const row = "grid items-center gap-2 sm:grid-cols-[52px_minmax(0,1fr)]";
  const label = "text-[12px] font-medium text-slate-500";
  return (
    <div id="s-next" className="scroll-mt-[120px] border-t border-slate-100 bg-orange-50/40 px-5 py-4 lg:scroll-mt-[76px] sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-orange-500 text-white"><Icon name="clock" className="h-3.5 w-3.5" /></span>
        <h2 className="text-[14px] font-semibold text-slate-900">Agreed next contact</h2>
        <span className={`ml-auto inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset ${tone}`}>
          {said ?? "Nothing booked yet"}
          {u && said && u.tier === 0 && <span className="font-medium">· overdue</span>}
        </span>
        {(how || day || time) && (
          <button type="button" onClick={() => { set("contactBy", ""); set("callbackDate", ""); set("callbackTime", ""); }}
            className="text-[12.5px] font-medium text-slate-500 hover:text-slate-900">Clear</button>
        )}
      </div>
      <div className="space-y-2.5">
        <div className={row}>
          <span className={label}>How</span>
          <div className="flex flex-wrap gap-1.5">
            {["Call", "Text", "Email"].map((h) => <Pill key={h} small on={how === h} onClick={() => set("contactBy", how === h ? "" : h)}>{h}</Pill>)}
          </div>
        </div>
        <div className={row}>
          <span className={label}>Day</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {days.map(([l, d]) => <Pill key={l} small on={day === d} onClick={() => set("callbackDate", day === d ? "" : d)}>{l}</Pill>)}
            <input type="date" value={day} onChange={(e) => set("callbackDate", e.target.value)} aria-label="Next contact day"
              className="h-7 rounded-lg border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
          </div>
        </div>
        <div className={row}>
          <span className={label}>Time</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {times.map(([l, t]) => <Pill key={l} small on={time === t} onClick={() => set("callbackTime", time === t ? "" : t)}>{l}</Pill>)}
            <input type="time" value={time} onChange={(e) => set("callbackTime", e.target.value)} aria-label="Next contact time"
              className="h-7 rounded-lg border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ s, n, kind, data, set, today, onCopy, extra }: {
  s: SectionDef; n?: number; kind: ProfileKind; data: ProfileData; set: (k: string, v: FieldValue) => void; today: string; onCopy: () => void; extra?: ReactNode;
}) {
  const p = sectionProgress(s, kind, data);
  const hint = hintOf(s, kind);
  const t = TONE[s.tone];
  const prompts = promptsOf(s, kind);
  return (
    <section id={`s-${s.id}`} className={`${CARD} scroll-mt-[120px] lg:scroll-mt-[76px]`}>
      <header className="flex items-center gap-3 px-5 pt-4 sm:px-6">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-semibold tabular-nums text-white ${t.solid}`}>
          {n ?? <Icon name="doc" className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold tracking-tight text-slate-900">{titleOf(s, kind)}</h2>
          {hint && <p className="truncate text-[12.5px] text-slate-500">{hint}</p>}
        </div>
        {s.fields.length > 1 && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${p.answered === p.total ? "bg-emerald-50 text-emerald-700" : p.answered ? `${t.soft} ${t.text}` : "bg-slate-100 text-slate-500"}`}>
            {p.answered}/{p.total}
          </span>
        )}
        <CopyButton onClick={onCopy} disabled={p.answered === 0} />
      </header>
      <div className="grid gap-x-5 gap-y-4 px-5 pb-5 pt-4 sm:grid-cols-2 sm:px-6">
        {extra && <div className="sm:col-span-2">{extra}</div>}
        {fieldsShown(s, kind, data).map((f) => (
          <FieldControl key={f.id} f={f} kind={kind} value={data[f.id]} onChange={(v) => set(f.id, v)} today={today} prompts={f.type === "long" ? prompts : undefined} />
        ))}
      </div>
    </section>
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

/** A span, not a button, so it still works on a profile you can only read (the fieldset disables real buttons). Copying is reading. */
function CopyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <span role="button" tabIndex={disabled ? -1 : 0} aria-label="Copy this section" aria-disabled={disabled} title="Copy this section"
      onClick={() => { if (!disabled) onClick(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); onClick(); } }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${disabled ? "text-slate-300" : "cursor-pointer text-slate-400 hover:bg-slate-100 hover:text-slate-900"}`}>
      <Icon name="copy" />
    </span>
  );
}

function ToolSection({ id, title, tone, icon, hint, onCopy, children }: {
  id: string; title: string; tone: Tone; icon: string; hint: string; onCopy?: () => void; children: ReactNode;
}) {
  return (
    <section id={`s-${id}`} className={`${CARD} scroll-mt-[120px] lg:scroll-mt-[76px]`}>
      <header className="flex items-center gap-3 px-5 pt-4 sm:px-6">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${TONE[tone].solid}`}><Icon name={icon} className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="text-[12.5px] text-slate-500">{hint}</p>
        </div>
        {onCopy && <CopyButton onClick={onCopy} />}
      </header>
      <div className="px-5 pb-5 pt-4 sm:px-6">{children}</div>
    </section>
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
            <div className="text-[12px] text-slate-500">{fmtDate(dateOfSec(d.createdAt), today)}</div>
          </div>
          <a href={d.href} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Open</a>
          {onRemove && canEdit && (
            <button type="button" onClick={() => onRemove(d)} aria-label={`Remove ${d.filename}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700">
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ToolBody({ about, chips, action, onOpen, docs, today }: { about: string; chips: string[]; action: string; onOpen: () => void; docs: ProfileDoc[]; today: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-6 text-slate-600">{about}</p>
      {chips.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-slate-500">Filled in for you</div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => <span key={c} className="inline-flex h-7 items-center rounded-full bg-slate-100 px-2.5 text-[12.5px] font-medium text-slate-700">{c}</span>)}
          </div>
        </div>
      )}
      <button type="button" onClick={onOpen}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white transition hover:bg-slate-800 sm:w-auto">
        {action}<Icon name="chevron" />
      </button>
      {docs.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-slate-500">Saved for this customer</div>
          <DocList docs={docs} today={today} />
        </div>
      )}
    </div>
  );
}

function fuelChips(p: ReturnType<typeof fuelPrefillOf>): string[] {
  return [
    p.customer === "business" ? "Business" : "Private",
    p.segment === "van" ? "Van" : "Car",
    p.annualMiles ? `${p.annualMiles.toLocaleString("en-GB")} miles a year` : null,
    p.termMonths ? `${p.termMonths} months` : null,
    p.currentVehicle ? `Now: ${p.currentVehicle}` : null,
    p.model ? `Looking at: ${p.model}` : null,
  ].filter((x): x is string => !!x);
}

function rangerChips(p: ReturnType<typeof rangerPrefillOf>): string[] {
  const v = p.versionId ? rangerById(p.versionId) : null;
  return [
    v ? `${v.trim} ${v.engineShort}${p.seats === 2 ? " 2-Seat" : ""}` : p.trim ? `${p.trim}, engine to pick` : "Pick their Ranger there",
    p.taxRate ? `Driver pays ${p.taxRate}%` : null,
    p.fuelCard === "yes" ? "Fuel card" : p.fuelCard === "no" ? "No fuel card" : null,
    p.rental ? `${pounds(p.rental)} + VAT a month` : null,
    p.termMonths ? `${p.termMonths} months` : null,
  ].filter((x): x is string => !!x);
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
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold ${done ? "bg-teal-600 text-white" : "bg-white text-slate-500 ring-1 ring-inset ring-slate-300"}`}>
        {done ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[14px] font-semibold text-slate-900">{title}</div>
        <div className="mt-2.5">{body}</div>
      </div>
    </li>
  );

  return (
    <div>
      <FieldControl f={fieldOf("pxHas")} kind={kind} value={data.pxHas} onChange={(v) => set("pxHas", v)} today={today} />
      {has !== "No" && (
        <>
          <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <FieldControl f={fieldOf("pxReg")} kind={kind} value={data.pxReg} onChange={(v) => set("pxReg", typeof v === "string" ? v.toUpperCase() : v)} today={today} />
            <FieldControl f={fieldOf("pxMileage")} kind={kind} value={data.pxMileage} onChange={(v) => set("pxMileage", v)} today={today} />
          </div>
          <ol className="relative mt-5 before:absolute before:bottom-4 before:left-[13px] before:top-4 before:w-px before:bg-slate-200">
            {step(1, !!sent, "Send them the appraisal link", (
              <div className="flex flex-wrap items-center gap-2">
                <a href={APPRAISAL_URL} target="_blank" rel="noreferrer"
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white hover:bg-slate-800">
                  Open the appraisal form<Icon name="external" className="h-3.5 w-3.5" />
                </a>
                <button type="button" onClick={async () => { if (await copyText(APPRAISAL_URL)) onToast("Appraisal link copied, ready to text or email"); }}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <Icon name="link" className="h-3.5 w-3.5" />Copy the link
                </button>
                <Pill small on={!!sent} onClick={() => set("pxLinkSent", sent ? "" : today)}>{sent ? `Sent ${fmtDate(sent, today)}` : "Mark as sent"}</Pill>
              </div>
            ))}
            {step(2, appraisals.length > 0, "Upload the appraisal when it comes back", (
              <div className="space-y-2.5">
                <DocList docs={appraisals} today={today} canEdit={canEdit}
                  onRemove={async (d) => { if ((await deleteAppraisalAction(d.id)).ok) onRemove(d.id); }} />
                <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && canEdit) void upload(f); }}
                  className={`rounded-xl border-2 border-dashed px-4 py-4 text-center transition ${drag ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50/60"}`}>
                  {up ? (
                    <div>
                      <div className="truncate text-[13px] font-medium text-slate-700">{`Uploading ${up.name}`}</div>
                      <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${up.pct}%` }} /></div>
                    </div>
                  ) : (
                    <>
                      <Icon name="upload" className="mx-auto h-5 w-5 text-slate-400" />
                      <div className="mt-1.5 text-[13px] text-slate-600">
                        Drop the PDF here, or{" "}
                        <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">choose a file</button>
                      </div>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
                </div>
                {err && <p className="text-[13px] text-rose-700">{err}</p>}
              </div>
            ))}
            {step(3, value != null, "The valuation", (
              <div>
                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-3">
                  <FieldControl f={fieldOf("pxValue")} kind={kind} value={data.pxValue} onChange={(v) => set("pxValue", v)} today={today} />
                  <FieldControl f={fieldOf("pxSettlement")} kind={kind} value={data.pxSettlement} onChange={(v) => set("pxSettlement", v)} today={today} />
                  <FieldControl f={fieldOf("pxValidUntil")} kind={kind} value={data.pxValidUntil} onChange={(v) => set("pxValidUntil", v)} today={today} plain />
                </div>
                {value != null && settle != null && settle > 0 && (() => {
                  const eq = pxEquity(value, settle);
                  return (
                    <div className={`mt-3 flex items-baseline justify-between gap-3 rounded-xl px-4 py-3 ${eq >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                      <span className="text-[13px]">{`${pounds(value)} value less ${pounds(settle)} to settle`}</span>
                      <span className="text-[16px] font-semibold tabular-nums">{eq >= 0 ? `${pounds(eq)} equity` : `${pounds(-eq)} negative equity`}</span>
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

function Glance({ data, today, docs, kind, onJump }: { data: ProfileData; today: string; docs: ProfileDoc[]; kind: ProfileKind; onJump: (id: string) => void }) {
  const rental = num(data.rental);
  const upfront = num(data.upfront);
  const term = num(data.term);
  const miles = num(data.mileage);
  const value = num(data.pxValue);
  const settle = num(data.pxSettlement);
  const terms = [upfront != null ? `${pounds(upfront)} upfront` : null, term ? `${term} months` : null, miles ? `${miles.toLocaleString("en-GB")} miles` : null].filter(Boolean).join(" · ");
  const cb = typeof data.callbackDate === "string" ? data.callbackDate : "";
  const rows: [string, string | null, string][] = [
    ["Next contact", cb ? nextContactText(data, today) : null, "next"],
    ["Their rental", rental != null ? `${pounds(rental)}${kind === "personal" ? "" : " + VAT"} a month` : null, "search"],
    ["Terms", terms || null, "terms"],
    ["Part exchange", data.pxHas === "No" ? "None" : value != null ? `${pounds(value)}${settle ? `, ${pounds(pxEquity(value, settle))} equity` : ""}` : typeof data.pxReg === "string" ? data.pxReg : null, "px"],
    ["Documents", docs.length ? `${docs.length} PDF${docs.length === 1 ? "" : "s"}` : null, "fuel"],
  ];
  return (
    <div className={`${CARD} p-4`}>
      <h2 className="mb-2 text-[14px] font-semibold text-slate-900">At a glance</h2>
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v, to]) => (
          <button key={k} type="button" onClick={() => onJump(to)} className="flex w-full items-baseline justify-between gap-3 py-2 text-left">
            <dt className="shrink-0 text-[12.5px] text-slate-500">{k}</dt>
            <dd className={`min-w-0 text-right text-[13px] font-medium leading-5 ${v ? "text-slate-900" : "text-slate-300"}`}>{v ?? "Not yet"}</dd>
          </button>
        ))}
      </dl>
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
        className="mt-4 w-full resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14px]" />
      <button type="button" disabled={!reason} onClick={() => onSave(reason, note)}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
        Move to Lost sales
      </button>
    </Modal>
  );
}
