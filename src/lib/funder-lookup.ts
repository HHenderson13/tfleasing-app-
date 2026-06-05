import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { funders } from "@/db/schema";
import { asc } from "drizzle-orm";
import { FUNDERS_TAG } from "./cache-tags";

// Funders are seeded once and don't mutate at runtime — perfect cross-
// request cache target. The two-tier wrapper (unstable_cache outside,
// React cache() inside) ensures both cross-request reuse AND within-
// render dedup.

const fetchFundersOrdered = unstable_cache(
  async () => db.select().from(funders).orderBy(asc(funders.name)),
  ["lookup-funders-ordered"],
  { tags: [FUNDERS_TAG], revalidate: 86_400 },
);

const fetchFundersUnordered = unstable_cache(
  async () => db.select().from(funders),
  ["lookup-funders"],
  { tags: [FUNDERS_TAG], revalidate: 86_400 },
);

export const cachedFundersOrdered = cache(() => fetchFundersOrdered());
export const cachedFunders = cache(() => fetchFundersUnordered());
