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
| `/fuel-calculator`                 | `requireUser` (everyone signed in, user 2026-10-15; tile keyed `everyone`) |
| `/fuel-calculator/admin`           | `requireAdmin` (vehicle library + price overrides) |
| `/fuel-calculator/exports`, `/fuel-calculator/exports/[id]` | `requireUser` (every exported PDF, searchable; the route serves the stored PDF) |
| `/api/cron/fuel-prices`            | `CRON_SECRET` only — no bypass header |
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
| `/api/scraper/trends`             | `requireAdmin` (cached run digests; see Market analysis) |
| `/api/scraper/upload`              | `requireAdmin` OR `x-api-key` matching `SCRAPER_API_KEY` (middleware validates the value) |
| `/api/cron/daily-summary`          | `CRON_SECRET` header (Vercel cron) |
| `/api/cron/daily-preview`          | `requireAdmin` |
| `/api/cron/stock-match-debug`      | `requireAdmin` |
| `/api/email/test`                  | `requireAdmin` |
| `/api/blob/upload`                 | session + admin role check on token issue |
| `/ten-at-ten`                      | `requireTenAtTenAccess` — admin or exec (report + PDF). Notes and Re-Write overrides are admin-only in the UI and their actions |
| `/ten-at-ten/admin`                | `requireAdmin` (uploads + budgets; the upload action re-checks) |
| `/enquiries`, `/enquiries/upload`  | redirect to `/ten-at-ten`, `/ten-at-ten/admin` — the Enquiry Tracker moved into 10 at 10 (Response times) |
| `/broker`, `/broker/stock`         | `requireBrokerUser` (broker portal — separate auth, see below) |
| `/broker/terms`                    | `requireBrokerUser` (must be reachable BEFORE acceptance) |
| `/broker/login`, `/broker/setup/[token]` | public (broker portal)   |
| `/broker/verify`, `/broker/enrol`  | challenge cookie only — half-signed-in, see below |
| `/broker/api/*`                    | broker session (middleware) + handler check. **Must live under `/broker/`** — see below |

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
- **Facets start closed** on both audiences (`DEFAULT_OPEN` is empty). Seven
  were open, which pushed the vehicles below the fold on a laptop. A facet
  with an active selection still opens, so a filter that is doing something
  is never hidden behind a heading; collapsed headings show how many options
  they hold, since that is all a reader has to go on.
- `<StockBrowser rows audience />` — `src/components/stock-browser.tsx`.
  The faceted stock list. Rendered by BOTH `/stock` and `/broker/stock`;
  read the Broker portal section before changing it. `src/app/stock/browser.tsx`
  re-exports it for back-compat.

## Stock mappings

`stock_mappings` tidies raw Ford feed values, one row per `kind` + `rawKey`,
edited at `/admin/stock-mappings`. Kinds: dealer, model, **series**,
derivative, body, engine, transmission, drive, colour, option, status,
destination.

**`series` exists because Ford renames trims between model years.** "SELECT"
became "SELF" on the 2027 Explorer, and the raw code went straight to the
stock list and the broker portal as "Explorer SELF". Two fields showed it —
the Series row, which was passed through unmapped, and the Variant, which
falls back to the raw series when there is no `MODEL · SERIES` mapping.

Mapping the series fixes both: `variant` now falls back to the **mapped**
series, so one settings entry is enough. An explicit `model` mapping
(keyed `"EXPLORER · SELF"`) still wins where one exists, being the more
specific of the two.

Seeded `SELF → Select` via `seedSeriesMappings`, `INSERT OR IGNORE` so an
admin edit survives every boot. Add future renames there or in the UI —
they should not need a code change.

## Pre-registered vehicles

Hand-entered at `/admin/pre-reg`, merged into both stock lists at read time.

- **Its own table, and it has to be.** Every stock upload runs
  `tx.delete(stockVehicles)` and reloads from the workbook, so anything typed
  by a person would be gone by the next morning's file.
- Dropdowns are built from the **mapped** stock list, not the raw feed, so a
  typed vehicle groups and filters with everything else instead of becoming
  its own near-miss spelling. Every field has an **Other** escape hatch,
  because a pre-reg is often the first of something.
- **Bulk entry is the same form.** Twenty identical vans registered the same
  day is one spec and twenty vehicles, each with its own plate and its own
  VIN. Two boxes — registrations and VINs — **paired by position**, which is
  how two spreadsheet columns paste. No separate bulk screen and no mode
  switch: one vehicle goes down the same path as twenty.
- **A length mismatch is refused, never guessed.** If the lists differ,
  every VIN after the gap lands on the wrong vehicle — silently, and almost
  impossible to spot afterwards. `pairByPosition` returns an error instead,
  the form disables submit, and the counts are shown while typing.
  An empty VIN box is fine; plates alone are a valid entry.
- `parseRegNumbers` deliberately does NOT split on spaces ("AB12 CDE" is one
  plate), and `looksLikeVin` accepts **11 or 17 characters**. Eleven is the
  one that matters: **every VIN in the Ford feed is the 11-character short
  form** — all 16,251 of them — and that is what gets typed here too. An
  earlier 17-only rule would have rejected every real VIN.
  The length is what separates a VIN from a registration on the same line: a
  UK plate is at most 7 characters, so neither VIN length can be confused
  with one. Without the check, "AB12 CDE, EF13 GHI" on one line would read as
  a plate plus a VIN and invent one that does not exist. Inline pairing
  (`REG<TAB>VIN` per line) therefore also works.
- Plates already on the system are skipped and named rather than failing the
  whole paste, because re-pasting an overlapping range is the obvious way to
  duplicate a car. A VIN already against another vehicle is dropped and
  reported — the plate identifies the row, so the entry still goes in.
- **Lifecycle: available → sold → invoiced (deleted), or back to available.**
  Sold takes it off both lists but keeps the row — sales fall through, and
  putting one back should not mean retyping it. Invoicing is the only
  irreversible step, deliberately: by then the money has moved.
- **`regNumber` is TF-only; `registeredAt` is shown to brokers.** A plate
  identifies one specific car to anyone who sees it. The date is exactly what
  a broker needs to price a pre-reg, so it stays. `stock-list.test.ts` pins
  both halves.
- **The badge is its own thing, and "Available now" stays the headline.**
  Whatever else is true, the first thing anyone needs from the card is that
  the vehicle is here and sellable; the violet colour is what marks it out as
  a different proposition. `PreRegBadge` replaces the ordinary in-stock badge
  rather than sitting beside it.
- **A pre-reg has three months from registration** (`PRE_REG_WINDOW_MONTHS`),
  and each audience is told what they need:
  - TF sees the pressure — "Registered 80 days ago", "12 days left to sell",
    turning red inside a fortnight.
  - Brokers see a **date** — "Must be delivered before 24 Nov 2026". It goes
    on the order and does not need re-checking every morning, whereas a
    countdown changes under them.
  - Past the window: TF gets "check with funder before quoting", brokers
    "Contact dealer for manual quote". The vehicle stays listed and still
    reads as available — it is sellable with a phone call, and hiding it
    would hide stock someone can still shift.
- `sellByDate` clamps to the end of a shorter month: 30 Nov + 3 months is
  28 Feb, not 2 March, and adding 90 days would drift. Day counts are
  CALENDAR days, so a clock change cannot turn one day into two.
- They **lead the list**. Sorting is stable, so among the ~845 equally
  "in stock" vehicles the input order decides — appended, a pre-reg landed
  800 rows down and never appeared on first paint.
- The **Registration** facet (`Pre-registered` / `Unregistered`) is on both
  audiences, and both see the `Pre-registered` tag.

## Model overrides by dealer

Some vehicles are a different model from what Ford's feed calls them, and
only the dealer says so: an **Explorer on a van dealer code is an Explorer
Van**. `stock_model_dealer_rules` holds one row per override — feed model,
dealer codes, the name to show instead, and two warning texts — edited at
`/admin/stock-mappings` → **Model overrides by dealer**. Seeded with
Explorer on 97706 / 97709 / 97714 / 97726.

- A match renames `bucket`, so it reads as an Explorer Van everywhere
  **including as its own entry in the Model filter** — brokers can filter
  vans in or out.
