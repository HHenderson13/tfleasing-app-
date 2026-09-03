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
| `/enquiries`                       | `requireUser`                  |
| `/enquiries/upload`                | `requireAdmin`                 |
| `/broker`, `/broker/stock`         | `requireBrokerUser` (broker portal — separate auth, see below) |
| `/broker/terms`                    | `requireBrokerUser` (must be reachable BEFORE acceptance) |
| `/broker/login`, `/broker/setup/[token]` | public (broker portal)   |
| `/api/broker/*`                    | broker session (middleware) + `getCurrentBrokerUser` in the handler |

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
- `<StockBrowser rows audience />` — `src/components/stock-browser.tsx`.
  The faceted stock list. Rendered by BOTH `/stock` and `/broker/stock`;
  read the Broker portal section before changing it. `src/app/stock/browser.tsx`
  re-exports it for back-compat.

## Broker portal

A second, self-contained portal at `/broker`. Brokers see **one tab —
Stock** — and nothing else.

### Auth

Completely parallel to the TF app, never overlapping:

- `src/lib/broker-auth.ts` — own cookie (`tf_broker_session`, Path-scoped
  to `/broker`), own tables (`brokers`, `broker_users`,
  `broker_sessions`). A TF session can never satisfy a `/broker` route and
  a broker session can never satisfy a TF route; `src/middleware.ts`
  enforces this and the cookie path is defence in depth.
- **The portal is unbranded, deliberately.** Nothing a broker can reach
  says "TrustFord" — not the watermark, the print notice, the capture
  dialogs, the clipboard replacement text, nor the browser tab.
  `src/app/broker/layout.tsx` exists solely to retitle the segment
  ("Stock Portal") so the tab, bookmarks and any screenshot including the
  tab bar stay clean; the root layout still titles the staff app. **That
  layout must never gain a guard** — `/broker/login` and
  `/broker/setup/[token]` live under the same segment and have to stay
  reachable without a session. Check with:
  `grep -rIn "TrustFord" src/app/broker src/lib/broker-*.ts` — expect zero.
- Guards: `requireBrokerUser()` proves who they are.
  **`requireBrokerTermsAccepted()` is the one to use on any page that shows
  stock** — it also proves they accepted the current terms. `/broker/terms`
  deliberately uses the weaker guard, because gating it on acceptance would
  redirect it to itself forever. **Every `/broker` page must call one.** There is no `/broker/layout.tsx` guard because
  `/broker/login` and `/broker/setup` live under the same segment and must
  stay public.
- **Brokers have no self-service and no privilege tiers.** Everything —
  creating a broker company, adding a user, disabling, deleting, issuing a
  password reset — happens at `/admin/brokers`, behind `requireAdmin()`.
  See the decision note below.

### One component, two audiences

`/stock` and `/broker/stock` render the **same** `<StockBrowser />`, on
purpose: work on the stock UI has to reach brokers without being written
twice. The broker view is that view minus things, expressed in exactly
two places:

1. **`redactForBroker()` in `lib/stock-list.ts`** — strips sensitive
   fields on the **server**, before the payload is serialised. This is the
   real boundary. Hiding a field in JSX is *not* enough: a server-rendered
   payload is readable in page source. It builds a fresh object rather
   than deleting keys, so forgetting about a new field means it's
   *missing* from the broker view (visible, harmless) rather than leaked.
   `stock-list.test.ts` asserts the whole guarantee, including that no
   sensitive value survives `JSON.stringify`.
2. **The `audience` prop** on `<StockBrowser />` — presentation only. Each
   facet / sort entry carries an optional `only: "tf" | "broker"`; no flag
   means both audiences get it. That default matters: new stock features
   should reach brokers automatically.

Add an `only:` flag **and** a `redactForBroker` change together. The flag
alone is cosmetic, not privacy.

What brokers deliberately never see, and why:

