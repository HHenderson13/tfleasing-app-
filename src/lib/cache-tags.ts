// Shared cache tag constants. Living in their own module so any server
// action can import them without dragging in page-specific imports.
//
// Pattern: matching unstable_cache wrappers tag their data with one of
// these; matching server actions call updateTag(<tag>) after a mutation
// so the next read sees fresh data without waiting for the revalidate TTL.

export const RATEBOOK_CACHE_TAG = "ratebook-aggregates";
