"use server";

import { db } from "@/db";
import { wcFixtures, wcPredictions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWcAccess } from "@/lib/auth-guard";
import { winnerForGroup } from "@/lib/world-cup-scoring";

// Scorelines are bounded — a 50-0 thrash is more likely a typo than a real
// prediction. Same numbers we'd see in a real World Cup tournament.
const predictionSchema = z.object({
  fixtureNumber: z.number().int().min(1).max(104),
  team1Goals: z.number().int().min(0).max(20),
  team2Goals: z.number().int().min(0).max(20),
});

export interface SavePredictionResult {
  ok: boolean;
  error?: string;
}

export async function savePredictionAction(
  input: { fixtureNumber: number; team1Goals: number; team2Goals: number },
): Promise<SavePredictionResult> {
  const user = await requireWcAccess();
  const parsed = predictionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const [fx] = await db.select().from(wcFixtures).where(eq(wcFixtures.fixtureNumber, parsed.data.fixtureNumber)).limit(1);
  if (!fx) return { ok: false, error: "Fixture not found" };
  if (!fx.team1 || !fx.team2) return { ok: false, error: "Teams for this fixture aren't set yet — wait for the bracket to advance." };
  if (fx.kickoffAt.getTime() <= Date.now()) return { ok: false, error: "Match has already kicked off — predictions are locked." };

  const predictedWinner = winnerForGroup(parsed.data.team1Goals, parsed.data.team2Goals, fx.team1, fx.team2);
  const now = new Date();

  // Upsert by (userId, fixtureNumber). We don't reset points — points get
  // written when the result lands (batch 3); editing a prediction before
  // kickoff just overwrites the inputs.
  const [existing] = await db
    .select()
    .from(wcPredictions)
    .where(and(eq(wcPredictions.userId, user.id), eq(wcPredictions.fixtureNumber, parsed.data.fixtureNumber)))
    .limit(1);

  if (existing) {
    await db
      .update(wcPredictions)
      .set({
        team1Goals: parsed.data.team1Goals,
        team2Goals: parsed.data.team2Goals,
        predictedWinner,
        updatedAt: now,
      })
      .where(eq(wcPredictions.id, existing.id));
  } else {
    await db.insert(wcPredictions).values({
      userId: user.id,
      fixtureNumber: parsed.data.fixtureNumber,
      team1Goals: parsed.data.team1Goals,
      team2Goals: parsed.data.team2Goals,
      predictedWinner,
      points: null,
      submittedAt: now,
      updatedAt: now,
    });
  }

  revalidatePath("/world-cup/predictions");
  revalidatePath("/world-cup");
  return { ok: true };
}