| Hidden                      | Why |
|-----------------------------|-----|
| VIN, order number           | Internal identifiers. The reference replaces them. |
| Dealer, destination         | Reveals our network and where a unit sits. |
| Status                      | Internal pipeline language — replaced by Availability (below). |
| Model year                  | Commercially sensitive; old plate reads as old stock. |
| Interest bearing, adopted   | Funding. Never visible in any form — no tag, no filter, no column. |
| Gate released               | Build milestone, and a back door to the ageing figure. |
| Arrival date, days in stock | `delivered` is redacted outright. "In stock since 12 May" says how long we've been sitting on it. |
| ETA urgency                 | No red/amber overdue tone, no "in N days" countdown. That's our schedule pressure, not theirs. |
| Excel export                | No export button on the broker view, and no route that would serve one. |

**Availability** replaces Status for brokers, in two related pieces that
must not be confused:

- `availabilityLabel` / `availabilitySortKey` — the **facet**. Buckets by
  month: `In stock` → `Oct 2026` → `Nov 2026` → … → `ETA to be confirmed`,
  sorted chronologically (not alphabetically — the labels sort wrong).
  Month granularity because that is a useful filter.
- `brokerAvailability(row)` — what **one vehicle** says, used by both the
  badge and the Availability line in the expanded card, so a card cannot
  contradict itself. Returns `Available now`, a date, `Due now`, or
  `To be confirmed`.

Both derive from `inStock` + `eta`, the only two scheduling fields that
survive redaction. `inStock` is computed **server-side** in `stock-list.ts`
so brokers get availability without status ever reaching the browser.

**One badge component, two states.** `BrokerAvailabilityBadge` is the only
badge a broker sees. It exists because the previous arrangement — a shared
`DeliveredBadge` and `EtaBadge` with `audience` / `showDays` flags threaded
through them — drifted: an in-stock car *with* a delivered date advertised
the date it landed while one without said "Available now", and an overdue
ETA turned red and announced how many days late we were. Same list, three
different stories. Keep every broker badge state inside that one component.

An **elapsed ETA collapses to "Due now"** rather than showing the stale
date. A vehicle sits past its ETA when it's late or when the feed hasn't
caught up, and "Arriving 02 May" read in September looks broken. The facet
still buckets it under its original month — that's a filter, not a claim
about today.

### Capture deterrence

**Start here: a web page cannot stop a screenshot.** Print Screen, macOS
Cmd+Shift+4, the Windows Snipping Tool and the button combo on every phone
capture the OS framebuffer. The browser is not consulted and has no API to
object. Nothing in this codebase changes that, and any change that claims
to is wrong. Phone photographs and phone screenshots are not detectable
at all.

What we do instead, in descending order of what it actually achieves:

1. **Watermark** — `lib/broker-watermark.ts` builds a rotated, tiled SVG
   carrying the viewer's name, email, broker, timestamp and a session tag,
   inlined as a `background-image` on a fixed overlay by
   `broker/watermark-frame.tsx`. **Server-rendered**, so it is in the
   delivered HTML and paints without JS. This is the only measure that
   survives a successful capture, because it travels inside the picture.
   Opacity is deliberately high enough to be unmissable — a watermark
   tuned down until it stops being distracting still identifies a leaker
   afterwards, but no longer deters the leak, which is the point.
   **Two strengths.** `WATERMARK_FAINT` is worn all day (detail 0.055,
   dense 0.045) — a faint texture in use, perfectly legible once the image
   is opened, which is the only moment it needs to be. `WATERMARK_LOUD`
   (0.32 / 0.24) is repainted the instant a capture chord is detected. That
   is not decoration: a region snip (Cmd+Shift+4, Win+Shift+S) and a screen
   recording (Cmd+Shift+5) both work in two steps — press the chord, THEN
   drag the box or start recording — and the gap is long enough to repaint,
   so the snip and the recording capture the loud version. Cmd+Shift+3 takes
   the whole screen at once and will usually catch the faint one; that is
   what the faint one is for, along with every capture we cannot see at all
   (phone screenshots, a photo of the screen, OBS). **The watermark can never
   be *only* on captures** — nothing can be added to an image after the OS
   has taken it, so a floor has to be present the whole time.
   **Two layers, and both are needed.** A background tile repeats every
   WxH, so a crop only certainly contains a complete watermark when the
   tile is smaller than the crop in both axes. The detail tile is 430x215,
   which is big enough to be legible and therefore big enough that an area
   snip of one vehicle card (~1100x150) can land between rows and catch
   nothing usable — exactly the capture someone leaking a single price
   would take. So it is paired with a 200x100 tile carrying just the email,
   which every realistic snip and every phone screenshot contains at least
   one complete copy of. Do not enlarge the dense tile.
