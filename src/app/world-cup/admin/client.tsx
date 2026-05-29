"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createWcUserAction,
  recomputeAllPointsAction,
  recordResultAction,
  setKnockoutTeamsAction,
  setWcAccessAction,
} from "./actions";

export interface AdminFixture {
  fixtureNumber: number;
  stage: string;
  groupName: string | null;
  kickoffAt: string;
  stadium: string | null;
  team1: string | null;
  team2: string | null;
  nextFixtureNumber: number | null;
  nextSlot: string | null;
  result: {
    team1Goals: number;
    team2Goals: number;
    etTeam1Goals: number | null;
    etTeam2Goals: number | null;
    penTeam1: number | null;
    penTeam2: number | null;
    winnerTeam: string;
  } | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  level: "none" | "wc" | "wc_admin";
  isSiteAdmin: boolean;
}

type Tab = "results" | "players" | "knockouts";

export function AdminClient({ fixtures, users, currentUserId }: {
  fixtures: AdminFixture[];
  users: AdminUser[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("results");
  return (
    <div className="mt-6">
      <nav className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
        <TabButton active={tab === "results"} onClick={() => setTab("results")}>Results</TabButton>
        <TabButton active={tab === "knockouts"} onClick={() => setTab("knockouts")}>Knockout teams</TabButton>
        <TabButton active={tab === "players"} onClick={() => setTab("players")}>Players</TabButton>
      </nav>

      {tab === "results" && <ResultsTab fixtures={fixtures} />}
      {tab === "knockouts" && <KnockoutsTab fixtures={fixtures} />}
      {tab === "players" && <PlayersTab users={users} currentUserId={currentUserId} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────
// Results tab — type a score, hit save, points score & bracket advance.
// ───────────────────────────────────────────────────────────────────
function ResultsTab({ fixtures }: { fixtures: AdminFixture[] }) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [onlyUnsettled, setOnlyUnsettled] = useState(false);

  const filtered = useMemo(() => {
    return fixtures.filter((f) => {
      if (stageFilter !== "all" && f.stage !== stageFilter) return false;
      if (onlyUnsettled && f.result) return false;
      return true;
    });
  }, [fixtures, stageFilter, onlyUnsettled]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium uppercase tracking-wide">Stage</span>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
          >
            <option value="all">All stages</option>
            <option value="group">Group</option>
            <option value="r32">Round of 32</option>
            <option value="r16">Round of 16</option>
            <option value="qf">Quarter-finals</option>
            <option value="sf">Semi-finals</option>
            <option value="third">Third place</option>
            <option value="final">Final</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={onlyUnsettled} onChange={(e) => setOnlyUnsettled(e.target.checked)} className="rounded" />
          <span>Only show unsettled</span>
        </label>
        <div className="flex-1" />
        <div className="text-[11px] text-slate-400">{filtered.length} match{filtered.length === 1 ? "" : "es"}</div>
      </div>

      <ul className="mt-4 space-y-2">
        {filtered.map((f) => <li key={f.fixtureNumber}><ResultRow fixture={f} /></li>)}
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            Nothing matches this filter.
          </li>
        )}
      </ul>
    </div>
  );
}

function ResultRow({ fixture: f }: { fixture: AdminFixture }) {
  const settled = !!f.result;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [t1, setT1] = useState<string>(f.result?.team1Goals.toString() ?? "");
  const [t2, setT2] = useState<string>(f.result?.team2Goals.toString() ?? "");
  const [showET, setShowET] = useState<boolean>(f.stage !== "group" && t1 !== "" && t1 === t2);
  const [et1, setET1] = useState<string>(f.result?.etTeam1Goals?.toString() ?? "");
  const [et2, setET2] = useState<string>(f.result?.etTeam2Goals?.toString() ?? "");
  const [pen1, setPen1] = useState<string>(f.result?.penTeam1?.toString() ?? "");
  const [pen2, setPen2] = useState<string>(f.result?.penTeam2?.toString() ?? "");

  function save() {
    setErr(null); setMsg(null);
    const n1 = Number(t1), n2 = Number(t2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 < 0 || n2 < 0) {
      setErr("Enter both scores."); return;
    }
    if (f.stage !== "group" && n1 === n2 && (!et1 && !et2) && (!pen1 && !pen2)) {
      setShowET(true);
      setErr("Knockout matches need ET or pens to break the tie.");
      return;
    }
    start(async () => {
      const res = await recordResultAction({
        fixtureNumber: f.fixtureNumber,
        team1Goals: n1,
        team2Goals: n2,
        etTeam1Goals: et1 ? Number(et1) : null,
        etTeam2Goals: et2 ? Number(et2) : null,
        penTeam1: pen1 ? Number(pen1) : null,
        penTeam2: pen2 ? Number(pen2) : null,
      });
      if (!res.ok) { setErr(res.error ?? "Save failed"); return; }
      const parts: string[] = ["Saved"];
      if (res.advancedTo) parts.push(`→ advanced to match ${res.advancedTo.fixtureNumber} ${res.advancedTo.slot}`);
      if (res.groupComplete) parts.push(`Group ${res.groupComplete.groupName} complete: 1st ${res.groupComplete.top1}, 2nd ${res.groupComplete.top2}, 3rd ${res.groupComplete.third}`);
      setMsg(parts.join(" · "));
    });
  }

  const teamsKnown = !!(f.team1 && f.team2);

  return (
    <div className={`overflow-hidden rounded-xl border ${settled ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"} shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <StageChip stage={f.stage} group={f.groupName} />
          <div className="min-w-0">
            <div className={`truncate font-medium ${teamsKnown ? "text-slate-900" : "text-slate-400"}`}>
              {f.team1 ?? "TBD"} <span className="text-slate-400">vs</span> {f.team2 ?? "TBD"}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {new Date(f.kickoffAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
              {f.stadium ? ` · ${f.stadium}` : ""}
            </div>
          </div>
        </div>
        {teamsKnown ? (
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="30" value={t1} onChange={(e) => setT1(e.target.value)} className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" aria-label={`${f.team1} goals`} />
            <span className="text-slate-400">–</span>
            <input type="number" min="0" max="30" value={t2} onChange={(e) => setT2(e.target.value)} className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" aria-label={`${f.team2} goals`} />
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {pending ? "Saving…" : settled ? "Update" : "Save"}
            </button>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Teams not set yet (use Knockout teams tab)</span>
        )}
      </div>
      {f.stage !== "group" && (showET || (f.result && (f.result.etTeam1Goals !== null || f.result.penTeam1 !== null))) && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold uppercase tracking-wide text-slate-500">ET</span>
            <input type="number" min="0" value={et1} onChange={(e) => setET1(e.target.value)} className="w-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono" />
            <span className="text-slate-400">–</span>
            <input type="number" min="0" value={et2} onChange={(e) => setET2(e.target.value)} className="w-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono" />
            <span className="ml-4 font-semibold uppercase tracking-wide text-slate-500">Pens</span>
            <input type="number" min="0" value={pen1} onChange={(e) => setPen1(e.target.value)} className="w-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono" />
            <span className="text-slate-400">–</span>
            <input type="number" min="0" value={pen2} onChange={(e) => setPen2(e.target.value)} className="w-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono" />
          </div>
        </div>
      )}
      {(err || msg) && (
        <div className={`px-4 py-2 text-[11px] ${err ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {err ?? msg}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Knockouts tab — set team1/team2 on the 32 knockout fixtures.
// Used after group-stage to seed R32 (especially for 3rd-placed teams,
// which the engine can't compute without cross-group comparisons).
// ───────────────────────────────────────────────────────────────────
function KnockoutsTab({ fixtures }: { fixtures: AdminFixture[] }) {
  const knockouts = fixtures.filter((f) => f.stage !== "group");
  return (
    <div className="mt-6 space-y-2">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        Knockout fixtures auto-fill when you enter results — but use this tab to set R32 team slots
        once group stage is finished, or to correct a typo.
      </p>
      {knockouts.map((f) => <KnockoutRow key={f.fixtureNumber} fixture={f} />)}
    </div>
  );
}

function KnockoutRow({ fixture: f }: { fixture: AdminFixture }) {
  const [t1, setT1] = useState<string>(f.team1 ?? "");
  const [t2, setT2] = useState<string>(f.team2 ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setErr(null); setMsg(null);
    start(async () => {
      const res = await setKnockoutTeamsAction({
        fixtureNumber: f.fixtureNumber,
        team1: t1.trim() || null,
        team2: t2.trim() || null,
      });
      if (!res.ok) setErr(res.error ?? "Save failed");
      else setMsg("Saved");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <StageChip stage={f.stage} group={null} />
      <span className="font-mono text-xs text-slate-400">M{f.fixtureNumber}</span>
      <input
        type="text"
        value={t1}
        onChange={(e) => setT1(e.target.value)}
        placeholder="Team 1"
        className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      />
      <span className="text-slate-400">vs</span>
      <input
        type="text"
        value={t2}
        onChange={(e) => setT2(e.target.value)}
        placeholder="Team 2"
        className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      />
      <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-400">
        {pending ? "Saving…" : "Save"}
      </button>
      <span className={`text-[11px] ${err ? "text-red-600" : msg ? "text-emerald-700" : "text-slate-400"}`}>
        {err ?? msg ?? ""}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Players tab — grant/revoke access + create new wc-only user.
// ───────────────────────────────────────────────────────────────────
function PlayersTab({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const [pending, start] = useTransition();
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [bannerErr, setBannerErr] = useState<string | null>(null);

  function changeLevel(userId: string, level: "none" | "wc" | "wc_admin") {
    setBannerErr(null); setBannerMsg(null);
    start(async () => {
      const res = await setWcAccessAction({ userId, level });
      if (!res.ok) setBannerErr(res.error ?? "Failed");
      else setBannerMsg("Access updated");
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <NewPlayerForm onResult={(ok, msg) => { if (ok) setBannerMsg(msg); else setBannerErr(msg); }} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">All users</h2>
          {(bannerMsg || bannerErr) && (
            <span className={`text-xs ${bannerErr ? "text-red-600" : "text-emerald-700"}`}>{bannerErr ?? bannerMsg}</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">Email</th>
              <th className="px-4 py-2 text-right font-semibold">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={u.id === currentUserId ? "bg-emerald-50/30" : ""}>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {u.name}
                  {u.isSiteAdmin && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500" title="Has the global 'admin' role on the leasing system">site admin</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2 text-right">
                  <select
                    value={u.level}
                    onChange={(e) => changeLevel(u.id, e.target.value as "none" | "wc" | "wc_admin")}
                    disabled={pending}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <option value="none">No access</option>
                    <option value="wc">Player</option>
                    <option value="wc_admin">Player + Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecomputeFooter />
    </div>
  );
}

function NewPlayerForm({ onResult }: { onResult: (ok: boolean, msg: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!name || !email || !password) {
      onResult(false, "Enter name, email and password");
      return;
    }
    start(async () => {
      const res = await createWcUserAction({ name, email, password });
      if (!res.ok) onResult(false, res.error ?? "Failed");
      else {
        onResult(true, `Created player ${name}`);
        setName(""); setEmail(""); setPassword("");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Add a player (World Cup only)</h2>
      <p className="mt-1 text-xs text-slate-500">For people who don't otherwise need the leasing system. Pass them their email + password.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Initial password (≥ 8)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {pending ? "Adding…" : "Add player"}
      </button>
    </div>
  );
}

function RecomputeFooter() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/60 px-5 py-3">
      <p className="text-xs text-slate-500">
        Force a clean recompute of every prediction's points. Idempotent — use if you edited a result and the leaderboard looks off.
      </p>
      <button
        type="button"
        onClick={() => start(async () => {
          const res = await recomputeAllPointsAction();
          setMsg(`Recomputed ${res.count} predictions`);
        })}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {pending ? "Recomputing…" : msg ?? "Recompute all points"}
      </button>
    </div>
  );
}

function StageChip({ stage, group }: { stage: string; group: string | null }) {
  const chip = stage === "group" && group ? `GRP ${group}` :
    stage === "r32" ? "R32" :
    stage === "r16" ? "R16" :
    stage === "qf" ? "QF" :
    stage === "sf" ? "SF" :
    stage === "third" ? "3rd" :
    stage === "final" ? "FINAL" : stage.toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
      {chip}
    </span>
  );
}
