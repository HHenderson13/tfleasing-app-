"use server";

import { db } from "@/db";
import { users, wcFixtures, wcLiveScores, wcPayments, wcPredictions, wcResults } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { WC_CACHE_TAGS } from "@/lib/world-cup-data";
import { z } from "zod";
import { requireWcAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import {
  computeGroupStandings,
  scorePrediction,
  winnerForGroup,
} from "@/lib/world-cup-scoring";
import { commitFixtureResult } from "@/lib/world-cup-settle";

const resultSchema = z.object({
  fixtureNumber: z.number().int().min(1).max(104),
  team1Goals: z.number().int().min(0).max(30),
  team2Goals: z.number().int().min(0).max(30),
  // Knockouts only — ET goals + pens for tiebreaker info. Optional in the
  // schema; required at validation time when stage !== 'group' and
  // team1Goals === team2Goals.
  etTeam1Goals: z.number().int().min(0).max(30).nullable().optional(),
  etTeam2Goals: z.number().int().min(0).max(30).nullable().optional(),
  penTeam1: z.number().int().min(0).max(30).nullable().optional(),
  penTeam2: z.number().int().min(0).max(30).nullable().optional(),
});

export interface SaveResultOutcome {
  ok: boolean;
  error?: string;
  advancedTo?: { fixtureNumber: number; slot: "t1" | "t2" } | null;
  groupComplete?: { groupName: string; top1: string; top2: string; third: string } | null;
}

// Enters or updates a match result. Triggers:
//   • scoring of every wc_predictions row for that fixture
//   • auto-advance of the winner to the next-round slot (knockouts only)
//   • when a group's 6 matches are all settled, group standings are
//     surfaced back to the caller so the admin can confirm 3rd-place
//     qualifiers manually (see also: resolveGroupAdvancement).
export async function recordResultAction(input: {
  fixtureNumber: number;
  team1Goals: number;
  team2Goals: number;
  etTeam1Goals?: number | null;
  etTeam2Goals?: number | null;
  penTeam1?: number | null;
  penTeam2?: number | null;
}): Promise<SaveResultOutcome> {
  const user = await requireWcAdmin();
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const [fx] = await db.select().from(wcFixtures).where(eq(wcFixtures.fixtureNumber, parsed.data.fixtureNumber)).limit(1);
    if (!fx) return { ok: false, error: "Fixture not found" };
    if (!fx.team1 || !fx.team2) return { ok: false, error: "Set the teams on this fixture before entering a result." };

    // Decide the winner. For knockouts we need a winner — if normal time is
    // level, ET then pens take over.
    const winner = resolveWinner(
      parsed.data,
      fx.stage,
      fx.team1,
      fx.team2,
    );
    if (winner === "ERR_TIE") {
      return { ok: false, error: "Knockout matches can't end level — enter extra time / penalties." };
    }

    const now = new Date();
    const { advancedTo } = await commitFixtureResult({
      fx,
      team1Goals: parsed.data.team1Goals,
      team2Goals: parsed.data.team2Goals,
      etTeam1Goals: parsed.data.etTeam1Goals,
      etTeam2Goals: parsed.data.etTeam2Goals,
      penTeam1: parsed.data.penTeam1,
      penTeam2: parsed.data.penTeam2,
      winnerTeam: winner,
      settledByUserId: user.id,
      now,
    });

    // If a group game has been settled, see if the group is complete and
    // surface the top 3 so admin can resolve advancement.
    let groupComplete: SaveResultOutcome["groupComplete"] = null;
    if (fx.stage === "group" && fx.groupName) {
      const standings = await computeStandingsForGroup(fx.groupName);
      const groupFixtures = await db.select().from(wcFixtures).where(and(eq(wcFixtures.stage, "group"), eq(wcFixtures.groupName, fx.groupName)));
      const settledFixtures = await db.select().from(wcResults).where(inArray(wcResults.fixtureNumber, groupFixtures.map((f) => f.fixtureNumber)));
      if (settledFixtures.length === groupFixtures.length && standings.length >= 3) {
        groupComplete = {
          groupName: fx.groupName,
          top1: standings[0].team,
          top2: standings[1].team,
          third: standings[2].team,
        };
      }
    }

    revalidatePath("/world-cup");
    revalidatePath("/world-cup/predictions");
    revalidatePath("/world-cup/leaderboard");
    revalidatePath("/world-cup/groups");
    revalidatePath("/world-cup/admin");

    return { ok: true, advancedTo, groupComplete };
  } catch (e) {
    logError("world-cup/admin/recordResultAction", e, { input });
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

function resolveWinner(
  r: {
    team1Goals: number; team2Goals: number;
    etTeam1Goals?: number | null; etTeam2Goals?: number | null;
    penTeam1?: number | null; penTeam2?: number | null;
  },
  stage: string,
  team1: string,
  team2: string,
): string | "ERR_TIE" {
  if (r.team1Goals > r.team2Goals) return team1;
  if (r.team1Goals < r.team2Goals) return team2;
  if (stage === "group") return "Draw";
  // Knockouts — tied at FT. Check ET.
  if (r.etTeam1Goals != null && r.etTeam2Goals != null) {
    if (r.etTeam1Goals > r.etTeam2Goals) return team1;
    if (r.etTeam1Goals < r.etTeam2Goals) return team2;
  }
  // Still tied — check pens.
  if (r.penTeam1 != null && r.penTeam2 != null) {
    if (r.penTeam1 > r.penTeam2) return team1;
    if (r.penTeam1 < r.penTeam2) return team2;
  }
  return "ERR_TIE";
}

async function computeStandingsForGroup(groupName: string) {
  const fixtures = await db.select().from(wcFixtures).where(and(eq(wcFixtures.stage, "group"), eq(wcFixtures.groupName, groupName)));
  const results = await db.select().from(wcResults).where(inArray(wcResults.fixtureNumber, fixtures.map((f) => f.fixtureNumber)));
  const resultByFx = new Map(results.map((r) => [r.fixtureNumber, r]));
  const teams = Array.from(new Set(fixtures.flatMap((f) => [f.team1, f.team2]).filter(Boolean))) as string[];
  const settled = fixtures
    .map((f) => {
      const r = resultByFx.get(f.fixtureNumber);
      if (!r || !f.team1 || !f.team2) return null;
      return { team1: f.team1, team2: f.team2, team1Goals: r.team1Goals, team2Goals: r.team2Goals };
    })
    .filter((x): x is { team1: string; team2: string; team1Goals: number; team2Goals: number } => x !== null);
  return computeGroupStandings(teams, settled);
}

// Admin resolves the 32 R32 slots. The auto-advance from group winners only
// produces the top-2-from-each-group qualifiers (24 teams); the eight 3rd-
// placed qualifiers depend on cross-group comparison and historically have
// been a manual call. We let admin specify R32 team1/team2 directly via this
// action — same shape as editing any fixture's teams.
const editTeamsSchema = z.object({
  fixtureNumber: z.number().int().min(73).max(104),
  team1: z.string().trim().max(64).nullable(),
  team2: z.string().trim().max(64).nullable(),
});

export async function setKnockoutTeamsAction(input: { fixtureNumber: number; team1: string | null; team2: string | null }) {
  await requireWcAdmin();
  const parsed = editTeamsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db.update(wcFixtures).set({ team1: parsed.data.team1 || null, team2: parsed.data.team2 || null }).where(eq(wcFixtures.fixtureNumber, parsed.data.fixtureNumber));
  updateTag(WC_CACHE_TAGS.fixtures); // bracket + all-fixtures caches depend on this
  revalidatePath("/world-cup");
  revalidatePath("/world-cup/predictions");
  revalidatePath("/world-cup/admin");
  return { ok: true as const };
}

// Grant or revoke wc / wc_admin role on a user. wc_admin implies wc.
// We never touch other roles a user has.
const accessSchema = z.object({
  userId: z.string().min(1),
  level: z.enum(["none", "wc", "wc_admin"]),
});

export async function setWcAccessAction(input: { userId: string; level: "none" | "wc" | "wc_admin" }) {
  await requireWcAdmin();
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const [u] = await db.select({ roles: users.roles }).from(users).where(eq(users.id, parsed.data.userId)).limit(1);
  if (!u) return { ok: false as const, error: "User not found" };
  const current: string[] = JSON.parse(u.roles || "[]");
  const others = current.filter((r) => r !== "wc" && r !== "wc_admin");
  const next = parsed.data.level === "none" ? others
    : parsed.data.level === "wc" ? [...others, "wc"]
    : [...others, "wc_admin"];
  await db.update(users).set({ roles: JSON.stringify(Array.from(new Set(next))), updatedAt: new Date() }).where(eq(users.id, parsed.data.userId));
  revalidatePath("/world-cup/admin");
  return { ok: true as const };
}

// Create a new wc-only user. Admin sets the password directly — they hand
// the credentials to the player. Player can change it later via the existing
// password reset flow (not yet built in this app, but the user table is
// otherwise standard).
const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

export async function createWcUserAction(input: { name: string; email: string; password: string }) {
  await requireWcAdmin();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing.length > 0) return { ok: false as const, error: "A user with that email already exists" };

  const { randomUUID } = await import("node:crypto");
  const { hashPassword, serializeRoles } = await import("@/lib/auth");
  const now = new Date();
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    roles: serializeRoles(["wc"]),
    salesExecId: null,
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/world-cup/admin");
  return { ok: true as const, userId: id };
}

// Live-score update during an in-progress match. wc_admin only. Upserts the
// wc_live_scores row, which the landing page reads to show the "leading on
// this match" widget. Clearing the live score (pass null) makes the widget
// disappear — useful if a final result has been entered separately.
const liveScoreSchema = z.object({
  fixtureNumber: z.number().int().min(1).max(104),
  team1Goals: z.number().int().min(0).max(30),
  team2Goals: z.number().int().min(0).max(30),
  minute: z.number().int().min(0).max(150).nullable().optional(),
});

export async function setLiveScoreAction(input: {
  fixtureNumber: number;
  team1Goals: number;
  team2Goals: number;
  minute?: number | null;
}) {
  const user = await requireWcAdmin();
  const parsed = liveScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Hard-stop on settled fixtures — once the canonical result is in, the
  // projection no longer means anything.
  const [existingResult] = await db
    .select({ fixtureNumber: wcResults.fixtureNumber })
    .from(wcResults)
    .where(eq(wcResults.fixtureNumber, parsed.data.fixtureNumber))
    .limit(1);
  if (existingResult) return { ok: false as const, error: "Match already settled — clear the result first if you want to track it live again." };

  const now = new Date();
  await db
    .insert(wcLiveScores)
    .values({
      fixtureNumber: parsed.data.fixtureNumber,
      team1Goals: parsed.data.team1Goals,
      team2Goals: parsed.data.team2Goals,
      minute: parsed.data.minute ?? null,
      updatedAt: now,
      updatedByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: wcLiveScores.fixtureNumber,
      set: {
        team1Goals: parsed.data.team1Goals,
        team2Goals: parsed.data.team2Goals,
        minute: parsed.data.minute ?? null,
        updatedAt: now,
        updatedByUserId: user.id,
      },
    });
  revalidatePath("/world-cup");
  revalidatePath("/world-cup/admin");
  return { ok: true as const };
}

export async function clearLiveScoreAction(fixtureNumber: number) {
  await requireWcAdmin();
  await db.delete(wcLiveScores).where(eq(wcLiveScores.fixtureNumber, fixtureNumber));
  revalidatePath("/world-cup");
  revalidatePath("/world-cup/admin");
  return { ok: true as const };
}

// Mark a player as paid / unpaid. wc_admin only.
const paidSchema = z.object({ userId: z.string().min(1), paid: z.boolean() });

export async function setPaidStatusAction(input: { userId: string; paid: boolean }) {
  const me = await requireWcAdmin();
  const parsed = paidSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (parsed.data.paid) {
    await db
      .insert(wcPayments)
      .values({ userId: parsed.data.userId, paidAt: new Date(), markedByUserId: me.id })
      .onConflictDoUpdate({
        target: wcPayments.userId,
        set: { paidAt: new Date(), markedByUserId: me.id },
      });
  } else {
    await db.delete(wcPayments).where(eq(wcPayments.userId, parsed.data.userId));
  }
  revalidatePath("/world-cup");
  revalidatePath("/world-cup/admin");
  return { ok: true as const };
}

// Manual override — used when a knockout fixture or a 3rd-place qualifier
// is wrong (e.g. admin mis-typed a group result earlier). Forces a re-
// computation of every cached point from scratch. Idempotent.
export async function recomputeAllPointsAction() {
  await requireWcAdmin();
  const fixtures = await db.select().from(wcFixtures);
  const fxMap = new Map(fixtures.map((f) => [f.fixtureNumber, f]));
  const results = await db.select().from(wcResults);
  const resByFx = new Map(results.map((r) => [r.fixtureNumber, r]));
  const preds = await db.select().from(wcPredictions);
  const now = new Date();
  for (const p of preds) {
    const r = resByFx.get(p.fixtureNumber);
    const f = fxMap.get(p.fixtureNumber);
    if (!r || !f) {
      await db.update(wcPredictions).set({ points: null, updatedAt: now }).where(eq(wcPredictions.id, p.id));
      continue;
    }
    const pts = scorePrediction(
      { team1Goals: p.team1Goals, team2Goals: p.team2Goals },
      { team1Goals: r.team1Goals, team2Goals: r.team2Goals },
      f.stage,
    );
    await db.update(wcPredictions).set({ points: pts.total, updatedAt: now }).where(eq(wcPredictions.id, p.id));
  }
  revalidatePath("/world-cup/leaderboard");
  return { ok: true as const, count: preds.length };
}

// quiet unused-import lint when sql appears unused above (it's imported
// for future raw-SQL needs in this file).
void sql; void winnerForGroup;