2. **A banner that says so, in words**, naming the viewer. Deterrence only
   works if they have read it.
3. **The confrontation dialog** — on a detected capture the broker gets a
   modal they must dismiss: what they did, that the image carries their
   name, that TF has been told.
4. **Shield** — content is hidden whenever the page is not focused or not
   visible. Defeats the mobile app-switcher snapshot, screen sharing while
   tabbed away, and focus-stealing capture tools. Does **not** defeat
   Cmd+Shift+4, which never blurs the window.

**On mobile specifically:** the watermark and the shield both work, and
they are the whole of it. A phone screenshot uses hardware buttons the
browser never sees — there is no web API on iOS or Android to block or
even detect one, so no alert fires and no dialog appears. The capture is
watermarked, which is the only thing that was ever going to survive it.
The one real block is `FLAG_SECURE`, and `android/` now holds a minimal
WebView shell that sets it: the OS refuses the screenshot, a screen
recording comes out black, and the app-switcher thumbnail is blank. **It
must stay a WebView, not a Trusted Web Activity** — a TWA renders inside
Chrome's own window and process, so the flag on our activity would protect
nothing. iOS exposes no equivalent, so there is no iOS counterpart and
there cannot be one. See `android/README.md` for building, signing and
distribution; it has never been compiled here (no JDK or Android SDK on
this machine).

Because a phone capture leaves no event, **the watermark timestamp ticks
once a minute** (`refreshWatermark` in `screen-guard.tsx`). Without it a
page left open all morning would stamp every capture with the time the tab
was opened; with it, a leaked mobile screenshot names the minute it was
actually taken. That is the entire reason the tile builders live in
`lib/broker-watermark-tile.ts` — client-safe — while `lib/broker-watermark.ts`
stays `server-only` for `sessionTag` (`node:crypto`). Same split, and the
same reason, as `stock-reference.ts` vs `stock-reference-mint.ts`.
5. **Print blocking** — `@media print` blanks the page. Unlike a
   screenshot, printing and print-to-PDF genuinely are blockable.
6. **Copy / selection / context-menu / drag** blocking, and
   `frame-ancestors 'none'` so the portal cannot be embedded and captured
   server-side by someone else's page.
7. **Terms acceptance** — `lib/broker-terms.ts` holds the clauses as data
   and a `BROKER_TERMS_VERSION`; `/broker/terms` gates the stock list until
   accepted, and the acceptance is stored with version, time, IP and device.
   This is what turns the watermark from an accusation into a record:
   "their name was on it" versus "their name was on it and they accepted
   these terms at 09:14 from this address". Bump the version when the
   wording changes materially rather than claiming they agreed to text they
   never saw. **The clauses are not legal advice** — they name the specific
   acts we can detect or prove, and should be reviewed before being relied
   on in a dispute. They deliberately carry **no party name** ("we", "us"),
   so the same wording drops into a paper agreement that names the parties
   in its own preamble, and survives a trading-name change. Don't
   reintroduce a company name there.
