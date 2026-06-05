// Shared cache tag constants. Living in their own module so any server
// action can import them without dragging in page-specific imports.
//
// Pattern: matching unstable_cache wrappers tag their data with one of
// these; matching server actions call updateTag(<tag>) after a mutation
// so the next read sees fresh data without waiting for the revalidate TTL.

export const RATEBOOK_CACHE_TAG = "ratebook-aggregates";

// Lookup tables read by almost every page. Mutated only via admin pages.
// We cache them cross-request — the per-request React cache() saves
// duplicate reads inside a render, but only this tag survives across
// the whole app.
export const SALES_EXECS_TAG = "lookup-sales-execs";
export const CUSTOMERS_TAG = "lookup-customers";
export const GROUP_SITES_TAG = "lookup-group-sites";
export const STAGE_CHECK_DEFS_TAG = "lookup-stage-check-defs";

// Funders never mutate at runtime — they're seeded from settings.json and
// stay constant for the lifetime of the deploy. Keeping the tag here for
// symmetry; in practice nothing calls updateTag on it.
export const FUNDERS_TAG = "lookup-funders";
