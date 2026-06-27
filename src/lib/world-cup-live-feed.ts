import "server-only";
import { logError } from "./logger";

// Public ESPN scoreboard endpoint for the FIFA World Cup. Undocumented but
// stable — it's the same JSON ESPN's own scoreboard pages consume, no API key
// required. Returns scheduled, live, and recently-completed matches.
const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Two distinct purposes for the feed:
//   - Live snapshot: matches currently in progress, halftime, or just FT'd
//   - Settled snapshot: matches at FT, so the system can auto-record the result
// The Next.js fetch cache (next: { revalidate: 10 }) ensures that no matter
// how many tabs are open polling the live widget, ESPN gets at most one hit
// per 10 seconds globally.

export interface FeedMatch {
  espnId: string;
  team1: string;
  team2: string;
  team1Goals: number;
  team2Goals: number;
  status: "scheduled" | "live" | "halftime" | "final";
  // Base minute played: 1-45 (1st half), 46-90 (2nd half), 91-105 (ET
  // 1st half), 106-120 (ET 2nd half). No cap at 90 — extra time runs
  // through to 120 in knockouts. ESPN's displayClock includes the ET
  // minutes so parseMinute lifts them straight through.
  minute: number | null;
  // Added/stoppage time in minutes (e.g. 2 when ESPN reports "45+2" or
  // "90+5" or "120+3"). Null when the match is in normal time. Rendered
  // alongside minute as e.g. "45+2'" on the live widget.
  stoppage: number | null;
  // ESPN's per-competitor "winner" boolean. The only reliable signal of
  // who won a penalty shootout — when ET ends 2-2 and pens decide, both
  // scores stay at 2 and the auto-record path would otherwise have no
  // way to settle the bracket. Null on in-progress matches.
  team1Winner: boolean | null;
  team2Winner: boolean | null;
  // Penalty shootout score, when ESPN ships it. Surfaced for the live
  // widget + bracket cards ("Spain 1-1 France (4-3 pens)") and stored
  // on wc_results.penTeam1/2 for the historic audit.
  team1Shootout: number | null;
  team2Shootout: number | null;
  kickoffAt: Date;
}

// Some team names ESPN reports differently from the spreadsheet seed. The
// mapping is one-way (ESPN → seed). Keys are lower-cased + stripped of
// punctuation/whitespace. Extend as edge cases surface during the tournament.
const TEAM_ALIASES: Record<string, string> = {
  unitedstates: "USA",
  usmnt: "USA",
  korearepublic: "South Korea",
  southkorea: "South Korea",
  bosniaherzegovina: "Bosnia and Herzegovina",
  bosniaandherzegovina: "Bosnia and Herzegovina",
  capeverde: "Cape Verde",
  ivorycoast: "Ivory Coast",
  cotedivoire: "Ivory Coast",
  newzealand: "New Zealand",
  saudiarabia: "Saudi Arabia",
  drcongo: "DR Congo",
  drcongo2: "DR Congo",
  congodr: "DR Congo",
  democraticrepublicofcongo: "DR Congo",
  uzbekistan: "Uzbekistan",
  // Curaçao — DB seed has the accent-stripped spelling but ESPN sends the
  // ç. Aliasing here so the raw name returned by normaliseTeamName lines
  // up with what's in wc_fixtures.team{1,2}.
  curacao: "Curacao",
  // Türkiye — defensive, in case the rebrand surfaces in ESPN before our
  // seed adopts it.
  turkiye: "Turkey",
  turkey: "Turkey",
  // Czech Republic ↔ Czechia. UEFA / FIFA adopted "Czechia" in 2016 but
  // ESPN scoreboards still default to "Czech Republic" most of the time.
  czechrepublic: "Czechia",
  czechia: "Czechia",
  // Iran — FIFA's formal "Islamic Republic of Iran" and the common "IR
  // Iran" short form both surface in feeds depending on the source.
  iran: "Iran",
  iriran: "Iran",
  islamicrepublicofiran: "Iran",
};

