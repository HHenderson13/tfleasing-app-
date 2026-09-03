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

Column H of the stock export is the customer / fleet-assigned marker, and
**any** value in it hides a vehicle from `/stock` — which is why ~86% of an
upload (21,504 of 25,066 rows at the time of writing) is excluded. Some
values in it, and some values of column E, mark stock that is genuinely ours
to sell.

- `stock_availability_rules` holds one row per column letter, seeded `H = CO`
  and `E = 66170`, both enabled. Admin edits the value or toggles it at
  `/admin/stock` → **Availability rules**.
- **A rule decides whether a vehicle APPEARS, not what its badge says.** A
  matched vehicle keeps its normal status: `DELIVERED` still reads "in
  stock", `CRAIOVA` still reads as an ETA. A rule asserts ownership, not
  location. (User's explicit choice, 2026-09-03.)
- Matching is **positional** — `rawColE` / `rawColH` are captured by index
  (4 and 7) in *both* parser paths. The header sheet and the fixed-column
  sheet disagree about what those columns are called, but an operator
  reading their own file just sees "column H". Raw values are stored so a
  rule can be re-valued or switched off **without re-uploading stock**.
- Comparison is trimmed and case-insensitive, and **exact, never a prefix**:
  `CO` must not catch `CORP`. An empty value never matches — otherwise
  blanking the field with the rule left on would match every empty cell and
  drag the whole excluded set into the list. `stock-availability.test.ts`
  pins all of that.
- Row inclusion is done in **SQL** (`stock-list.ts` builds the OR clauses
  from the enabled rules), not by loading 25k rows and filtering in JS.
- `includedByRule` marks rows that only appear because a rule matched. It is
  **TF-only** — redacted for brokers, who have no business knowing how we
  classify our own stock — and drives a `Rule` tag plus an "Included by"
  facet so whoever set a rule up can see what it caught. A typo that matches
  nothing otherwise looks identical to a correct rule, which is why the
  settings screen counts what each rule catches.
- **That count is split three ways, and must stay split.** A single "N
  vehicles match" figure disagreed with the stock list's own filter and read
  as lost stock: the filter only shows rows the rule RESCUED, so a rule
  matching 66 rows could show 32 and look broken. The groups are
  `pulledIn` (hidden without the rule — what the filter shows),
  `alreadyVisible` (in the list regardless; the rule changes nothing), and
  `noVin` (never reaches the list at all — `/stock` has always required a
  VIN, because the `TF-xxxx` reference is a hash of it). If a rule's numbers
  ever look wrong again, check which group is being counted before assuming
  rows are being dropped.

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