- **The two warnings are separate on purpose.** TF is told "Check with
  Fleet before offering"; brokers "Check with Dealer before offering". By
  the time a row reaches the browser, `offerNote` already holds the text for
  that audience — `redactForBroker` swaps in `offerNoteBroker` and drops it —
  so the component never chooses and the internal wording cannot reach a
  broker. `stock-list.test.ts` asserts "Fleet" never appears in a broker
  payload.
- Matching uses the **feed's** raw model and dealer, never the tidied
  display values, so renaming something in mappings cannot quietly stop a
  rule applying. The dealer code is the leading digits of `dealer_raw`
  ("97706 (Fleet Barnsley)"), matched **exactly** — `977061` must not
  inherit `97706`'s rule.
- An enabled rule with no dealer codes is refused at save: it would do
  nothing while looking configured. The settings screen also shows a live
  match count, so a rule pointing at a renumbered site is visibly dead.

## Stock availability rules

**Column H decides** (user, 2026-10-16), in `lib/stock-availability.ts`:
blank → available; `CO` → available; `CH` with column E `66170` →
available; **any other code → not available**. Every other stock rule still
applies on top and no availability rule overrides it: a model we sell
(`source_sheet`), not an excluded branch, and a VIN or an ETA. On the 15 Oct
2026 Trust Report that is 4,898 blank + 53 CO + 11 CH/66170 = 4,962.

- **Why it changed:** the Trust Report ("Stock" tab, `parseByHeaders`) never
  hid on column H — it hid on CUST1_SURNAME / FLEET_ID_NUMBER — so 74
  vehicles with a code in H (1B, FM, BP, 1W, 1N, RU, 1F, …) and no named
  customer showed as available when they weren't. And the old rules were one
  value per column OR'd together, so E = 66170 alone pulled a row in
  whatever H said, and a rule match also overrode the branch and model
  exclusions.
- **A blank H with a customer surname or fleet ID stays hidden** (user's
  call): a named customer means it's taken. A rule's code stands even so —
  the CO and CH rows all carry fleet details. `inStockScope` is the
  statement; `stockScopeSql` in `stock-list.ts` is the same test in SQL
  (row inclusion stays in the database, never 25k rows filtered in JS), and
  the mappings page uses it too.
- **Rules are editable** in Stock settings → Availability rules:
  `stock_column_h_rules`, each a column H code plus an optional column E
  value (blank = any). Seeded CO and CH + 66170 **only when the table is
  first made**, so a deleted rule stays deleted through later schema bumps.
  The old `stock_availability_rules` table is left in the database, unread.
- Matching is **positional** — `rawColE` / `rawColH` are captured by index
  (4 and 7) in *both* parser paths, because the operator reads "column H".
  Comparison is trimmed, case-insensitive and **exact, never a prefix**:
  `CO` must not catch `CORP`. A blank code is refused at save.
- **Excluded branches match on the leading code** (`branchCodeOf`): DEALER
  can read "86492 (Spellbound)", which an exact comparison never matched.
  The list lives in `stock-availability.ts`, shared by parser and query.
- A rule decides whether a vehicle **appears**, not its badge: a matched
  vehicle keeps its normal status (`DELIVERED` still reads in stock,
  `CRAIOVA` still an ETA).
- `includedByRule` marks rows a rule made available — any rule match, since
  a code no rule names is hidden. **TF-only**, redacted for brokers; it
  drives the `Rule` tag and the "Included by" facet.