export function normalizeKey(s: string): string {
  // Decompose accented characters into base + combining mark, then strip
  // the combining marks. This turns "Curaçao" → "Curacao", "Türkiye" →
  // "Turkiye", "São Tomé" → "Sao Tome" etc. BEFORE the lowercase + non-
  // [a-z] strip. Without this step the raw [^a-z] regex eats the ç/ü/é
  // outright and the name no longer matches our seeded version.
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function normaliseTeamName(raw: string): string {
  const key = normalizeKey(raw);
  return TEAM_ALIASES[key] ?? raw.trim();
}

// Pure parse — accepts the ESPN response object and returns just the matches
// we care about. Defensive — any unexpected shape returns an empty array so a
// schema drift at ESPN never crashes the page.
export function parseEspnScoreboard(json: unknown): FeedMatch[] {
  if (!json || typeof json !== "object") return [];
  const events = (json as { events?: unknown[] }).events;
  if (!Array.isArray(events)) return [];

  const out: FeedMatch[] = [];
  for (const ev of events) {
    try {
      if (!ev || typeof ev !== "object") continue;
      const e = ev as Record<string, unknown>;
      const espnId = String(e.id ?? "");
      const date = typeof e.date === "string" ? new Date(e.date) : null;
      const competitions = Array.isArray(e.competitions) ? e.competitions : [];
      const comp = competitions[0] as Record<string, unknown> | undefined;
      if (!comp) continue;

      const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
      if (competitors.length !== 2) continue;

      const home = competitors.find((c) => (c as Record<string, unknown>).homeAway === "home") ?? competitors[0];
      const away = competitors.find((c) => (c as Record<string, unknown>).homeAway === "away") ?? competitors[1];
      const h = home as Record<string, unknown>;
      const a = away as Record<string, unknown>;
      const hTeam = h.team as Record<string, unknown> | undefined;
      const aTeam = a.team as Record<string, unknown> | undefined;

      const homeName = normaliseTeamName(String(hTeam?.displayName ?? hTeam?.name ?? ""));
      const awayName = normaliseTeamName(String(aTeam?.displayName ?? aTeam?.name ?? ""));
      const homeGoals = parseScore(h.score);
      const awayGoals = parseScore(a.score);

      const status = parseStatus(comp.status);
      const { minute, stoppage } = status === "live" ? parseMinute(comp.status) : { minute: null, stoppage: null };

      const homeWinner = parseWinnerFlag(h.winner);
      const awayWinner = parseWinnerFlag(a.winner);
      const homeShootout = parseOptionalScore(h.shootoutScore);
      const awayShootout = parseOptionalScore(a.shootoutScore);

      if (!homeName || !awayName) continue;
      out.push({
        espnId,
        team1: homeName,
        team2: awayName,
        team1Goals: homeGoals,
        team2Goals: awayGoals,
        status,
        minute,
        stoppage,
        team1Winner: homeWinner,
        team2Winner: awayWinner,
        team1Shootout: homeShootout,
        team2Shootout: awayShootout,
        kickoffAt: date ?? new Date(0),
      });
    } catch (e) {
      logError("world-cup-live-feed/parse-event", e);
    }
  }
  return out;
}

function parseScore(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Like parseScore, but returns null when the field is missing — used
// for shootoutScore which is undefined on every match that didn't
// reach pens. Distinguishes "no shootout" from "shootout 0".
function parseOptionalScore(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseWinnerFlag(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

export function parseStatus(s: unknown): FeedMatch["status"] {
  if (!s || typeof s !== "object") return "scheduled";
  const st = s as Record<string, unknown>;
  const t = st.type as Record<string, unknown> | undefined;
  const state = String(t?.state ?? "").toLowerCase();
  if (state === "post") return "final";
  if (state === "in") {
    // Prefer the structured type.name flag — ESPN uses STATUS_HALFTIME
    // specifically for the interval. Description-based fallback below
    // matches only the literal "halftime" / "ht" — NOT "1st Half" or
    // "2nd Half", both of which used to be miscategorised as halftime
    // because the old code did a substring match on "half".
    const typeName = String(t?.name ?? "").toLowerCase();
    if (typeName === "status_halftime") return "halftime";
    const desc = String(t?.description ?? "").toLowerCase().trim();
    if (desc === "halftime" || desc === "half time" || desc === "half-time" || desc === "ht") {
      return "halftime";
    }
    return "live";
  }
  return "scheduled";
}

export function parseMinute(s: unknown): { minute: number | null; stoppage: number | null } {
  if (!s || typeof s !== "object") return { minute: null, stoppage: null };
  const clock = (s as Record<string, unknown>).displayClock;
  if (typeof clock !== "string") return { minute: null, stoppage: null };
  // Stoppage time format first — ESPN reports "45+2'", "90+5'" etc during
  // injury time. Old code did a blanket strip of non-digits which
  // concatenated 45 and 2 into 452. Capture the two numbers separately
  // and return them as a structured pair.
  const stoppageMatch = clock.match(/(\d+)\s*\+\s*(\d+)/);
  if (stoppageMatch) {
    return {
      minute: parseInt(stoppageMatch[1], 10),
      stoppage: parseInt(stoppageMatch[2], 10),
    };
  }
  // Normal time — match the first run of digits ("32'", "32:15" → 32).
  const minuteMatch = clock.match(/(\d+)/);
  if (minuteMatch) {
    return { minute: parseInt(minuteMatch[1], 10), stoppage: null };
  }
  return { minute: null, stoppage: null };
}

export async function fetchEspnLive(): Promise<FeedMatch[]> {
  try {
    const res = await fetch(ESPN_URL, {
      next: { revalidate: 10 },
      headers: {
        // ESPN's CDN sometimes 403s requests without a UA.
        "User-Agent": "TrustFordLeasing/1.0 (+world-cup sweepstake)",
      },
    });
    if (!res.ok) {
      logError("world-cup-live-feed/fetch", new Error(`HTTP ${res.status}`));
      return [];
    }
    const json = await res.json();
    return parseEspnScoreboard(json);
  } catch (e) {
    logError("world-cup-live-feed/fetch", e);
    return [];
  }
}

// Maps the ESPN feed entries onto our fixture rows by matching kickoff + teams.
// kickoff time is the disambiguator when the same teams play more than once.
// Returns only matches where the fixture is recognised AND the status is one
// we care about (live, halftime, or final).
export interface MappedLiveMatch extends FeedMatch {
  fixtureNumber: number;
  stage: string;
  groupName: string | null;
}

export function mapToFixtures(
  feed: FeedMatch[],
  fixtures: Array<{ fixtureNumber: number; stage: string; groupName: string | null; team1: string | null; team2: string | null; kickoffAt: Date }>,
): MappedLiveMatch[] {
  const out: MappedLiveMatch[] = [];
  // Compare via normalizeKey so the match is accent-insensitive AND
  // whitespace-insensitive. Belt-and-braces alongside the alias bank —
  // catches cases like "Curaçao" vs "Curacao" or "São Tomé" vs "Sao Tome"
  // even when we haven't aliased the accented form yet.
  const sameName = (a: string | null, b: string) =>
    a !== null && normalizeKey(a) === normalizeKey(b);
  for (const m of feed) {
    if (m.status === "scheduled") continue;
    // 1. Try exact team match within ±6h of kickoff (covers timezone drift).
    const hit = fixtures.find((f) => {
      const sameTeams = (sameName(f.team1, m.team1) && sameName(f.team2, m.team2)) ||
                       (sameName(f.team1, m.team2) && sameName(f.team2, m.team1));
      if (!sameTeams) return false;
      const diff = Math.abs(f.kickoffAt.getTime() - m.kickoffAt.getTime());
      return diff < 6 * 3600 * 1000;
    });
    if (!hit) continue;
    // Handle the case where ESPN flips home/away vs our seed — orient scores
    // (and winner / shootout) to our team1/team2 ordering so downstream
    // maths is consistent.
    const flipped = sameName(hit.team1, m.team2) && sameName(hit.team2, m.team1);
    out.push({
      ...m,
      team1: hit.team1!,
      team2: hit.team2!,
      team1Goals: flipped ? m.team2Goals : m.team1Goals,
      team2Goals: flipped ? m.team1Goals : m.team2Goals,
      team1Winner: flipped ? m.team2Winner : m.team1Winner,
      team2Winner: flipped ? m.team1Winner : m.team2Winner,
      team1Shootout: flipped ? m.team2Shootout : m.team1Shootout,
      team2Shootout: flipped ? m.team1Shootout : m.team2Shootout,
      fixtureNumber: hit.fixtureNumber,
      stage: hit.stage,
      groupName: hit.groupName,
    });
  }
  return out;
}
