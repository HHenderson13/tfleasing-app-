import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { vehicles, funderCommission, modelDiscounts } from "@/db/schema";
import {
  VEHICLES_TAG,
  FUNDER_COMMISSION_TAG,
  MODEL_DISCOUNTS_TAG,
} from "./cache-tags";

// Cross-request caches for the admin-only mutation tables. The two-tier
// wrapper (unstable_cache outside, React cache() inside) is the same
// pattern used in lib/proposals.ts and lib/funder-lookup.ts.
//
// TTL is long (1 day) because mutations only happen via admin pages —
// the matching admin action calls updateTag(<tag>) for read-your-own-
// writes, so cache freshness doesn't depend on the TTL.

const ONE_DAY = 86_400;

const fetchVehicles = unstable_cache(
  async () => db.select().from(vehicles),
  ["lookup-vehicles"],
  { tags: [VEHICLES_TAG], revalidate: ONE_DAY },
);

const fetchFunderCommissions = unstable_cache(
  async () => db.select().from(funderCommission),
  ["lookup-funder-commission"],
  { tags: [FUNDER_COMMISSION_TAG], revalidate: ONE_DAY },
);

const fetchModelDiscounts = unstable_cache(
  async () => db.select().from(modelDiscounts),
  ["lookup-model-discounts"],
  { tags: [MODEL_DISCOUNTS_TAG], revalidate: ONE_DAY },
);

export const cachedVehicles = cache(() => fetchVehicles());
export const cachedFunderCommissions = cache(() => fetchFunderCommissions());
export const cachedModelDiscounts = cache(() => fetchModelDiscounts());