8. **Audit + alert** — everything observable is written to
   `broker_security_events` against a named user by
   `/api/broker/security-event`, and the serious kinds email
   `BROKER_SECURITY_ALERT_TO` (comma-separated). One email per user per 30
   minutes, counted over alertable kinds only so a right-click cannot
   suppress the alert for a screenshot.

`ScreenGuard` also re-applies the watermark if it is removed in DevTools,
and blanks the page on a second attempt. Treat any change that weakens the
watermark as weakening the only thing here that really works.

**`/api/broker/*` must stay inside the broker branch of `src/middleware.ts`.**
It was originally outside it, so those routes fell through to the TF branch,
demanded a TF cookie no broker has, and redirected the reporter to the TF
login — the endpoint silently did nothing. Note the trailing slash:
`/api/broker-ratebooks/*` is an **admin** route and deliberately does not
match.

### Enquiry buttons

Every broker tile carries **Get a quote** and **Secure this vehicle**, both
`mailto:broker@trustford.co.uk` links built by `lib/broker-enquiry.ts`.

- **mailto, not a form of ours.** The mail has to open in whatever the
  broker actually uses — Outlook desktop, Outlook web, Apple Mail, Gmail on
  a phone — and mailto is the only thing all of them honour. The cost is
  that we cannot validate what they type, so the body is a template with
  labelled blanks and a person checks it at our end.
- Both routes carry the full broker-visible spec **and the reference**,
  which is how the vehicle is found on our side. Quote asks for upfront,
  term, mileage and desired commission (+VAT). Secure asks the same four
  plus **rental sold at**, and says we cannot proceed without the full
  finance proposal form attached or sent separately.
- **`MAILTO_MAX` is not decoration.** Outlook on Windows truncates a mailto
  around 2,048 characters and gives no warning — the mail just opens with
  the end missing, which on the secure route would silently drop the
  finance-proposal instruction. `buildEnquiryMailto` trims the options list
  (the only unbounded field, and the least load-bearing — the reference
  identifies the vehicle regardless) until the URL fits, and marks the trim
  with `…`. `broker-enquiry.test.ts` pins that the instructions survive.
- Broker view only, via `isBroker` — TF is the other end of these emails.
  The buttons render **outside** the card's toggle `<button>`: a link
  nested in a button is invalid and browsers disagree about which one owns
  the click.

### Vehicle references

`TF-2GG495H9` — the only handle on a vehicle that exists outside TF. A
broker quotes it back to us; TF pastes it into the `/stock` search box and
lands on that exact vehicle.

- `lib/stock-reference.ts` — **client-safe**: the alphabet and
  `normaliseReferenceQuery()` (the rules for reading a reference off a
  human — case-insensitive, spaces stripped, `TF-` optional).
- `lib/stock-reference-mint.ts` — **server-only**: `vehicleReferenceFromVin()`.
  Split because `node:crypto` can't be bundled into a client component and
  the search box needs the reading rules on the client.

Truncated SHA-256 of the VIN, so it's stable across stock uploads (the
`stock_vehicles` autoincrement id is replaced every upload — the VIN hash
is the only durable handle), opaque, and needs no table or round trip.
**Never change the alphabet or the length** — a broker may be holding a
reference written down weeks ago. `stock-reference.test.ts` pins the
format with a golden value.

TF-side search treats a pasted reference as an exact lookup, but only when
it actually matches a row — eight characters of the reference alphabet is
a shape ordinary search text can accidentally take ("PANTHER5"), and
silently returning nothing for a real search would be worse than not
having the feature.

## Logging

Use `logError(at, err, ctx)` from `src/lib/logger.ts`, not `console.error`,
in API routes / server actions. Output is JSON so Vercel logs are queryable.

## Tests

- `npm test` runs vitest. Pure libs only — no DOM, no live DB.
- `vitest.config.ts` aliases the bare `server-only` specifier (Next
  provides it at build time; the package is never installed) to an empty
  stub, so a lib carrying that guard is still testable.