- **The settings counts are split, and must stay split:** `pulledIn` (on the
  list because of the rule — what the filter shows), `outOfRange` (a model
  we don't sell or an excluded branch), `notSellable` (no VIN and no ETA).
  The page also lists the codes column H keeps off the list with no rule
  naming them, so a new Ford code is visible the day it appears.

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
- **Two factors, every sign-in.** Password, then a TOTP code from Microsoft
  Authenticator / Google Authenticator / 1Password. `lib/totp.ts` is a
  hand-rolled RFC 6238 implementation (SHA-1, 6 digits, 30s, ±1 step skew) —
  written out rather than pulled in because it is ~60 lines of HMAC and
  base32, the algorithm has not changed since 2011, and a dependency in the
  sign-in path is a dependency that can be compromised into seeing every
  second factor. `totp.test.ts` pins it against the **published RFC 6238
  vectors**; if that fails, real authenticator apps stop working.
  - The password step creates a `broker_login_challenges` row, **not a
    session**. That record grants access to nothing — only `/broker/verify`
    (or `/broker/enrol` first time) can turn it into a session. Verified: a
    challenge cookie alone renders no stock.
  - `/broker/verify` and `/broker/enrol` are in `BROKER_PUBLIC_PATHS`
    because there is no session yet. They validate the challenge cookie
    themselves and render nothing without it.
  - Enrolment does **not** save the secret until the broker types back a
    code from it. A half-finished scan must not enrol a secret they cannot
    produce codes for, or they are locked out of an account they can no
    longer sign in to.
  - Admin resets 2FA from `/admin/brokers/[id]` for a lost phone; that
    clears the secret and drops live sessions, so the old device stops
    working immediately.
- **One live session per broker user.** `createBrokerSession` deletes every
  other session for that user first, so signing in anywhere signs you out
  everywhere else. This is the strongest anti-sharing control here —
  stronger than the second factor, since a shared TOTP secret still lets two
  people in, but two people cannot hold a session at once and will boot each
  other out all day. The cost falls on honest users too (laptop and phone
  cannot both stay signed in); fair for a single-page stock list, and would
  not be for a tool people keep open on two screens.
- **`/api/broker/session` is the heartbeat**, called every 30s by
  `broker/idle-timeout.tsx`. It does two jobs, and the second one is not
  optional:
  - Tells a displaced device it has been signed out (401), instead of
    leaving it looking at stock until it next navigates — which on this
    page could be never.
  - **Keeps the server's idle clock honest.** The stock list filters
    entirely in the browser, so a broker can work for half an hour without
    making a single request; `lastSeenAt` would go stale while they were
    busy and the server would idle them out mid-use. The client reports
    deliberate interaction and only that bumps the clock —
    `ACTIVITY_EVENTS` is click/key/scroll/wheel/touch, and **mousemove is
    deliberately absent**: a nudged desk or someone walking past a laptop
    would otherwise hold an unattended screen open forever.
    A heartbeat that always bumped would keep an abandoned tab signed in
    for as long as it stayed open, defeating the idle timeout entirely —
    so `active` must never be hardcoded true.
- **Two session clocks**, both in `lib/broker-auth.ts` and both enforced
  server-side in `getCurrentBrokerUser`:
  - `SESSION_ABSOLUTE_HOURS` (12) — the ceiling. However active they are,
    they sign in again, which with a code every time is what makes a shared
    login genuinely painful.
  - `SESSION_IDLE_MINUTES` (30) — the unattended-screen clock. The session
    row is **deleted**, not left to lapse, so an idled-out cookie is dead
    everywhere at once.
  - `broker/idle-timeout.tsx` is the client half and warns a minute out. It
    is not the control — it exists because server-side expiry alone leaves
    the stock list on screen until someone next navigates.
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
   **Two strengths, and the resting one cannot be removed.**
   `WATERMARK_REST` (0.028 / 0.024) is worn all the time; `WATERMARK_LOUD`
   (0.32 / 0.24) escalates for the few capture signals a web page actually
   receives — printing, and a tab share started from the page.

   **"Only watermark when they screenshot" is not achievable, and macOS is
   the proof.** Tested on a Mac in Safari with both chords: `Cmd+Shift+3`
   and `Cmd+Shift+4` are system shortcuts, so the OS consumes them and the
   page never sees the keydown — and the screenshot overlay does **not**
   blur the page either, confirmed by the shield never appearing in the
   captures. There is no event, at any point, before or during a macOS
   capture. Same for every phone screenshot on every OS. Nothing can be
   painted in response to something we are never told about.

   A consequence worth remembering: the capture **alerts** are driven by
   that same keydown, so they do not fire on macOS either. `PrintScreen` on
   Windows does reach the browser; macOS gives us nothing. On a Mac the
   resting layer is the only trace a screenshot leaves — that is what it is
   for. It has been 0.20, then 0.055, now 0.028; it was lowered twice for
   being intrusive, so do not raise it unasked.

   Note also that focus loss raises the **shield only**, deliberately not
   the loud watermark: it fires on ordinary app switching rather than on
   captures, so escalating there would leave a loud watermark on screen for
   20 seconds after every alt-tab and buy nothing, the shield having already
   covered the content.
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
8. **The reporting endpoint is capped server-side.** The reporter is a
   script on a page the user controls, so the per-kind cap in
   `screen-guard.tsx` is a courtesy, not a control — anyone can open
   devtools and POST in a loop. Without the cap in `recordBrokerSecurityEvent`
   the endpoint is a write amplifier: every call inserts a row and, for
   alertable kinds, runs a lookback query. 40 rows per user per 10 minutes,
   dropped silently past that so nobody learns where the ceiling is.
9. **Audit + alert** — everything observable is written to
   `broker_security_events` against a named user by
   `/api/broker/security-event`, and the serious kinds email
   `BROKER_SECURITY_ALERT_TO` (comma-separated). One email per user per 30
   minutes, counted over alertable kinds only so a right-click cannot
   suppress the alert for a screenshot.

`ScreenGuard` also re-applies the watermark if it is removed in DevTools,
and blanks the page on a second attempt. Treat any change that weakens the
watermark as weakening the only thing here that really works.

**The portal's own API must live at `/broker/api/*`, not `/api/broker/*`.**
The session cookie is `Path=/broker` on purpose — a broker cookie physically
cannot be sent to a TF route. A browser honours that strictly: it will not
send the cookie to `/api/broker/*`, because that is not beneath `/broker`.
The two paths read as equivalent and are not.

This shipped broken. The heartbeat got 401 every 30 seconds and signed
brokers out mid-session, telling them they had signed in on another device,
and capture reporting silently recorded nothing. It survived every test
because `curl -b "name=value"` sends a cookie regardless of path — only a
real cookie jar (or a browser) reveals it. **Test broker endpoints with
`curl -b <jarfile>`, never `-b "name=value"`.**

`lib/broker-endpoints.ts` now holds the cookie path and the endpoint paths
together, both callers import from it, and `broker-endpoints.test.ts`
asserts every client-called path sits inside the cookie's scope. Note that
`/api/broker-ratebooks/*` is an unrelated **admin** route and stays where it
is.

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

**The hash is KEYED (HMAC), and must stay keyed.** A plain hash here is
reversible — not because SHA-256 is weak, but because the inputs are
guessable: dealer codes and order numbers are short and enumerable, and the
whole reference space maps in under a second on a laptop, handing anyone who
worked out the scheme the dealer code behind any reference. That is one of
the things brokers are deliberately not shown. The key lives in
`stock_reference_secret` in the DATABASE, generated once on first mint —
not an env var, because it must survive forever (change it and every
reference in circulation stops resolving) and so belongs where the backups
are.

**Vehicles with no VIN.** ORDERBANK stock has no VIN until Ford builds it,
but it is real sellable stock. A vehicle is listed when it has a VIN *or* an
ETA; with neither it is an orderbank line nobody can sell and it is left out
(user's rule, 2026-09-03). VIN-less vehicles are referenced by
**dealer code (column B) + order number (column AF)** — verified unique
across all 25,066 rows of a real upload, with zero duplicates.

Two things that do NOT work as the key, both tried:
  • The order number alone. It is a batch code — `C0057` covers sixteen
    vehicles including a Capri, a Puma, a Ranger and a Transit.
  • A hash of the specification. A colour correction or an added option
    would mint a new reference and silently break one a broker was holding.

When Ford assigns a VIN the reference becomes the VIN hash, so the vehicle
carries `altRef` — its former identity reference — and TF-side search matches
either. Without that, every reference quoted before a vehicle was built would
stop resolving the moment it was. `altRef` is TF-only and redacted.

Truncated HMAC-SHA-256, so it's stable across stock uploads (the
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

## Market analysis (`/scraper`)

The Intelligence tab compares TF's leasing.com prices against every other
broker, from runs the desktop RateX app uploads. All of it is built from
**slots** in `lib/market-slots.ts`: one exact vehicle on one exact payment
profile, holding **at most one offer per broker**.

- **The slot key is `model` + `derivative` + term + mileage + upfront +
  finance.** Derivative alone is not a vehicle on a van: the model carries
  the wheelbase/weight ("Transit Custom 320 L1" vs "320 L2") and 86 of 136
  van derivatives sit under more than one model. Keyed on derivative, an L1
  and an L2 shared a slot, every broker appeared once per wheelbase, and
  TF's price was averaged across different vans. Cars never showed it,
  because their model doesn't vary under one derivative. Fixed 2026-10-07,
  after the user saw TrustFord Transit Centre four times in one van slot.
- **The same deal can be stored twice, and is dropped at read.** leasing.com
  returns every PHEV Transit Custom under BOTH `fuel=Petrol` and
  `fuel=Plugin+Hybrid`, so a run listing both URLs saves those deals twice
  (1,738 in the 7 Oct run). `dedupeListings` drops repeats by deal id + profile
  rather than anything being deleted from stored runs, so history is fixed
  too. The Results tab and CSV export still show the raw rows, on purpose.
- **A broker listing one vehicle twice keeps its cheapest**, marked
  "cheapest of N". Rivervale posts two prices per profile and Select lists an
  in-stock and a factory-order version; nothing scraped tells them apart.
- **Cars and vans are separate views.** The segment comes from the search
  URL (`/car-leasing/` vs `/van-leasing/`), never the range: "Explorer" is
  both, and mixing them hid that the Explorer car was behind. Classified
  server-side in the slim results payload, so `source_url` isn't shipped.
- Gap = TF − cheapest competitor (positive = we're dearer), displayed from
  our side ("-£9" = £9 worse). Rank counts competitors strictly cheaper, so a
  tie still reads #1. Terms and mileages come from the data, not a fixed
  24/36/48 list; older runs have 18-month deals.
- **Ranges are renamed where leasing.com's are misleading** (`rangeOf`). The
  van Explorer reads as **Explorer Van**, and electric vans get their own
  range — **E-Transit Custom**, **E-Transit Courier** — rather than sitting
  inside the diesel/PHEV card (3,174 EV rows in Transit Custom on 7 Oct).
  Range names are in every slot key, so Trends depends on this staying
  stable run to run.
- **"[NI]" derivatives are separate vehicles, not duplicates.** Only Carwow
  Leasey lists them, and they average £82/mo more than their un-suffixed twin
  from the same broker. Don't merge them.
- **Headline price** (`buildHeadlines`): per vehicle + mileage (+ upfront +
  finance), our cheapest monthly at ANY term vs the cheapest any rival offers
  at any term — what a customer compares first on leasing.com. `crossTerm` is
  the case the user asked for (2026-10-07): our best price wins its own term,
  and a rival is still cheaper on a different term ("mega cheap on 2 years,
  cheaper than our 3 and 4"). No term-by-term view can show it. It is rare
  while 48 months is nearly always the cheapest monthly; plain headline
  losses are common.

### Trends tab

Kept as its **own tab on purpose** — the user's instruction was that the
over-time view must not change the Intelligence view.

- **Position over time** plots one point per run from per-run digests
  (`summariseRun`), cached in `scraper_run_summaries`. A digest is rebuilt
  when the run's `total_results` or `RUN_SUMMARY_VERSION` differs. **Bump
  `RUN_SUMMARY_VERSION` whenever slot, headline or range logic changes**, or
  the history will mix figures computed two different ways. The first visit
  after a bump rebuilds every run (~7s locally for 30 runs; longer on Turso).
- Runs don't all search the same URLs (the 6–7 Oct runs covered ~2,700 van
  combos, the 7 Oct evening run 4,393), so the combo count is in every chart
  tooltip. A dip on a thin run is not a trend.
- **What changed** compares two runs on slots present in BOTH, and gives a
  cause for each lead change (`compareSlots`): we rose / we cut, a rival cut
  / rose / left, or a new rival. Default pair is the latest run vs the
  latest one at least six days older — repeat runs on the same day make
  "previous run" nearly always "nothing changed".
- `scraper/run-cache.ts` holds the last three runs client-side, so moving
  between Intelligence and Trends doesn't re-download ~4MB each time.

## 10 at 10 (`/ten-at-ten`)

Admin-only reporting tab built from the Dealerweb enquiry log (the same
"ag-grid" export Pole Position reads — A Date Time, B SE, D Customer,
E Source, G Model, I First Contact Details, Q Status). Rules in
`lib/ten-at-ten.ts` (pure, tested); slicing and grouping in
`lib/ten-at-ten-report.ts` (client-safe); ingest/load in
`lib/ten-at-ten-store.ts`. User's rules, 2026-10-10:

- **Sources:** MotorComplete Lead → TF Lead, - Leasing.com → Leasing.com,
  - LeaseLoco → LeaseLoco, - carwow → CarWow; anything else is
  Broker / Prospect. Letters-only match.
- **Status:** Ordered, Delivered, Handover Arranged = order; Live = live;
  Lost Sale = lost. Conversion is always orders ÷ enquiries, over enquiries
  RAISED in the period.
- **Three conversions, always shown separately** (user, 2026-10-12):
  *inbound* — the MotorComplete-fed sources (TF Lead, Leasing.com,
  LeaseLoco, CarWow; `INBOUND_SOURCES`) — *broker / prospect* (the rest),
  and *overall*, which the two make up. The Enquiries tab leads with the
  three side by side; By exec and the builder carry all three columns.
  The by-source table keeps one rate, each source being wholly one or the
  other. A side with no enquiries reads "—", never 0%.
- **HaHe and JoRu are stripped from everything** — duplicates are moved
  onto those codes in Dealerweb. Ingest never stores them, deletes any
  stored enquiry a file shows was moved to them, and ensure-schema sweeps
  as a backstop.
- **Uploads merge line by line**, never replace a file. The key is enquiry
  time (to the minute) + customer + source — NOT the exec (reassignment is
  how duplicates reach HaHe/JoRu, and must overwrite, not duplicate) and
  NOT the vehicle (a corrected model is the same enquiry). A known line is
  overwritten with the newer file's values; an identical one is counted
  "unchanged". The same key twice in one file keeps the row furthest along
  (Ordered beats Live beats Lost Sale) — September 2026 has Paul Burns as
  both Ordered and Lost Sale in the same minute.
- **Model vs derivative:** column G is anything from "Ford" to a full
  derivative. `vehicleOf` reads the model by ordered regex (specific before
  general — Transit E-Custom before Transit Custom, Puma Gen-E when a kW
  rating is present); the derivative is the full text only when it says
  more than the model. `derivativeKey` groups spellings of one derivative
  (case, brackets, Estate/Hatchback, Diesel/Petrol/Electric, FWD, "D/Cab")
  and the report labels each group with its commonest spelling.
- The finance type / term / mileage dimensions come from the MotorComplete
  block in column I, so other sources read "Not stated". Funder is not in
  the log (blank on every line) — the user meant source.
- **No "vs previous" on the tiles** — removed at the user's request
  (2026-10-10). `previousRange` stays in the report lib, tested, if it's
  wanted back: a period in progress compares like for like with the same
  stretch of the previous one (October so far vs 1–9 September), never the
  whole previous period, which reads as a collapse every morning.
- Exec codes show as names via the Pole Position name map where known.
- No over-time chart, and "Build a breakdown" opens collapsed (user,
  2026-10-12: too much screen space). Every nested table starts collapsed.
- **Every table opens in performance order** (user, 2026-10-20), on the
  page and in the PDF alike: sources by enquiries (the source bar too);
  Enquiries By exec and By model by inbound conversion, highest first, an
  equal rate ranked by the inbound leads behind it (3 of 3 above 1 of 1);
  Response times By exec fastest average first contact first
  (`fastestFirst`), Sales Support still last; By day stays in date order;
  Orders and Deliveries tables by units, highest first, but profit bands
  keep their fixed order. A column header still re-sorts a table on screen.

### Who sees it

Admins and execs (user, 2026-10-13): the tile, every tab and the PDF.
Admin-only: Upload data and budgets (`/ten-at-ten/admin`), the manager's
reason on a cancellation, and overruling the Re-Write matching — execs see
those read-only. `CanManage` in `report.tsx` shapes the page; the server
actions keep `requireAdmin`, which is the actual control.

### Summary and Market Analysis tabs

Tabs run Summary, Enquiries, Response times, Orders, Deliveries,
Cancellations, Market Analysis (user, 2026-10-12). **Summary is the landing
tab**: one card per area with its two to four headline figures for the
period and an Open link to the tab. It computes nothing of its own — the
same stats functions the tabs use — so a Summary figure always matches the
tab behind it. Deliveries measures against budget only on whole months, as
the tab does. Summary is cards, with no indigo hero of its own.

Under each card's figures sits a short detail layer (user, 2026-10-12: "a
little more detail, but not overwhelming") — a split or the names behind a
number, a few lines at most, never a table: the source mix and the three
best inbound conversions ("Best inbound", `topInboundExecs` — the top of
the Enquiries By exec table, execs with an inbound order only; user,
2026-10-20, Most orders stays on the Orders card); allocation and who
missed same-day contact; ICE / BEV / Van
units and average profit (total, invoice + bonus), loss-making count; Car and CV against budget;
the latest cancellations with their reason or "Reason needed"; the
strongest and weakest ranges (40+ deals) and the rival who undercuts us
most. Keep it to that weight.

Seven tabs don't fit a phone, so the tab row scrolls sideways in place, and
`Card` carries `min-w-0` so a wide table scrolls inside its card instead of
widening the page. Check new views at 390px wide for horizontal scroll.

**Market Analysis is an overview, not a second copy of `/scraper`.** It
reads the latest finished scrape's digest — the same `summariseRun` digest
the Trends tab plots, cached in `scraper_run_summaries`
(`lib/market-overview.ts`) — so its figures mean exactly what they mean
there: cheapest like-for-like, lowest headline, average gap (ours minus the
cheapest rival, + is dearer, Trends' green / amber within £20 / red bands),
by range, and who undercuts us. Not tied to the period selector, which is
hidden on that tab; Summary says "latest scrape" for the same reason.

- **Current the moment a scrape lands.** The upload route builds the
  digest with `after()` when RateX sends the final chunk
  (`warmRunSummary`), so 10 at 10 never pays for ~30k rows on page load. If
  that ever fails, the page builds it on first view instead.
- A run still uploading (`status` not `done`) is passed over for the last
  finished one, so the overview never shows half a run.
- A failure loading the market is logged and the tab says there's no data;
  it can't take the rest of 10 at 10 down.
- `buildRunSummary` is shared with `/api/scraper/trends` — one place builds
  and caches digests. **Bump `RUN_SUMMARY_VERSION` as before** when slot or
  headline logic changes; both views rebuild from it.

### PDF export

**Export PDF** (right of the tab row) downloads `10 at 10 - <period>.pdf`:
seven A4 landscape pages, one per tab in tab order, for the period on
screen (Market Analysis is always the latest scrape). User, 2026-10-12: for
taking the department through; uncluttered but complete; "Build a
breakdown" left out; say so if a tab won't fit one page.

- Built **in the browser** with `@react-pdf/renderer` (`pdf-report.tsx`),
  from the data the page already holds and the same stats functions as the
  tabs — nothing is fetched, nothing differs from the screen. react-pdf is
  heavy, so it and the document load only when the button is pressed.
- Formatters and colours shared by page and PDF live in `shared.ts`.
- Helvetica (a PDF base font, nothing to download) covers Latin-1 only, so
  `tx()` swaps the page's typographic minus for a hyphen. Word hyphenation
  is switched off (`Font.registerHyphenationCallback`) — it was splitting
  "broker" and column headings.
- **What's left out, deliberately:** the customer lists behind each row
  (the drill-downs) and derivatives under models — except Cancellations,
  where the list with each reason is the point. Long lists are capped with
  "and N more — see the tab" (models 14, ranges 10). Response times goes
  by week instead of by day once the period passes a month.
- Fit, checked on real data: October, September and Q3 2026 are each
  exactly seven pages. Deliveries is the fullest page; its tallest column
  (profit bands + five best / five worst) is fixed in size, so it doesn't
  grow with the period. **Cancellations is the one page that can run onto
  a second sheet** in a long period: it lists every cancellation and
  Re-Write in full, and the panels are allowed to break rather than cut.
- To check a layout: export in the browser, then render pages with
  PDFKit (a small Swift script: `PDFDocument` → `page.draw` → PNG).

### Response times (was the Enquiry Tracker)

Merged into 10 at 10 at the user's request (2026-10-12) — one place, one
upload screen, 10 at 10's format. Data and rules are the Enquiry Tracker's,
unchanged: the MotorComplete enquiry export, `lib/enquiries.ts` parse and
ingest, business-hours maths, and "only judged after a full working day"
(`partitionByReportability`). `summariseResponse` moved into
`lib/enquiry-reporting.ts` so the tab shares it. The upload router knows the
export by `lib/enquiries-header.ts` (pure), which `lib/enquiries.ts` now
reads its header check from too.

- **MotorComplete leads only** (user, 2026-10-12): column G must be a
  MotorComplete feed (`isMotorCompleteSource`, letters-only prefix) — FordLDS,
  Customer, CarGurus, Autotrader, FR website etc. are stripped at parse and
  their ids reported for deletion, and `purgeExcludedEnquiries` deletes any
  stored non-MotorComplete row (it runs from ensure-schema; SCHEMA_VERSION was
  bumped to 54 so it ran once). Harry Henderson / Joseph Rustigini stay
  stripped by the existing any-column name rule.
- **The team's names for the uploads:** Enquiry Tracker (MotorComplete
  export → Response times), Enquiry Log (Dealerweb → Enquiries), Dealbook –
  Orders (Dealerweb order list → Orders), Dealbook – Deliveries, Cancelled
  Orders, Dealbook Extract (the .csv — Basic, for bonuses). The upload page and results use these; keep KIND_LABEL in the page
  and upload client in step.
- **Access narrowed:** the tracker was open to every signed-in user; 10 at 10
  is admin-only, so non-admins no longer see response times.
- `/enquiries` and `/enquiries/upload` redirect; the old page, client and
  upload action are deleted; the homepage card is gone.
- The PWA manifest moved with it: start_url / scope are `/ten-at-ten`.
- Every exec, day and "needs attention" line opens into its customers.
- **Sales Support** (user, 2026-10-12): an exec isn't penalised for a lead
  that reached them too late to work. `sameDayMissOwner` gives a same-day
  miss to Sales Support when the lead was passed over with less than the
  exec's own 15-minute contact target left before 17:30, on a later day, or
  never; `neverContactedOwner` gives never-contacted to Sales Support only
  when it was never passed over (once it reached the exec, there was always
  a next day to call). By exec shows each exec's own misses, plus a
  "Sales Support · allocation" row whose figures are allocation (5-minute
  target) and the misses that came from it.

### One look across every tab

User, 2026-10-12: same theme, colours and style everywhere. Hold to it:
one highlighted (indigo) headline per tab — Overall conversion, First contact,
Avg profit, Avg profit, Cancellations, We're cheapest — with on/off target as
a badge on it; emerald-700
for good and rose-700 for bad, never other greens or reds; source colours
(blue/cyan/violet/orange/slate), segment colours (ICE amber, BEV emerald,
Van blue) and budget colours (Car slate, CV = Van blue, Combined indigo)
fixed; By exec full width and opening into its customers on every tab;
nested tables collapsed until clicked; everything through the shared
Tiles / Card / GroupTable components rather than one-off markup.

### Orders section

Built from the Dealerweb **order list** (B SE, D Customer, E Order Date,
F Vehicle Details, R Finance Type, AH Total Gross = profit, AK Delivery
Date). Rules in `lib/ten-at-ten-orders.ts`. One upload screen takes both
files; `detectTenAtTenFile` tells them apart by header.

- **Segments are ICE Car, BEV Car and Van** (user's split). Vans: the Transit
  family, Ranger, Explorer Van, Tourneo — whatever their fuel. A car is BEV
  when the model only comes electric (Capri, Explorer, Puma Gen-E, Mach-E)
  or the text says kWh/Electric; Puma mHEV, Kuga PHEV, Focus are ICE.
- **Average profit is over units with a figure** — an order with a blank
  Total Gross counts as a unit but not in the average.
- Column R reads `<product> <term> <funder code> <amount>`; codes Nov → Novuna,
  Arv → Arval, ALD, Lex, For → Ford Credit (assumed). "Cash" is its own funder.
- Dealerweb appends a stray "1", ".", "n" or "N" to some vehicle text;
  `cleanVehicle` strips it or one vehicle splits four ways.
- The list ends in a totals block (numbers in column B) — skipped.
- **Key: order date + customer + vehicle + occurrence in the file.** One
  customer's three identical vans on one day (DEA Gate, 9 Oct 2026) are
  three orders and must line up with the same three next upload. Exec is
  not in the key. Line merging can't see an absence, so a line a later
  export drops keeps its stored copy.
- **Orders counts what Dealerweb's latest order list carries**
  (`staleOrderIds`, user's live data 2026-10-16). The order list is the
  whole month to date and every line of one export carries its time
  (`last_seen_at`), so a held line last seen before its month's latest
  export has gone from Dealerweb and is left out — cancelled, or **the same
  order under a description Dealerweb has since changed**. Column F gains
  text after the fact (DEA Gate's vans a trailing "10" on 14 Oct, Martin
  Dowey's Capri its registration on 16 Oct), the key includes it, and each
  was stored and counted twice until this. Don't "fix" it by changing
  `cleanVehicle`: cancellation ids hang off it, and with them every
  manager's note. Cancelled originals are still told apart (`originalIds`)
  for the "cancelled since, left out" note. **Upload the whole month's order
  list, never a filtered one** — a filtered export hides what it leaves out
  (lines are only hidden, never deleted, so the next full upload restores
  them). Deliveries lines are unaffected; their uploads sync the month.
- **A Re-Write counts once, on the ORIGINAL order date** (user, 2026-10-16:
  Re-Writes are an admin task, and an exec doing a lot of them mustn't show
  an inflated Order Take). `creditOrders` keeps the re-order line — it has
  the corrected customer, spec and profit — but moves it to the order day
  of the cancelled order it replaced, whether or not that original is held.
  So Braine's three vans (ordered 29 Sep, re-ordered under DEA Gate on
  9 Oct) are September orders only; before this they counted in September
  (Pole Position's own upload) and again in October. On the 12 Oct data,
  October's Re-Writes left only ENAFLO's two (re-keyed within October) and
  Omnia (same day) in October. The Orders tab notes how many were keyed in
  the period but credited earlier (`rewritesAcross`), and Summary / PDF add
  it under the Orders figure. On 16 Oct 2026 live: 46 on the order list,
  less Black Lab, Griffin, QPATH and DEA Gate ×3 credited earlier = 40. Follows the manager's call: "Not a Re-Write"
  keeps the re-order on its own day; "It's a Re-Write" with no re-order
  found has nothing to move (`rewriteOrderDaysOf`). Deliveries are not
  touched — a re-order's delivery is a real delivery.
- The **delivered list has identical columns** and can't be told apart. That
  is harmless: its rows are the same orders under the same keys, so it adds
  or refreshes real orders (on the Sep 2026 files: 38 identical, 16 with a
  settled profit or delivery overwritten).
- HaHe / JoRu are stripped from orders too ("all data").
- Headline tiles: orders, invoice profit, bonuses, total profit, average
  profit (on total) — no loss-making tile (user, 2026-10-12; bonuses
  2026-10-20, see Bonuses below). Profit bands split losses three ways (−£1,000 and
  below, −£999 to −£500, −£499 to −£1). By exec and profit bands open into
  the individual orders; groups carry their `rows` for exactly this.

### Deliveries section (Dealbook – Deliveries)

The Dealerweb delivered list. **Same columns as the order list** — the
upload tells them apart by date shape (`classifyDealbook`): Orders have
their ORDER dates in one month and delivery dates spread; Deliveries have
their DELIVERY dates (column AK) in one month and order dates spread. Every
real file follows that. When both sit in one month the uploader is asked
(`needsChoice`) rather than the file being guessed into the wrong table.

- Counted in the month of the AK date. AK's flag is the status: Dlv
  Delivered, Arr Arrived, Est Due. "Still to deliver" = Arrived + Due.
- **Key = order key + delivery month** (`makeDeliveryKey`). One deal can hold
  identical vehicles delivered in different months (The Primary and Urgent
  Care Alliance's two Ranger Wildtraks, ordered 11 Aug 2026: one delivered
  24 Sep, one due 30 Oct); on the order key alone each month's report
  overwrote the other's.
- **Each deliveries upload syncs its month**: lines stored for that delivery
  month that the file no longer carries are removed (slipped or cancelled),
  shown in the upload result. Otherwise a slipped vehicle sat in its old
  month as Due for good, inflating "on course for". This is the one place
  an upload removes lines it doesn't contain — so upload the full month,
  never a filtered export. Orders still never remove.
- **Budgets** live in `ten_at_ten_budgets` (month × car|cv), edited on the
  upload page; combined is always car + cv. Seeded Q4 2026 with the user's
  figures (Oct 106/40, Nov 78/32, Dec 61/20) via INSERT OR IGNORE. Car = ICE
  + BEV cars, CV = vans (`departmentOf`).
- Budget comparison only for whole months (Month, Quarter, or a custom
  range of whole months — `budgetMonths`); a day or week says so rather than
  pro-rating a target nobody set. A month without a budget is shown as
  missing, never as 0. The panel is always the department — filters don't
  narrow it.
- Rows are loaded as order rows (`loadTenAtTenDeliveries`: day = delivery
  day, delivery = status) so the Orders views serve both tabs.
- **Budget cards ask two questions, in this order** (user, 2026-10-12):
  first *going vs budget* — everything Dealbook says is going in the period
  (delivered + arrived + due) against budget, with the gap; then *delivered
  of what's going*, benchmarked against how far through the period today is
  (`periodProgress`, calendar days, today counted in) — "34% delivered vs
  39% through the month, 5 pts behind pace". Don't lead with delivered vs
  budget: early in a month it always reads as failure.

### Bonuses (Dealbook Extract + quarterly rates)

Ford's quarterly bonus mapped onto every order and delivery (user,
2026-10-20). Rules in `lib/ten-at-ten-bonus.ts` (pure, client-safe);
the extract's parse and `applyBonuses` in `lib/ten-at-ten-extract.ts`;
rates and the extract held by `lib/ten-at-ten-store.ts`.

- **Profit three ways, on Orders and Deliveries:** Invoice profit (Total
  Gross, as before), Bonuses, and Total profit. The highlighted average,
  profit bands, loss-making and most / least profitable all run on **total**
  (user's call). Avg is over units with an invoice figure; a unit without
  one still has its bonus in Bonuses.
- **By delivery date, never order date.** A deal earns its type's rate in
  the month it delivers; Arrived and Due show the bonus at the date
  Dealerweb gives them now, and move with it (user's call). An order's
  bonus month comes from its line on a delivered list (key
  `makeDeliveryKey(orderId, month)`, latest seen), else its extract line,
  else its own column AK.
- **Types:** ICE Car, BEV Car, ICE Van, BEV Van (`bonusTypeOf`). Cars follow
  the report segment; a van is BEV when it's E-Transit / E-Transit Custom /
  Courier / Explorer Van or says kWh / Electric — plug-in hybrid vans
  (Ranger, Transit Custom, Connect PHEV) are ICE Vans (user, 2026-10-20).
- **Rates** (`ten_at_ten_bonus_rates`, month × type: % of Basic and/or £ per
  unit) are edited under the budgets on the upload page, a quarter at a time.
  A month with no rows has no scheme, shown as such, never as £0 final.
  Seeded with Q4 2026 **only when the table is first made**: ICE Car nothing,
  BEV Car 4.5%, ICE Van 2.5%, BEV Van 2.5% + £1,500 in October only.
- **On top of Dealerweb's Additional Bonus** (2.3% of Basic on vans, 1.5% on
  ICE cars, 0 on BEV cars on the Oct 2026 files), which is already inside
  Invoice profit. The user confirmed the quarterly scheme isn't in Dealerweb.
- **Basic is column BQ of the Dealbook Extract** — a CSV of the delivered
  list with every column, uploaded a delivery month at a time like
  Dealbook – Deliveries (and synced the same way). The upload stops if BQ
  isn't headed Basic. Other columns are read by header. Dates are UK,
  day first, so the CSV is read as text — never let it be type-guessed.
- **Matching is at read time** (`matchExtract`), never stored. The extract
  names the exec in full and the contact, not the account ("Mr Pedro
  Condez" vs "Pedro Condez T/A P D Carpentry"), and delivery date and profit
  move between downloads, so: same order day, vehicle text alike (Dice ≥
  0.5 over words), and at least one of exec / plate / customer; scored and
  taken best-first, one to one. On the 19–20 Oct 2026 files: Oct deliveries
  80 of 82, Nov 51/51, Dec 26/26 — the two misses aren't in the 20 Oct
  extract at all. A deal due a % with no Basic shows only its £ part, flagged
  `noBasic` and called out under the tiles.
- Real figures, Oct 2026 deliveries: invoice −£21,598 (= the delivered
  list's NEW TOTALS), bonuses £101,787, total £80,189, £978 a unit. The PDF
  stays seven pages; its tables show Invoice / Bonus / Total / Avg (no Loss
  column — no room; loss-making is in the KPI subs).
- The extract doesn't feed Pole Position, so its upload doesn't re-feed it.

### Cancellations section (Cancelled Orders)

Dealerweb's Cancelled Orders export: A Sales Executive (a full NAME, not a
code), B Order Date (with time), C Customer (sometimes led by an account
code, "E0795 Mr James Robinson"), D Type, E Model (model then derivative,
which repeats it), F Registration Number, G Cancelled Date. Parse and
matching in `lib/ten-at-ten-cancellations.ts` (pure, tested on the real
12 Oct 2026 export). Counted on the day it was cancelled.

- **A Re-Write** is an order put on wrong, cancelled and ordered again. It
  is listed but never counted as a cancellation (user, 2026-10-12). Proper
  cancellations each get a manager's reason, saved in
  `ten_at_ten_cancellation_notes` — its own table, so no upload can touch
  what a person typed. Notes key off the cancellation id (order time +
  customer + vehicle + occurrence), which must stay stable across uploads.
- **Matching runs at read time** (`loadCancellationsReport`), never stored,
  so it improves as more of the Dealbook is uploaded. It looks in both
  Dealbook tables (`mergeDealbookLines` counts an order held in both once).
  "The same vehicle" is the same registration *by the same exec or for the
  same customer* — Braine's three vans were re-ordered under DEA Gate
  Automation, but a plate moving to another exec's customer is reallocated
  stock (CA Waters → Griffin Joinery's plate) — or the same customer and
  model (ENAFLO re-ordered on new plates; HFS with the spec corrected). The
  re-order must fall within 30 days of the cancellation; one order answers
  for one cancellation; and it must still be on Dealerweb's list — an old
  copy of an order (`staleOrderIds`) is never taken as the re-order, or the
  live one stays counted where it was keyed.
- **A plate has a digit** (`plateOf`). Dealerweb puts words in the
  registration column — FACTORYORDER, CANCEL, SEPTEMBER — and as "plates"
  they tied unrelated orders together: Birkett's cancelled Puma read as a
  Re-Write of Ficep's Explorer, both FACTORYORDER under Helen Mort. Stored
  registrations are re-read through `plateOf` at match time, so old uploads
  need nothing doing.
- **Dealerweb's order list drops a cancelled order, our store doesn't.**
  So every Dealbook line carries `last_seen_at` — the wall-clock time of the
  latest export listing it, from AG Grid's workbook `CreatedDate`
  (`exportedAtOf`), NOT the upload time, since an old export can be
  uploaded days later. A matching line on the original order day last seen
  BEFORE the cancellation is the cancelled order itself (left out of
  Orders); one listed AFTER it is a live order, which is how Omnia's
  same-day order / cancel / re-order (9 Oct 2026) reads as a Re-Write.
  Lines stored before this existed fall back to their first upload time,
  so re-upload old Dealbook files once to backfill registration and seen
  time — the merge never moves `last_seen_at` backwards.
- A manager can overrule the matching either way ("It's a Re-Write" / "Not a
  Re-Write"); `classification` on the notes row, null = automatic, Undo
  clears it.
- Exec names map to Dealbook codes through the Pole Position name map plus
  Dealerweb's convention, first two letters of first and last name
  (`execCodeFromName`: Deniz Durmaz → DeDu). That convention is also how
  Harry Henderson / Joseph Rustigini (HaHe / JoRu) are stripped.

## Fuel Cost Calculator (`/fuel-calculator`)

Petrol or diesel against electric, for the conversation with a customer,
exported as a PDF (user, 2026-10-14). The maths is pure and tested
in `lib/fuel-calc.ts`; page and PDF both print its `workings()`, carried to
enough decimal places that every line multiplies out to the next by hand.

- **Like for like:** official (WLTP) efficiency on both sides, UK average
  prices, one annual mileage. Petrol/diesel cost a mile = price a litre ×
  4.54609 ÷ MPG. Electric = blended price a kWh ÷ miles per kWh. WLTP kWh is
  measured at the plug, so no charging-loss factor is added.
- **The verdict is honest either way** — "Electric saves £X a month" or
  "Electric costs £X a month more than diesel" (`verdict`).
- **VAT:** prices are stored exactly as published. Private shows everything
  incl. VAT; Business takes reclaimable VAT off fuel, depot and public
  charging, but not home electricity (not reclaimable on a domestic bill).
  `PRICE_META` holds each price's VAT basis — the depot figure is published
  ex VAT.

### Prices refresh themselves (`lib/fuel-prices.ts`, parsers in `fuel-price-parsers.ts`)

Checked daily at 05:15 UTC by `/api/cron/fuel-prices` (vercel.json) and on
"Check sources now". Each source stands alone: one failing keeps its last
good price with the error shown, never blocks the rest.

| Price | Source | Publishes |
|---|---|---|
| Petrol, diesel | DESNZ weekly road fuel prices CSV (found via the gov.uk content API) | weekly, Mondays |
| Home daytime | Ofgem price cap, direct-debit electricity unit rate | quarterly |
| Home overnight | Octopus Go off-peak, average of the 14 GB regions (public API) | daily |
| Depot | DESNZ QEP 3.4.2, electricity "Small" (20–499 MWh), incl. CCL, ex VAT | quarterly, ~3 months behind |
| Public rapid | Zapmap Price Index, rapid / ultra-rapid PAYG | monthly |

Overnight and public are the only ones that aren't official statistics —
there is no official national average for an EV night tariff or for public
charging — and each is labelled with its source on screen and on the PDF.
Parsers return null on a page they don't recognise rather than guess, and
the tests pin each format; if a source changes layout the price is marked
"Last check failed" on the admin page. A manager's override (admin page)
wins until cleared. Each price carries a staleness threshold by its
cadence and is flagged "may be out of date" past it.

### Vehicles

`fuel_vehicles` — petrol/diesel with MPG, electric with miles per kWh, car
or van. Petrol and diesel are seeded from the old calculator (Transit
Custom, Transit Courier); the old tool filed the Courier 1.0 EcoBoost under
diesel, it is petrol, and is seeded as such.

**Electric: every Ford EV, from the dealer price lists** (user, 2026-10-14,
`EV_SEED` in `lib/fuel-vehicles-seed.ts`): Puma Gen-E, Capri, Explorer,
Mustang Mach-E, Explorer Van, Transit City, E-Transit Courier and
E-Transit Custom, 50 versions, each with usable battery, WLTP range, WLTP
motorway range where listed, and rapid charging (max DC kW, 10 to 80%
minutes). The source string names the list and its date.

- Efficiency is always the official consumption **at the plug**, converted
  only for units (lists use kWh/100km, kWh/100 miles, or miles per kWh).
  `fuel-vehicles-seed.test.ts` pins that it is below range ÷ battery for
  every version, which is what charging losses make it.
- **The E-Transit Courier list's "4.4 miles per kWh" is range ÷ battery**,
  not consumption; its official 17.7 kWh/100km is 3.51 and that is used.
  4.4 would understate the electric cost by a fifth.
- **The Mach-E list heads its column kWh/100miles; the figures are per
  100 km.** Per 100 miles, a 73kWh Select would beat its own 292-mile range
  at the plug.
- Not on the lists, so not invented: E-Transit Courier rapid charging, the
  Transit City chassis cab ("TBC"), and AC on-board charger speeds.
- The earlier model year's EV seeds (65kWh E-Transit Custom, 43kWh
  E-Transit Courier) are deleted by `RETIRED_EV_SEED`, only where still
  exactly as seeded. Petrol/diesel price-list figures were NOT taken: the
  user asked for the electric data only.
- Library vehicles load in insertion order within a model (`rowid`), so
  each model starts at the price list's entry trim.

**Charging it** (`chargingInsight`, `chargingWorkings` in `lib/fuel-calc.ts`,
tested): a week is annual miles ÷ 52; energy is that ÷ miles per kWh (at
the plug, so nothing is added); hours are energy ÷ 7.4 kW at home (the most
a single-phase supply gives) or ÷ 11 kW three-phase at a depot; full
charges are a week's miles ÷ the WLTP range, phrased by `howOften`; rapid
stops use 70% of the range (10 to 80%). The 23°C test caveat is printed
wherever the range is. Shown as its own card on the page and as the first
section of PDF page 2, with its own workings step. A typed-in EV can be
given a battery and range so it gets the same picture. More are added
by pasting rows on the admin page (`parseVehiclePaste`): a plausible-range
check catches kWh per 100 miles pasted as miles per kWh, and nothing saves
if any row is wrong. The id is what the vehicle is, so a re-paste updates.

**Finding the customer's current vehicle.** Free MPG look-ups are all
closed (checked 2026-10-14): the VCA's car download is down "due to
technical issues", the government van checker is unavailable, and DVLA has
closed new Vehicle Enquiry API registrations. What is open is the European
Environment Agency's CO2 monitoring data, which records every new car and
van registered with its make, commercial name (which carries the trim),
fuel, engine size and official CO2, through a free SQL API.

- `scripts/build-fuel-reference.ts` pulls it into
  `public/fuel-reference.json` (~22,000 versions, 58 makes, 240KB gzipped):
  UK registrations 2012 to 2020 (the UK left the dataset after 2020) and
  Ireland 2021 to 2022, which is right-hand drive with near-identical
  ranges. It is a static file the page fetches once; re-run the script to
  refresh it. Plug-in hybrids are left out (their CO2 says nothing about
  fuel bought), as are bodybuilders, wheelchair conversions and junk makes;
  names are tidied (`MAKE_ALIASES`, `modelOf`) and clipped Ford names such
  as "TRAN CUSTOM" and "TRCON" folded into their families.
- MPG is worked back from the official CO2 by carbon balance
  (`mpgFromCo2`), the way the official figure is calculated, so it is the
  official MPG, not an estimate. About 60% of versions are NEDC, which
  flatters economy by around a fifth; the page and PDF say so whenever one
  is chosen, and the saving is then understated, never overstated.
- `lib/fuel-catalogue.ts` (pure, tested) merges it with the library's
  petrol and diesel vehicles. Library vehicles have no registration years,
  so they appear as **"Current model"**, never under invented dates. The
  dropdowns are Make, Model, Year registered, Engine, Version; until a
  version is chosen the commonest registered one is shown, and the page
  says so. The search box takes any mix of make, model, engine and year.
- Not possible from free data: vehicles first registered after 2022, and
  trim-perfect derivatives or gearboxes (the EEA name is the badge, not a
  full derivative). For those, "From the V5C" (CO2 box V.7 plus first
  registration date) gives the official MPG exactly, and "Enter MPG" is
  always there.

### Saved comparisons (user, 2026-10-15)

Every Export PDF also posts the PDF (base64, ~35KB) to `saveFuelExportAction`
with the customer, the exec (the signed-in user), both vehicles and the
monthly saving, into `fuel_exports`. The download never waits on the save.
`/fuel-calculator/exports` lists them newest first; the search matches every
word against customer, exec and vehicles.

### Look (user, 2026-10-14: "world class", no em dashes, mobile)

- Numbered steps on the left, the answer sticky on the right; on a phone
  the answer follows the steps and a bottom bar keeps the saving and Export
  PDF in reach until the answer card itself is on screen.
- Building blocks are in `fuel-calculator/ui.tsx`. Inputs are 16px on
  phones, because anything smaller makes iOS zoom the page on focus.
- Amber is petrol or diesel, emerald is electric and any saving. The four
  charging sources have fixed colours (`CHARGE_COLOUR`), always shown with
  their names beside them.
- **No em or en dashes in anything a customer or user reads.** A test in
  `fuel-calc.test.ts` pins the workings, verdict and price labels; ranges
  read "2019 to 2021".
- **The PDF is set in Geist** from `public/fonts` (SIL OFL), registered
  with `Font.register`; it carries £, −, ×, ÷ and ₂. Two pages, both full:
  page 1 is the answer (with the disclaimer pinned above the footer), page
  2 is charging, the workings and the notes. Anything added must come out
  of something else, or it spills to a third page. **Never set `lineHeight` on the `<Page>`
  style**: it silently drops the `fixed` footer from every page. Set it on
  the text that needs it.

## Sales leaderboard (Pole Position)

`/sales-leaderboard` scores execs 3/2/1 per metric from three Dealerweb
reports: order list (Orders), delivered list (Deliveries, Insurance),
enquiry log (Inbound Conversion). Scoring and attribution are pure, in
`lib/sales-leaderboard.ts`; stored attribution, re-processing and the feed
in `lib/sales-leaderboard-store.ts`.

### Fed from 10 at 10 (user, 2026-10-12)

**The files are uploaded once, to 10 at 10, and it feeds the board** — the
upload form on `/sales-leaderboard/admin` is gone; its Uploads tab now shows
where each month's figures came from, with Re-process and the per-code
diagnostics. `lib/pole-position-feed.ts` (pure, tested for parity with the
file parsers) builds exactly the per-exec rows Pole Position's own parsers
produced, and each change is stored as a `sales_leaderboard_uploads` row
with `source = 'ten-at-ten'`, so attribution, Re-process and the
diagnostics carry on unchanged.

- **History is kept.** `FEED_FROM_MONTH` (2026-10) is the cut-over: earlier
  months keep the figures their own uploads gave them (`source = 'upload'`)
  and are never rewritten from 10 at 10 — even where 10 at 10 holds lines
  for them (the October enquiry log carries 8 late-September enquiries; a
  fed September would have replaced a whole month with eight rows).
- From the cut-over, a month's report is fed only once 10 at 10 actually
  holds it, so a report not yet uploaded there never zeroes the board.
- Every 10 at 10 upload except the Enquiry Tracker re-feeds (Cancelled
  Orders included — it takes cancelled orders out of Order Take); the
  upload result says which months moved. A slot is only stored again when
  its rows changed (`rowsFingerprint`).
- **What each metric now counts:** Order Take — 10 at 10's Orders exactly:
  orders by order date, less held orders the Cancellations matching found
  cancelled (Dealerweb's own order list drops them too), with each Re-Write
  credited to the month of the original order (`creditOrders`), never the
  month it was keyed again. A re-order credited before `FEED_FROM_MONTH`
  leaves the fed months altogether. A manager's Re-Write call re-feeds the
  board, as an upload does. Deliveries — every line in the month by
  delivery date (delivered, arrived and due, as the delivered list always
  counted). Insurance — non-zero W:AC cells, read by 10 at 10's Dealbook
  parser through the shared `countInsuranceProducts`. Inbound Conversion —
  enquiries by the month they were **raised**, where the old upload
  counted every row of the file as the chosen month.
- **Insurance waits for a re-upload.** Dealbook lines stored before
  `insurance_count` existed have none, and a month with any such line is
  not fed (`deliveredRowsFrom` → null) — it keeps its previous figures
  until that month's Dealbook – Deliveries is uploaded to 10 at 10 again.
- Checked on real October files: Order Take, Deliveries and Insurance
  match the old uploads exec for exec.

### Response Time — the fifth metric (user, 2026-10-13)

Scored 3/2/1 like the rest, **fastest wins**: each exec's average working
minutes from a MotorComplete lead reaching them to their first contact —
the exec's own clock, so late allocation (Sales Support) never counts
against them. Same leads and same figure as 10 at 10's Response times "By
exec", which is the check: October 2026 matched exec for exec.

- Fed from 10 at 10's Enquiry Tracker data (the `enquiries` table), only
  leads already judged (`partitionByReportability` against the latest
  MotorComplete upload), by the month the lead came in, from
  `FEED_FROM_MONTH`. Earlier months have no Response Time, so their points
  and champions are unchanged.
- MotorComplete names execs in full; `execCodeFromName` turns "Helen Mort"
  into HeMo and the name map attributes it, like every other metric. That
  rule lives in `lib/sales-leaderboard.ts` and Cancellations shares it.
- Stored as total minutes + count (+ on-target) on the monthly row, so
  several codes for one exec and YTD both average over leads, not over
  averages. No contacted leads → `responseAvg` null → no rank (the zero
  rule). Ties are by the whole minute shown: 12.2 and 12.4 both read 12m
  and share the place.
- Closest race, overtake targets ("3 mins faster"), badges (⚡ Fastest
  Responder), the department KPI (a fall is shown green) and coaching all
  run it the fast way round. Clean Sweep / Podium-in-every-metric count
  only the metrics scored that month, so a pre-October month can still
  earn them on four.

- **Inbound Conversion counts MotorComplete enquiries only** (user's rule,
  2026-10-10): column E (Source) of the enquiry log must be a MotorComplete
  feed — "MotorComplete Lead", "- Leasing.com", "- LeaseLoco", "- carwow".
  `isInboundSource` matches the letters-only prefix `motorcomplete`, so a new
  MotorComplete feed counts without a code change; Customer, Broker
  Introduction, FR website and the like are left out, on both sides of the
  fraction. Expect it to move individual execs a lot: LoBa's October read
  31% all-source and 0% inbound, every sale having come from a Customer or
  Broker lead.
- Inbound counts live in their own columns (`inbound_enquiry_count`,
  `inbound_sales_count` on `sales_leaderboard_monthly`), apart from the
  all-source `enquiry_count` / `sales_count`, and **NULL means unknown**: an
  enquiry log parsed before column E was read has no `sourceStatusCounts`,
  so its month reads "—" rather than all-source numbers under an Inbound
  label. The admin Uploads tab flags those months "Re-upload for Inbound
  Conversion". `ExecMonthStats.enquiryCount` / `salesCount` carry the
  inbound figures — the board, /me, coaching cards and dept trend all read
  conversion from them.

- **Conversion % comes from the enquiry log alone**: inbound enquiries in
  that export whose Status (column Q) is a sale ÷ all their inbound
  enquiries in it. It
  is NOT orders ÷ enquiries, so an exec can have orders on the board and a
  low or 0% conversion. That is a true result when those orders came from
  leads raised before the export's window (or from repeat customers) —
  confirmed against the October 2026 files, where HeMo's only order
  matched none of their 19 enquiries. It is kept separate from Order Take
  deliberately, or the same orders would score twice.
- **Sale statuses are `Ordered`, `Handover Arranged` and `Delivered`**
  (`SALE_STATUSES`). Dealerweb walks a converted enquiry through all
  three. Handover Arranged was missing, and an exec whose one converted
  enquiry had reached it read 0% beside their order. Add new post-order
  statuses there.
- Uploads store each code's raw **status tally** (`statusCounts`), and
  attribution re-derives sales from it through `enquirySales()`. A change
  to the status list therefore reaches past months on **Re-process**.
  Uploads made before the tally existed only hold a frozen `salesCount` —
  those months need the enquiry log uploading once more.
- **No enquiries shows `—`, never `0.0%`** (`formatConversion`). 0 of 0
  is no data, not a rate.
- **A zero earns no rank, no points and no badge** on any metric, which
  is the rule `overallRanks` already applied to total points. Ranked,
  everyone on 0 tied for the first place below the last non-zero score:
  with two execs converting, the rest of the team shared 3rd on 0% and
  each took a point and a 🥉.
- Several report codes can map to one exec; attribution **sums** them.
- The order and delivered lists end in a totals block whose column B is a
  number (`0`, `1`, `42`). Numeric codes are skipped as not-an-exec.

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
