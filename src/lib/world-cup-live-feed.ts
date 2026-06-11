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
  minute: number | null;
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
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
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
      const minute = status === "live" ? parseMinute(comp.status) : null;

      if (!homeName || !awayName) continue;
      out.push({
        espnId,
        team1: homeName,
        team2: awayName,
        team1Goals: homeGoals,
        team2Goals: awayGoals,
        status,
        minute,
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

function parseMinute(s: unknown): number | null {
  if (!s || typeof s !== "object") return null;
  const clock = (s as Record<string, unknown>).displayClock;
  if (typeof clock === "string") {
    // ESPN uses "32'" or "32:15" depending on sport — strip the apostrophe.
    const n = parseInt(clock.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
  for (const m of feed) {
    if (m.status === "scheduled") continue;
    // 1. Try exact team match within ±6h of kickoff (covers timezone drift).
    const hit = fixtures.find((f) => {
      const sameTeams = (f.team1 === m.team1 && f.team2 === m.team2) ||
                       (f.team1 === m.team2 && f.team2 === m.team1);
      if (!sameTeams) return false;
      const diff = Math.abs(f.kickoffAt.getTime() - m.kickoffAt.getTime());
      return diff < 6 * 3600 * 1000;
    });
    if (!hit) continue;
    // Handle the case where ESPN flips home/away vs our seed — orient scores
    // to our team1/team2 ordering so downstream maths is consistent.
    const flipped = hit.team1 === m.team2 && hit.team2 === m.team1;
    out.push({
      ...m,
      team1: hit.team1!,
      team2: hit.team2!,
      team1Goals: flipped ? m.team2Goals : m.team1Goals,
      team2Goals: flipped ? m.team1Goals : m.team2Goals,
      fixtureNumber: hit.fixtureNumber,
      stage: hit.stage,
      groupName: hit.groupName,
    });
  }
  return out;
}