- Add a test before changing `pmtDue`, `expandIrms`, `mergePerSlot`,
  `solveAnnualRate`, or `solveAllTerms`.
- `stock-reference.test.ts` pins the broker reference format with a golden
  value — if it fails, the hashing changed and every reference a broker
  holds now points at nothing. Fix the code, not the expectation.
- `stock-list.test.ts` pins the broker redaction. Treat a failure there as
  a data leak, not a broken test.

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
- **The broker portal was rebuilt as stock-only (2026-09-02).** The
  previous portal carried a full quote engine — contract hire, HP, PCP,
  HP-balloon, outright, saved quotes — plus ~4,900 lines of
  `/admin/broker-data` feeding it. All deleted at the user's direction;
  it's in git history if it's ever wanted back. Kept: the broker auth
  stack, `/admin/brokers`, and `/broker-ratebooks` (which is an *admin*
  tool and unrelated to the portal despite the name). Their Drizzle
  definitions and `ensure-schema` blocks are gone, so nothing recreates
  them.
- **The quote-engine tables are dropped by a script, not by migration.**
  Schema changes here are additive only, so the rebuild left 16 orphaned
  tables behind — including `broker_settings`, which held the old engine's
  first-reg-fee / PDI / RFL defaults and read like live config. Clean them
  up with `npx tsx scripts/drop-legacy-broker-tables.ts` (dry run by
  default; `--commit` to apply, and `--force` as well before it will drop
  a table holding rows). `brokers` / `broker_users` / `broker_sessions`
  are on an explicit never-drop list. Applied to local dev on 2026-09-03;
  **production still has them** — run it against Turso deliberately, after
  a `.dump` backup.
- **Only TF manages broker accounts (2026-09-03).** Brokers used to
  self-serve: an `owner` role could invite colleagues, promote them and
  reset their passwords at `/broker/users`. That page, its actions and
  `requireBrokerOwner()` are gone at the user's direction. The portal
  exposes our stock list, so who can see it is a TF decision, and the
  smallest reliable way to enforce that is for the broker side to have no
  write path to `broker_users` at all.
  - `/admin/brokers` now does the lot: add / disable / **delete** a broker
    company, add / disable / **delete** a user, and issue a password reset
    link. Delete is permanent and cascades (users, then their sessions);
    disable stays as the reversible option and locks people out just as
    effectively.
  - Deleting a whole broker needs its name typed, and
    `deleteBrokerAction` **re-checks the typed name server-side** so the
    confirmation is part of the operation, not a UI courtesy.
  - A password reset mints a fresh setup token *and* drops every live
    session for that user, so a shared password stops working when the
    link is issued rather than when it's used. Brokers have no "forgot
    password" flow of their own — by design, they have to ask us.
  - `broker_users.role` survives as a column (schema changes here are
    additive only) but nothing reads it. New rows are written `'user'`.
- **Enquiry Tracker working day is Mon–Fri 09:00–17:30.** Confirmed by the
  user against the worked example "enquiry 17:00, transferred 10:00 next
  day = 90 mins" (30 mins to close + 60 mins next morning). The 17:30
  close doubles as the same-day-contact cut-off, so both rules key off
  one number. Targets: allocation (enquiry → transfer) 5 mins, first
  contact (transfer → contact) 15 mins, both in *business* minutes.
- **Enquiry timestamps are stored as wall-clock epochs** — local office
  time re-encoded via `Date.UTC(...)`, never a real instant. This makes
  the business-hours maths immune to BST/GMT: 09:00 is 09:00 year round.
  Everything must go through `src/lib/business-hours.ts` helpers so the
  encoding stays consistent. Tests cover the October clock change.
