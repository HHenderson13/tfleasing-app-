<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TF Leasing — agent notes

Conventions and decisions that are easy to forget once you're three files
deep. Update this file when you make a decision worth remembering.

## Auth model

Roles live as a JSON array on `users.roles`. Defined in `src/lib/auth.ts`:
`admin`, `exec`, `quote`, `stock`.

Helpers in `src/lib/auth-guard.ts` redirect to `/login` or `/forbidden`:
- `requireUser()`       — any signed-in user.
- `requireAdmin()`      — admin only.
- `requireProposalsAccess()` — admin or exec.
- `requireOrdersAccess()` — admin or exec.
- `requireQuoteAccess()` — admin, exec, or `quote` role.
- `requireStockAccess()` — admin, exec, or `stock` role.

`getCurrentUser()` triggers `ensureAppSchema()` as a side effect. Cron routes
that bypass cookies (under `/api/cron/*`) need to call `ensureAppSchema()`
explicitly — see `daily-summary/route.ts`.

## Route → guard matrix

| Route                              | Guard                          |
|------------------------------------|--------------------------------|
| `/`                                | `requireUser`                  |
| `/quote`                           | `requireQuoteAccess`           |
| `/stock`, `/admin/stock`           | `requireStockAccess` / `requireAdmin` |
| `/proposals`, `/search`            | `requireProposalsAccess`       |
| `/orders`, `/orders/awaiting`, `/orders/delivered`, `/orders/[id]`, `/customers/[id]` | `requireOrdersAccess` |
| `/reports`                         | `requireAdmin` (exec data excluded for non-admins inside the page) |
| `/funders`, `/scraper`             | `requireAdmin`                 |
| `/broker-ratebooks`                | `requireAdmin`                 |
| `/admin/*`                         | `requireAdmin`                 |
| `/api/funders/snapshot`            | `requireAdmin`                 |
| `/api/broker-ratebooks/*`          | `requireAdmin`                 |
| `/api/scraper/*` (except upload)   | `requireAdmin`                 |
| `/api/scraper/upload`              | `requireAdmin` OR `x-api-key` matching `SCRAPER_API_KEY` (middleware validates the value) |
| `/api/cron/daily-summary`          | `CRON_SECRET` header (Vercel cron) |
| `/api/cron/daily-preview`          | `requireAdmin` |
| `/api/cron/stock-match-debug`      | `requireAdmin` |
| `/api/email/test`                  | `requireAdmin` |
| `/api/blob/upload`                 | session + admin role check on token issue |

If you add a route, add it here.

## Database

- Engine: libSQL / Turso (production), local sqlite file (`data/tf.db`) in dev.
- Schema: `src/db/schema.ts` (drizzle).
- Migrations: **`src/db/ensure-schema.ts` is canonical.** It runs idempotently
  via `getCurrentUser()` and is called explicitly by cron handlers. The
  `drizzle/` folder and `drizzle.config.ts` were removed — don't add new
  drizzle migrations; add to `ensure-schema` instead. Pattern:
  - new column → `ensureColumns(table, [{ name, sqlType }])`
  - new table  → an `ensureXTable()` with `CREATE TABLE IF NOT EXISTS`.
  - seed data  → use `INSERT OR IGNORE` so admin edits aren't overwritten.
- Schema changes must be **additive** unless we have a planned data
  migration. Adding nullable columns or NOT NULL DEFAULTs is safe; renames
  and drops are not.

## Money math

The broker ratebook export uses two functions that must keep agreeing with
the Pricing Engine on the user's desktop. Both have tests
(`src/lib/*.test.ts`). Run them with `npm test`.

- `pmtDue(monthlyRate, nper, pv)` — annuity-due payment. At rate=0, falls
  back to flat split `pv / nper` so the £0 commission tier is a clean
  identity.
- `solveAnnualRate(sub, rental1, rental12)` — bisects on the annuity-due
  factor to back out the annual interest rate from two rentals on the same
  vehicle/term but different upfronts. Throws if 12-adv ≥ 1-adv.

When you touch either of these, run `npm test` before pushing.

## Shared UI primitives

- `<StatTile />` — `src/components/stat-tile.tsx`. Used on every dashboard
  page (orders/awaiting/delivered/proposals). Pass `tone`; optionally
  `href` (becomes a Link with active ring). Don't reimplement.
- `<Section title empty>…</Section>` — `src/components/section.tsx`
  (re-exported from `src/app/orders/order-row.tsx` for back-compat).
- `<BackLink fallback />` — `src/components/back-link.tsx`. History-aware
  back button; falls back to the provided path on direct loads.

## Logging

Use `logError(at, err, ctx)` from `src/lib/logger.ts`, not `console.error`,
in API routes / server actions. Output is JSON so Vercel logs are queryable.

## Tests

- `npm test` runs vitest. Math libs only — no DOM, no DB.
- Add a test before changing `pmtDue`, `expandIrms`, `mergePerSlot`,
  `solveAnnualRate`, or `solveAllTerms`.

## Decisions worth remembering

- **Internal data only.** Never touch existing customer / proposal / stock
  rows in code changes. Schema additions and code refactors are fine; data
  mutations require explicit ask. (User direction, 2026-05-26.)
- **Broker ratebook math currently applies interest only to commission, not
  the bare rental upfront conversion.** The source ratebook already prices
  funder financing into the 6× rental, so re-spreading the base across
  different upfronts is a flat split. If we ever want true rate-based
  pricing across upfronts, `expandIrms` must use `pmtDue` for the base as
  well. Open decision — keep the flat math for now.
- **Per-funder, per-term interest rates** live in `funder_interest_rates`,
  seeded from `Ratebook Pricing Engine/settings.json`. The Interest Rates
  section on `/broker-ratebooks` lets admins back-solve and overwrite them
  from a 1+ vs 12+ rental pair on the same vehicle/term.
- **`/api/scraper/upload`** has two auth paths: admin session OR
  `x-api-key === SCRAPER_API_KEY`. The middleware also validates the key
  value — defence in depth, both layers check.
- **DST cron**: `daily-summary` is scheduled at `06:30 UTC` and `07:30 UTC`.
  The handler exits early unless `ukHour === 7`, so exactly one tick runs
  per day depending on BST/GMT. Don't "fix" this to a single schedule.
- **No drizzle migrations.** See Database section above.

## Local development

- `npm run dev` — Next.js dev server.
- `npm test`    — vitest (math libs).
- `npm run build` — production build, also catches type errors that don't
  fail dev.
- Stock match diagnostics: GET `/api/cron/stock-match-debug` (admin only).
- Email preview to your inbox: GET
  `/api/cron/daily-preview?to=you@example.com&exec=<execId>` (admin only).