- **Enquiry reporting always sits one working day behind.** An enquiry is
  only reportable once the working day its clock starts in has *closed*
  (`reportableAfter` / `isEnquiryReportable` in `business-hours.ts`).
  A Saturday enquiry's clock starts Monday 09:00, so it is held until
  Monday 17:30 and first appears in Tuesday's report — likewise Friday
  evening. The current day is always held. This is deliberately blunter
  than grading each field against its own target: the export is a daily
  snapshot, so a blank contact on a lead raised this morning means "not
  finished yet", not "missed". Holding the whole enquiry back keeps every
  published figure final instead of drifting all day. Held rows are
  surfaced as a count with a drill-down, never silently dropped.
- **Enquiry uploads stack, never replace.** Rows merge on a natural-key
  hash (exec + customer ref/name + enquiry timestamp). On conflict the
  **newest upload wins** — the incoming row replaces what is stored,
  including clearing a value, so a correction made in MotorComplete
  carries through. Uploads apply in processing order, so within a
  multi-file batch the last file selected is the one that sticks.
  A single export can also list the same enquiry twice (MotorComplete
  emits a row per touchpoint in some views), so `parseEnquiryWorkbook`
  collapses same-key rows before ingest, keeping the last. The write is
  an upsert as well — a bare INSERT against a pre-loop existence snapshot
  is what caused the "UNIQUE constraint failed" upload failure.
- **The enquiry dashboard slices client-side.** The page ships every
  stored row once and `src/lib/period.ts` slices it by day / week / month,
  so stepping between periods is instant. Default view is the current
  month, with "today" resolved server-side in Europe/London so SSR and the
  client agree. If volumes ever outgrow a single payload, move the period
  range into the query instead.
- **Only Lead / Phone / Email enquiry types (column F) are measured.**
  "Prospect Call" and "Showroom" are outbound or walk-in activity where
  nobody is waiting on a call back, so grading them against the
  allocation and response targets would measure the wrong process. Blank
  or unrecognised types are excluded too — safer to omit a row than to
  grade it against a target that may not apply. Allow-list, not a
  block-list, so a new type appearing in the export cannot quietly slip
  into the figures.
- **Uploads are guarded against the wrong file.** The operator's
  downloads folder holds ~20 other MotorComplete reports saved as
  "export (N).xlsx", several using an `ag-grid` sheet with a completely
  different column layout ("SE", "Sales Type", "Order Date", …). Since
  the parser reads positionally, `assertEnquiryExport` checks five header
  cells first and throws `NotAnEnquiryExportError`, which the upload
  action surfaces verbatim. Without it, a mis-picked file ingests
  nonsense silently.
- **Lost Sale Reason "Lead Merged into Existing Customer" (column AD) is
  excluded from enquiry reporting.** A merged lead is bookkeeping, not an
  enquiry: counting it inflates volume and, since merged records rarely
  carry their own contact timestamps, drags response figures down for work
  nobody owed. Matched on letters only so spacing/case/punctuation drift
  cannot slip one through. `parseEnquiryWorkbook` returns `excludedIds`
  and ingest DELETEs them, so re-uploading a file also clears rows saved
  under an earlier ruleset — the same mechanism covers any future
  exclusion rule.
- **Joseph Rustigini and Harry Henderson are stripped from enquiry
  reports entirely** — an excluded name appearing in *any* column of the
  source row drops that row at ingest, so it can never reach the DB or a
  report. Substring match on the full name (matching "harry" alone would
  take out unrelated customers). `purgeExcludedEnquiries()` runs from the
  ensure pipeline to clear anything stored under the earlier
  column-B-only rule.

## Local development

- `npm run dev` — Next.js dev server.
- `npm test`    — vitest (math libs).
- `npm run build` — production build, also catches type errors that don't
  fail dev.
- Stock match diagnostics: GET `/api/cron/stock-match-debug` (admin only).
- Email preview to your inbox: GET
  `/api/cron/daily-preview?to=you@example.com&exec=<execId>` (admin only).
