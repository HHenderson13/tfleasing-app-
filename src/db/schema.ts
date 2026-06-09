import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const funders = sqliteTable("funders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

// Maintenance is always 'customer' (Customer Maintained) or 'maintained'.
export const funderCommission = sqliteTable(
  "funder_commission",
  {
    funderId: text("funder_id").notNull(),
    contract: text("contract").notNull(), // 'PCH' | 'BCH'
    maintenance: text("maintenance").notNull(), // 'customer' | 'maintained'
    commissionGbp: real("commission_gbp").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.funderId, t.contract, t.maintenance] }) })
);

// Per-funder, per-term annual interest rate used to amortise capital
// adjustments (commission, discounts, grants) into the monthly rental.
// termFollowOns = termMonths - 1 (23 for 2yr, 35 for 3yr, 47 for 4yr).
// rental1Adv / rental12Adv are the input quotes that the bisection solver used
// to back out annualRate — kept so the UI can prefill on edit.
export const funderInterestRates = sqliteTable(
  "funder_interest_rates",
  {
    funderId: text("funder_id").notNull(),
    termFollowOns: integer("term_follow_ons").notNull(),
    annualRate: real("annual_rate").notNull(),
    rental1Adv: real("rental_1adv"),
    rental12Adv: real("rental_12adv"),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.funderId, t.termFollowOns] }) })
);

export const vehicles = sqliteTable(
  "vehicles",
  {
    capCode: text("cap_code").primaryKey(),
    capId: text("cap_id"), // numeric CAP master ID, parsed from col E of source ratebook
    model: text("model").notNull(),
    derivative: text("derivative").notNull(),
    isVan: integer("is_van", { mode: "boolean" }).notNull().default(false),
    fuelType: text("fuel_type"),
    listPriceNet: real("list_price_net"),
    discountKey: text("discount_key"), // FK-ish into model_discounts.id (editable)
  },
  (t) => ({ byModel: index("idx_vehicles_model").on(t.model) })
);

export const ratebook = sqliteTable(
  "ratebook",
  {
    funderId: text("funder_id").notNull(),
    capCode: text("cap_code").notNull(),
    initialRentalMultiplier: integer("initial_rental_multiplier").notNull(),
    termMonths: integer("term_months").notNull(),
    annualMileage: integer("annual_mileage").notNull(),
    isBusiness: integer("is_business", { mode: "boolean" }).notNull(),
    isMaintained: integer("is_maintained", { mode: "boolean" }).notNull(),
    monthlyRental: real("monthly_rental").notNull(),
    monthlyMaintenance: real("monthly_maintenance").notNull().default(0),
    excessMileage: real("excess_mileage"), // pence/mile, parsed from col Z of source ratebook
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.funderId, t.capCode, t.initialRentalMultiplier, t.termMonths, t.annualMileage, t.isBusiness, t.isMaintained],
    }),
    byLookup: index("idx_ratebook_lookup").on(t.capCode, t.termMonths, t.annualMileage, t.isBusiness, t.isMaintained),
  })
);

// Track ratebook upload history per (funder, maintenance) variant.
export const ratebookUploads = sqliteTable("ratebook_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  funderId: text("funder_id").notNull(),
  isMaintained: integer("is_maintained", { mode: "boolean" }).notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
});

export const ratebookRemoteSettings = sqliteTable("ratebook_remote_settings", {
  id: text("id").primaryKey(),
  protocol: text("protocol").notNull().default("sftp"),
  host: text("host").notNull(),
  port: integer("port"),
  username: text("username").notNull(),
  password: text("password").notNull(),
  remotePath: text("remote_path").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Persists cap_code → discount_key across vehicle deletions so mappings survive ratebook churn.
export const savedDiscountKeys = sqliteTable("saved_discount_keys", {
  capCode: text("cap_code").primaryKey(),
  discountKey: text("discount_key").notNull(),
});

export const salesExecs = sqliteTable("sales_execs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const groupSites = sqliteTable("group_sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("car"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  businessName: text("business_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const PROPOSAL_STATUSES = [
  "proposal_received",
  "accepted",
  "declined",
  "referred_to_dealer",
  "referred_to_underwriter",
  "not_eligible",
  "lost_sale",
  "cancelled",
  "in_order",
  "awaiting_delivery",
  "delivered",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    salesExecId: text("sales_exec_id"),
    isBroker: integer("is_broker", { mode: "boolean" }).notNull().default(false),
    brokerName: text("broker_name"),
    brokerEmail: text("broker_email"),
    isGroupBq: integer("is_group_bq", { mode: "boolean" }).notNull().default(false),
    groupSiteId: text("group_site_id"),
    capCode: text("cap_code").notNull(),
    model: text("model").notNull(),
    derivative: text("derivative").notNull(),
    contract: text("contract").notNull(), // PCH | BCH
    maintenance: text("maintenance").notNull(), // customer | maintained
    termMonths: integer("term_months").notNull(),
    annualMileage: integer("annual_mileage").notNull(),
    initialRentalMultiplier: integer("initial_rental_multiplier").notNull(),
    funderId: text("funder_id").notNull(),
    funderName: text("funder_name").notNull(),
    funderRank: integer("funder_rank").notNull(), // 1, 2, 3 — attempt number
    financeProposalNumber: text("finance_proposal_number"),
    monthlyRental: real("monthly_rental").notNull(),
    parentProposalId: text("parent_proposal_id"),
    status: text("status").notNull().default("proposal_received"),
    underwritingNotes: text("underwriting_notes"),
    acceptedAt: integer("accepted_at", { mode: "timestamp" }),
    chipConfirmed: integer("chip_confirmed", { mode: "boolean" }).notNull().default(false),
    motorCompleteSigned: integer("motor_complete_signed", { mode: "boolean" }).notNull().default(false),
    financeAgreementSigned: integer("finance_agreement_signed", { mode: "boolean" }).notNull().default(false),
    orderNumber: text("order_number"),
    vin: text("vin"),
    manualEtaAt: integer("manual_eta_at", { mode: "timestamp" }),
    manualLocation: text("manual_location"),
    manualEtaUpdatedAt: integer("manual_eta_updated_at", { mode: "timestamp" }),
    deliveredDetectedAt: integer("delivered_detected_at", { mode: "timestamp" }),
    // Customer-handover fields (used after Ford has delivered to us, before we hand to customer).
    deliveryBookedAt: integer("delivery_booked_at", { mode: "timestamp" }),
    regNumber: text("reg_number"),
    deliveredAt: integer("delivered_at", { mode: "timestamp" }),
    // Admin-only manual back-load into awaiting delivery. These deals have
    // incomplete fields (no funder/term/etc captured) and must be excluded
    // from reports/KPIs.
    backLoaded: integer("back_loaded", { mode: "boolean" }).notNull().default(false),
    isEv: integer("is_ev", { mode: "boolean" }).notNull().default(false),
    wallboxIncluded: integer("wallbox_included", { mode: "boolean" }).notNull().default(false),
    customerSavingGbp: real("customer_saving_gbp"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byCustomer: index("idx_proposals_customer").on(t.customerId),
    byStatus: index("idx_proposals_status").on(t.status),
  })
);

export const proposalEvents = sqliteTable(
  "proposal_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: text("proposal_id").notNull(),
    kind: text("kind").notNull(), // created | status_change | note
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ byProposal: index("idx_proposal_events_proposal").on(t.proposalId) })
);

// Admin-editable extra checks that must be ticked on an in-order proposal before
// it can move to awaiting delivery. Built-in checks (chip, MC, finance, vehicle)
// are not represented here — they stay hardcoded.
export const stageCheckDefs = sqliteTable("stage_check_defs", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  appliesToBq: integer("applies_to_bq", { mode: "boolean" }).notNull().default(true),
  // "order" = blocks in_order → awaiting_delivery; "delivery" = blocks awaiting_delivery → delivered.
  stage: text("stage").notNull().default("order"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const proposalStageChecks = sqliteTable(
  "proposal_stage_checks",
  {
    proposalId: text("proposal_id").notNull(),
    checkId: text("check_id").notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.proposalId, t.checkId] }) })
);

export const stockSettings = sqliteTable("stock_settings", {
  id: text("id").primaryKey(),
  workbookPassword: text("workbook_password").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const stockUploads = sqliteTable("stock_uploads", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  vehicleCount: integer("vehicle_count").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
});

export const stockVehicles = sqliteTable("stock_vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vin: text("vin"), // may be null — VIN-less rows still match on order number
  modelRaw: text("model_raw"),
  modelYear: text("model_year"),
  bodyStyle: text("body_style"),
  seriesRaw: text("series_raw"),
  derivativeRaw: text("derivative_raw"),
  engine: text("engine"),
  transmission: text("transmission"),
  drive: text("drive"),
  colourRaw: text("colour_raw"),
  options: text("options"), // joined with newlines
  orderNo: text("order_no"),
  locationStatus: text("location_status"), // e.g. DELIVERED / IN TRANSIT — field is called LOCATION in the input but is a status
  gateReleaseAt: integer("gate_release_at", { mode: "timestamp" }),
  etaAt: integer("eta_at", { mode: "timestamp" }),
  dealerRaw: text("dealer_raw"),
  destinationRaw: text("destination_raw"),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  interestBearingAt: integer("interest_bearing_at", { mode: "timestamp" }),
  adoptedAt: integer("adopted_at", { mode: "timestamp" }),
  customerAssigned: integer("customer_assigned", { mode: "boolean" }).notNull().default(false),
  sourceSheet: text("source_sheet"),
  uploadId: text("upload_id").notNull(),
});

// Per-proposal ETA snapshots — one row per proposal per stock upload, used by
// the daily summary email to detect ETA movements vs. the previous upload.
export const proposalEtaSnapshots = sqliteTable(
  "proposal_eta_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: text("proposal_id").notNull(),
    uploadId: text("upload_id").notNull(),
    etaAt: integer("eta_at", { mode: "timestamp" }),
    locationStatus: text("location_status"),
    capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byProposal: index("idx_eta_snap_proposal").on(t.proposalId),
    byCaptured: index("idx_eta_snap_captured").on(t.capturedAt),
  })
);

// Admin-maintained mappings: raw string from feed -> display name.
// kind: 'dealer' | 'model' | 'colour'
export const stockMappings = sqliteTable(
  "stock_mappings",
  {
    kind: text("kind").notNull(),
    rawKey: text("raw_key").notNull(),
    displayName: text("display_name").notNull(),
    groupSiteId: text("group_site_id"), // optional — only for kind=dealer
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    promoteToVariant: integer("promote_to_variant", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({ pk: primaryKey({ columns: [t.kind, t.rawKey] }) })
);

// Web scraper for leasing.com deals — admin only.
export const scraperRuns = sqliteTable("scraper_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending | running | done | cancelled | error
  urls: text("urls").notNull(), // JSON array of URLs to scrape
  label: text("label"), // User-provided label for the run
  totalUrls: integer("total_urls").notNull().default(0),
  urlsCompleted: integer("urls_completed").notNull().default(0),
  totalResults: integer("total_results").notNull().default(0),
  workflowId: text("workflow_id"), // Vercel Workflow run ID
  error: text("error"), // Error message if failed
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const scraperResults = sqliteTable("scraper_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  sourceUrl: text("source_url"),
  manufacturer: text("manufacturer"),
  range: text("range"),
  model: text("model"),
  derivative: text("derivative"),
  fuelType: text("fuel_type"),
  transmission: text("transmission"),
  bodyStyle: text("body_style"),
  trim: text("trim"),
  monthlyPriceGbp: real("monthly_price_gbp"),
  initialRentalGbp: real("initial_rental_gbp"),
  totalLeaseCostGbp: real("total_lease_cost_gbp"),
  additionalFeesGbp: real("additional_fees_gbp"),
  contractLengthMonths: integer("contract_length_months"),
  annualMileage: integer("annual_mileage"),
  depositMonths: integer("deposit_months"),
  brokerDealerName: text("broker_dealer_name"),
  advertiserCategory: text("advertiser_category"),
  inStock: text("in_stock"), // "Yes" | "No"
  financeType: text("finance_type"),
  dealIdentifier: text("deal_identifier"),
  leasingUrl: text("leasing_url"),
  scrapedAt: integer("scraped_at", { mode: "timestamp" }),
}, (t) => ({ byRun: index("idx_scraper_results_run").on(t.runId) }));

export const scraperLogs = sqliteTable("scraper_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  level: text("level").notNull(), // info | success | warning | error
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({ byRun: index("idx_scraper_logs_run").on(t.runId) }));

export const scraperUrlLists = sqliteTable("scraper_url_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  urls: text("urls").notNull(), // JSON array of URLs
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roles: text("roles").notNull().default("[]"), // JSON array of role strings
  salesExecId: text("sales_exec_id"),           // links exec users to a salesExecs row
  setupToken: text("setup_token"),
  setupTokenExpiresAt: integer("setup_token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ─── Sales-exec leaderboard ─────────────────────────────────────────────────
// Office competition driven by daily-uploaded Dealerweb exports. Admin picks
// which sales execs participate, maps the report-code (e.g. "GaSh") to a
// sales_execs row, and uploads three reports a month — order_list,
// delivered_list, enquiry_log. Stats are stored per (month, exec) so
// re-uploading the same report replaces the previous figures for that month.
export const salesLeaderboardParticipants = sqliteTable("sales_leaderboard_participants", {
  salesExecId: text("sales_exec_id").primaryKey(),
  // Vercel Blob URL for the exec's headshot. Used on the scorecards.
  photoUrl: text("photo_url"),
  // Soft switch — admin can disable a participant without losing their
  // historic stats (still visible in past months).
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

// Maps the short codes used in the Dealerweb reports ("MiHo", "GaSh") onto
// the salesExecs.id PK on this system. Admin maintains the mapping; without
// it the parser can't attribute rows to a specific exec.
export const salesLeaderboardNameMap = sqliteTable("sales_leaderboard_name_map", {
  reportCode: text("report_code").primaryKey(),
  salesExecId: text("sales_exec_id").notNull(),
});

// One row per (yearMonth, exec) — stores the derived counts from the three
// reports. Each upload type writes its own subset of columns; absent metrics
// stay null until that report has been uploaded for the month.
export const salesLeaderboardMonthly = sqliteTable(
  "sales_leaderboard_monthly",
  {
    yearMonth: text("year_month").notNull(), // "2026-06"
    salesExecId: text("sales_exec_id").notNull(),
    orderCount: integer("order_count"),
    deliveryCount: integer("delivery_count"),
    insuranceCount: integer("insurance_count"),
    enquiryCount: integer("enquiry_count"),
    salesCount: integer("sales_count"), // enquiries that ended Ordered or Delivered
    // One "interesting fact" per exec per month — picked at upload time from
    // the order_list to flavour the scorecard. Currently the most recent
    // vehicle they ordered.
    latestVehicle: text("latest_vehicle"),
    ordersUpdatedAt: integer("orders_updated_at", { mode: "timestamp" }),
    deliveriesUpdatedAt: integer("deliveries_updated_at", { mode: "timestamp" }),
    enquiriesUpdatedAt: integer("enquiries_updated_at", { mode: "timestamp" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.yearMonth, t.salesExecId] }),
    byMonth: index("idx_sales_leaderboard_monthly_month").on(t.yearMonth),
  }),
);

// Audit log of each admin upload — who uploaded what report for which month
// and how many rows were parsed. Useful when stats look off ("when was the
// last delivered_list upload?").
export const salesLeaderboardUploads = sqliteTable("sales_leaderboard_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  yearMonth: text("year_month").notNull(),
  reportType: text("report_type").notNull(), // 'orders' | 'delivered' | 'enquiry'
  rowCount: integer("row_count").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
  // JSON-encoded parser output (per report-code aggregates). Allows the
  // monthly stats to be re-attributed when the name map or participants
  // change without the admin having to re-upload the file.
  parsedData: text("parsed_data"),
});

// ─── World Cup prediction game ─────────────────────────────────────────────
// Live (in-progress) match score. Updated by admin during a match — or by a
// future feed integration; the table is shape-compatible. Cleared when the
// final result is recorded via wc_results (the live snapshot was a
// projection; the wc_results row is the canonical truth once full-time hits).
export const wcLiveScores = sqliteTable("wc_live_scores", {
  fixtureNumber: integer("fixture_number").primaryKey(),
  team1Goals: integer("team1_goals").notNull(),
  team2Goals: integer("team2_goals").notNull(),
  minute: integer("minute"), // optional, e.g. 32 = "32' played"
  // 'live' | 'halftime' | 'final' — mirrors what the ESPN feed reports.
  // Used by the auto-record path to track when a fixture has been in FT
  // long enough for us to trust the score.
  status: text("status"),
  // First time we observed ESPN reporting status='final'. Group games where
  // this is >=30 min old auto-settle via the live API route.
  firstFinalAt: integer("first_final_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
});

// Office sweepstake payment tracking — one row per paid player. Admin marks
// paid via the Players tab; non-paid players see a deadline banner until
// they're marked.
export const wcPayments = sqliteTable("wc_payments", {
  userId: text("user_id").primaryKey(),
  paidAt: integer("paid_at", { mode: "timestamp" }).notNull(),
  markedByUserId: text("marked_by_user_id").notNull(),
});

// Fixtures table is the 104 matches (12 groups × 6 + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 3rd + 1 final).
// Seeded idempotently from the spreadsheet template; admins can edit the
// teams on a fixture (knockouts start blank and get filled by auto-advance).
// nextFixtureNumber + nextSlot describe where the winner of this match
// propagates to (null for group games, third-place, and the final).
export const wcFixtures = sqliteTable(
  "wc_fixtures",
  {
    fixtureNumber: integer("fixture_number").primaryKey(),
    stage: text("stage").notNull(), // group | r32 | r16 | qf | sf | third | final
    groupName: text("group_name"),   // 'A'..'L' for group games
    kickoffAt: integer("kickoff_at", { mode: "timestamp" }).notNull(),
    stadium: text("stadium"),
    city: text("city"),
    team1: text("team1"),
    team2: text("team2"),
    nextFixtureNumber: integer("next_fixture_number"),
    nextSlot: text("next_slot"), // 't1' | 't2'
  },
  (t) => ({
    byStage: index("idx_wc_fixtures_stage").on(t.stage),
    byKickoff: index("idx_wc_fixtures_kickoff").on(t.kickoffAt),
  }),
);

// One row per settled match. winnerTeam stores the team name that progresses
// (or 'Draw' for group games). Stored separately from wc_fixtures so editing
// a result doesn't risk clobbering the match metadata.
export const wcResults = sqliteTable(
  "wc_results",
  {
    fixtureNumber: integer("fixture_number").primaryKey(),
    team1Goals: integer("team1_goals").notNull(),
    team2Goals: integer("team2_goals").notNull(),
    etTeam1Goals: integer("et_team1_goals"),
    etTeam2Goals: integer("et_team2_goals"),
    penTeam1: integer("pen_team1"),
    penTeam2: integer("pen_team2"),
    winnerTeam: text("winner_team").notNull(), // team name or 'Draw'
    settledAt: integer("settled_at", { mode: "timestamp" }).notNull(),
    settledByUserId: text("settled_by_user_id").notNull(),
  },
);

// One row per (user, fixture). points is cached after the result lands; null
// while the match is still pending. Predictions are read-only after kickoff.
export const wcPredictions = sqliteTable(
  "wc_predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    fixtureNumber: integer("fixture_number").notNull(),
    team1Goals: integer("team1_goals").notNull(),
    team2Goals: integer("team2_goals").notNull(),
    predictedWinner: text("predicted_winner").notNull(),
    points: integer("points"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    uniqUserFixture: index("uniq_wc_predictions_user_fixture").on(t.userId, t.fixtureNumber),
    byUser: index("idx_wc_predictions_user").on(t.userId),
  }),
);

// Each failed sign-in records one row. We rate-limit by IP over a sliding 15
// minute window — older rows are ignored, fresh rows count toward the limit.
// Stored as an append-only log; no purge job needed (volume is tiny).
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ip: text("ip").notNull(),
    email: text("email"),
    success: integer("success", { mode: "boolean" }).notNull().default(false),
    attemptedAt: integer("attempted_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byIpRecent: index("idx_login_attempts_ip_recent").on(t.ip, t.attemptedAt),
  }),
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── Broker portal ─────────────────────────────────────────────────────────
//
// Completely separate from the TF leasing-app auth. brokers row groups a
// company; broker_users belong to exactly one broker and never to the TF
// users table. broker_sessions uses its own cookie ('tf_broker_session')
// so middleware can route requests to the correct portal based on which
// cookie is present.

export const brokers = sqliteTable("brokers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Soft toggle — disables every user under this broker without deleting
  // their historical quotes.
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const brokerUsers = sqliteTable("broker_users", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // 'owner' can manage other broker_users under the same broker;
  // 'user' can only quote.
  role: text("role").notNull().default("user"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Mirror of the TF user setup-token flow — admin (or broker owner)
  // creates a row, we email a setup URL, user lands on /broker/setup/[token]
  // and chooses their password.
  setupToken: text("setup_token"),
  setupTokenExpiresAt: integer("setup_token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byBroker: index("idx_broker_users_broker").on(t.brokerId),
}));

export const brokerSessions = sqliteTable("broker_sessions", {
  id: text("id").primaryKey(),
  brokerUserId: text("broker_user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Quotes saved by broker users. Visible to every user in the same
// broker (filter on broker_id, never on broker_user_id). Vehicle snapshot
// is stored as JSON so the quote keeps a record of what the broker saw
// even if the underlying stockVehicles row is dropped on the next upload.
export const brokerQuotes = sqliteTable("broker_quotes", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").notNull(),
  createdByBrokerUserId: text("created_by_broker_user_id").notNull(),
  // TF-XXXXXXXX reference + raw VIN at quote time. The reference is what
  // brokers see and pass back to us; VIN lets the admin resolve it
  // unambiguously to a real vehicle in our stock list.
  vehicleRef: text("vehicle_ref").notNull(),
  vehicleVin: text("vehicle_vin").notNull(),
  // Cached at save time so the saved quote keeps reading correctly
  // after the vehicle leaves stock. Shape mirrors MappedStockRow.
  vehicleSnapshot: text("vehicle_snapshot").notNull(),
  // 'outright' | 'pcp' | 'hp' | 'hp_balloon' | 'contract_hire'
  fundingRoute: text("funding_route").notNull(),
  // 'retail' | 'business'. Drives which rate sheet / discount rules apply
  // in Phase 5; for Outright Purchase it's recorded but doesn't change
  // the calc.
  customerType: text("customer_type").notNull(),
  customerIsVatBusiness: integer("customer_is_vat_business", { mode: "boolean" }).notNull().default(false),
  // Broker's commission (entered ex-VAT in the form). VAT calculated at
  // 20% in the save action so the saved quote captures the gross figure
  // used in the totals.
  commissionExVatGbp: real("commission_ex_vat_gbp").notNull(),
  commissionVatGbp: real("commission_vat_gbp").notNull(),
  // Vehicle pricing inputs — entered manually in Phase 3 (until the
  // admin cash-value table arrives in Phase 4). Stored as real GBP.
  vehicleCashGbp: real("vehicle_cash_gbp").notNull(),
  // Stock-turn bonus applied at quote time (Phase 4b onwards).
  // bonus_gbp reduces vehicle_cash in the customer total. The rule_id
  // is for audit so admin can see which programme the broker used.
  stockTurnRuleId: text("stock_turn_rule_id"),
  stockTurnBonusGbp: real("stock_turn_bonus_gbp"),
  // Phase 4e incentives — each id is for audit; each *_gbp is the
  // value applied at the moment of saving so the quote re-displays the
  // same numbers even if admin later edits the source rule.
  evOfferId: text("ev_offer_id"),
  evChoice: text("ev_choice"),                      // 'wallbox' | 'cash' | null when not EV
  evCashGbp: real("ev_cash_gbp"),                   // populated when evChoice = 'cash'
  tradeInOfferId: text("trade_in_offer_id"),
  tradeInGbp: real("trade_in_gbp"),
  testDriveOfferId: text("test_drive_offer_id"),
  testDriveGbp: real("test_drive_gbp"),
  businessDiscountOfferId: text("business_discount_offer_id"),
  businessDiscountGbp: real("business_discount_gbp"),
  // APR uplift only matters on finance routes (Phase 5) — captured here
  // for audit so the saved quote keeps a record of the trade-off the
  // broker chose. Outright quotes leave this null.
  businessAprUpliftPct: real("business_apr_uplift_pct"),
  // Total customer pays. customer_total = (vehicle_cash - stock_turn_bonus)
  //                                       + commission_ex + commission_vat.
  customerTotalGbp: real("customer_total_gbp").notNull(),
  // Finance fields (Phase 5 onwards).
  termMonths: integer("term_months"),
  annualMileage: integer("annual_mileage"),
  upfrontGbp: real("upfront_gbp"),                  // customer's cash deposit / initial rental
  monthlyRentalGbp: real("monthly_rental_gbp"),     // monthly payment / monthly rental
  // Contract Hire-specific (Phase 5d) — left null on PCP/HP/HP-Bal.
  monthlyMaintenanceGbp: real("monthly_maintenance_gbp"),
  initialRentalMultiplier: integer("initial_rental_multiplier"),
  isMaintained: integer("is_maintained", { mode: "boolean" }),
  funderId: text("funder_id"),
  funderName: text("funder_name"),
  balloonGbp: real("balloon_gbp"),                  // optional final payment (PCP / HP-Balloon)
  depositAllowanceGbp: real("deposit_allowance_gbp"),
  annualAprPct: real("annual_apr_pct"),
  amountOfCreditGbp: real("amount_of_credit_gbp"),
  totalChargeForCreditGbp: real("total_charge_for_credit_gbp"),
  totalPayableGbp: real("total_payable_gbp"),
  // Interest-rate rule used for audit. Same pattern as the other rule
  // ids captured on this row — admins can see exactly which programme
  // priced the deal.
  interestRateRuleId: text("interest_rate_rule_id"),
  ofpRowId: integer("ofp_row_id"),                  // null for HP (no balloon)
  // Phase 7 — Ford 1N / 1F finance programme + pricing breakdown that
  // drove the saved quote. All null for legacy / Contract Hire / outright
  // rows where the programme split doesn't apply.
  financeProgramme: text("finance_programme"),       // '1n' | '1f' | null
  retailPriceGbp: real("retail_price_gbp"),
  customerDiscountGbp: real("customer_discount_gbp"),
  deliveryCostsGbp: real("delivery_costs_gbp"),
  dealerProfitGbp: real("dealer_profit_gbp"),
  notes: text("notes"),
  // 'draft' | 'sent' | 'archived'. Phase 3 only sets 'draft'; later
  // phases may track when the broker has shared the quote with us.
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byBroker: index("idx_broker_quotes_broker").on(t.brokerId),
  byBrokerUpdated: index("idx_broker_quotes_broker_updated").on(t.brokerId, t.updatedAt),
}));

// Per-vehicle cash value + margin. Admin-managed. Keyed on the broker-
// visible display attributes (bucket / variant / derivative / model year)
// so the lookup mirrors what the broker sees on the search list — no need
// to expose VIN or cap-code to the admin grid. cap_code / cap_id are
// captured optionally for Phase 5 (finance routes need them for ratebook
// lookups).
// EV Power Promise — wallbox OR cash-alternative discount. The customer
// picks one when the vehicle is electric. Admin maintains one or more
// active offers (different cash levels for different periods).
export const brokerEvOffers = sqliteTable("broker_ev_offers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  cashAlternativeGbp: real("cash_alternative_gbp").notNull(),
  wallboxLabel: text("wallbox_label").notNull(),
  validFrom: integer("valid_from", { mode: "timestamp" }),
  validUntil: integer("valid_until", { mode: "timestamp" }),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Trade-in allowance — fixed £ off when the customer is part-exchanging.
// Carries T&Cs text that gets displayed on the quote.
export const brokerTradeInOffers = sqliteTable("broker_trade_in_offers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  amountGbp: real("amount_gbp").notNull(),
  termsText: text("terms_text").notNull(),
  vehicleClass: text("vehicle_class"),    // null = any class
  bucket: text("bucket"),                 // null = any bucket
  validFrom: integer("valid_from", { mode: "timestamp" }),
  validUntil: integer("valid_until", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Test-drive incentive — £ credit for booking a test drive on the vehicle.
export const brokerTestDriveOffers = sqliteTable("broker_test_drive_offers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  amountGbp: real("amount_gbp").notNull(),
  termsText: text("terms_text"),
  vehicleClass: text("vehicle_class"),
  bucket: text("bucket"),
  validFrom: integer("valid_from", { mode: "timestamp" }),
  validUntil: integer("valid_until", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Business discount — extra discount % for VAT-registered businesses, with
// a paired APR uplift % that applies on finance routes. Per spec: "cash
// purchase no brainer, but if on a finance, then it's worth comparing low
// rate finance less discount vs higher discount higher APR".
// funding_route nullable so a row can apply to any route the broker picks.
export const brokerBusinessDiscounts = sqliteTable("broker_business_discounts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  vehicleClass: text("vehicle_class"),    // null = any class
  bucket: text("bucket"),                 // null = any bucket
  fundingRoute: text("funding_route"),    // null = any route
  extraDiscountPct: real("extra_discount_pct").notNull(),
  aprUpliftPct: real("apr_uplift_pct").notNull().default(0),
  notes: text("notes"),
  validFrom: integer("valid_from", { mode: "timestamp" }),
  validUntil: integer("valid_until", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Optional Final Payment (OFP) data from Ford's quarterly OFP workbooks.
// One workbook per vehicle class (CV / PV), each containing two sheets —
// PCP terminals and HP-with-Balloon terminals. Re-uploading wipes prior
// rows of the same vehicle class and inserts the new set, so the cache
// always reflects the live quarter.
export const brokerOfpUploads = sqliteTable("broker_ofp_uploads", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  vehicleClass: text("vehicle_class").notNull(),  // 'cv' | 'pv'
  rowCount: integer("row_count").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
});

export const brokerOfpData = sqliteTable("broker_ofp_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadId: text("upload_id").notNull(),
  vehicleClass: text("vehicle_class").notNull(),                              // 'cv' | 'pv'
  fundingRoute: text("funding_route").notNull(),                              // 'pcp' | 'hp_balloon'
  // Vehicle description from column B of the source sheet. Stored verbatim;
  // Phase 5 fuzzy-matches against stockVehicles when running a quote.
  vehicle: text("vehicle").notNull(),
  modelYear: text("model_year"),                                              // column C
  termMonths: integer("term_months").notNull(),
  annualMileage: integer("annual_mileage").notNull(),
  balloonGbp: real("balloon_gbp").notNull(),
}, (t) => ({
  byLookup: index("idx_broker_ofp_lookup").on(
    t.vehicleClass, t.fundingRoute, t.vehicle, t.modelYear, t.termMonths, t.annualMileage,
  ),
  byUpload: index("idx_broker_ofp_upload").on(t.uploadId),
}));

// Manufacturer stock-turn bonuses. Admin enters one row per active
// programme (e.g. "Q2 2026 Focus stock turn"). Quote form computes
// which rules apply to a given vehicle based on bucket / model year /
// gate-release window, and lets the broker pick one (or none).
//
// Bonus is treated as a customer-facing discount in Phase 4 outright
// quotes — applied bonus reduces the vehicle cash. Phase 5 will branch
// the finance routes off whether the bonus is taken as customer saving
// vs. retained margin.
export const brokerStockTurnRules = sqliteTable("broker_stock_turn_rules", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  bucket: text("bucket"),                                                       // null = any bucket
  modelYear: text("model_year"),                                                // null = any model year
  gateReleaseFrom: integer("gate_release_from", { mode: "timestamp" }),         // null = no lower bound
  gateReleaseTo: integer("gate_release_to", { mode: "timestamp" }),             // null = no upper bound
  mustRegisterBy: integer("must_register_by", { mode: "timestamp" }).notNull(), // hard registration deadline
  bonusGbp: real("bonus_gbp").notNull(),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// One row per (route × customer type × term × vehicle scope) tariff entry.
// Drives the Phase 5 finance route quotes. Both APR and deposit allowance
// share the exact same lookup key, so they live on the same row instead of
// in two separate tables — saves the admin having to keep them in sync.
//
// Vehicle scope is a coarse class ('car' / 'van' / 'all') plus an optional
// specific bucket — most of the Ford marketing programmes are split that
// way (e.g. "all passenger cars on PCP at 36m" vs "Focus only").
//
// Quote-time lookups prefer the most specific match: exact bucket beats
// class match beats 'all' scope. See lib/broker-interest-rates.ts.
export const brokerInterestRates = sqliteTable("broker_interest_rates", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  vehicleClass: text("vehicle_class").notNull(),                              // 'car' | 'van' | 'all'
  bucket: text("bucket"),                                                     // null = any bucket within class
  customerType: text("customer_type").notNull(),                              // 'retail' | 'business'
  // Ford's two finance programmes. '1n' = Retail (lower APR, smaller
  // discount); '1f' = Business VAT Registered (higher APR, unlocks the
  // 1F discount % on the pricing row). Null = applies to both — used by
  // legacy rows entered before the programme split.
  financeProgramme: text("finance_programme"),                                // '1n' | '1f' | null
  fundingRoute: text("funding_route").notNull(),                              // 'pcp' | 'hp' | 'hp_balloon'
  termMonths: integer("term_months").notNull(),
  annualAprPct: real("annual_apr_pct").notNull(),
  depositAllowanceGbp: real("deposit_allowance_gbp"),                         // nullable — programmes don't always offer one
  validFrom: integer("valid_from", { mode: "timestamp" }),
  validUntil: integer("valid_until", { mode: "timestamp" }),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byKey: index("idx_broker_interest_rates_key").on(t.vehicleClass, t.customerType, t.fundingRoute, t.termMonths),
}));

// One row per (model year × bucket × variant × derivative) pricing entry.
// Captures Ford's full structure: retail RRP + costs (delivery / PDI / 1st
// reg / RFL) + the discount % stack (trading margin + standards + VETS +
// 1F discount) + the minimum dealer profit TF retains. The quote engine
// computes the customer's cash OTR from these for both 1N and 1F.
// See lib/broker-pricing.ts for the formula.
//
// cashGbp is kept for back-compat: rows that haven't been migrated to the
// new component model still use it as a flat fallback. Once retailPriceGbp
// is set, the components take over.
export const brokerVehicleCashValues = sqliteTable("broker_vehicle_cash_values", {
  id: text("id").primaryKey(),
  bucket: text("bucket").notNull(),           // sourceSheet, e.g. "Focus" / "Transit"
  variant: text("variant").notNull(),          // mapped variant name
  derivative: text("derivative"),              // mapped derivative; nullable for vans where it lives in variant
  modelYear: text("model_year"),               // nullable when manufacturer doesn't differentiate
  capCode: text("cap_code"),                   // optional cross-reference to ratebook
  capId: text("cap_id"),                       // optional; Ford CAP-ID
  cashGbp: real("cash_gbp").notNull(),         // legacy: flat cash price (used when components below are null)
  marginGbp: real("margin_gbp"),               // legacy
  marginPct: real("margin_pct"),               // legacy
  // Ford pricing components. All nullable so older rows still work.
  retailPriceGbp: real("retail_price_gbp"),    // manufacturer RRP
  deliveryGbp: real("delivery_gbp"),
  pdiPlatesGbp: real("pdi_plates_gbp"),
  firstRegFeeGbp: real("first_reg_fee_gbp"),
  rflGbp: real("rfl_gbp"),
  tradingMarginPct: real("trading_margin_pct"),
  standardsPct: real("standards_pct"),
  vetsPct: real("vets_pct"),
  oneFDiscountPct: real("one_f_discount_pct"), // extra % the 1F programme unlocks (0 if none)
  dealerProfitGbp: real("dealer_profit_gbp"),  // minimum profit TF retains; remainder of margin pool passes to customer
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  // Compound lookup index — quote form queries by all four columns.
  byKey: index("idx_broker_cash_values_key").on(t.bucket, t.variant, t.derivative, t.modelYear),
}));

// ─── Phase 8: universal pricing model ──────────────────────────────────────
//
// One row per real Ford spec — keyed by the full WERS identifier stack
// (model year × model × bodystyle × derivative × engine × drive × transmission).
// Mirrors the granularity Ford uses in their pricing sheets (Stock List
// Generator Broker.xlsm cols A:F → list price in I).
//
// This is the SOURCE OF TRUTH going forward — the broker_vehicle_cash_values
// table from earlier phases is being deprecated and will be migrated away
// from once every consumer reads from vehicleMaster.
export const vehicleMaster = sqliteTable("vehicle_master", {
  id: text("id").primaryKey(),
  modelYear: text("model_year").notNull(),
  model: text("model").notNull(),                  // RANGER / TRANSIT CUSTOM / KUGA
  bodystyle: text("bodystyle").notNull(),          // DOUBLE CAB / REGULAR CARGO VAN
  derivative: text("derivative").notNull(),        // PLATINUM / WILDTRAK
  engine: text("engine").notNull(),                // 3.0L ECOBLUE V6 240PS
  drive: text("drive").notNull(),                  // 4WD / FWD / RWD
  transmission: text("transmission").notNull(),    // 10 SPEED AUTOMATIC
  // CAP identifiers for ratebook bridge
  capCode: text("cap_code"),
  capId: text("cap_id"),
  // Manually-entered basic list price (manufacturer RRP)
  basicListPriceGbp: real("basic_list_price_gbp").notNull(),
  // Per-vehicle delivery (varies — admin enters individually)
  manufacturerDeliveryGbp: real("manufacturer_delivery_gbp").notNull().default(0),
  // Drives RFL on commercial vehicles + grant eligibility on cars
  fuelType: text("fuel_type").notNull(),           // 'ice' | 'phev' | 'bev'
  isVan: integer("is_van", { mode: "boolean" }).notNull(),
  // CO2 (g/km) — required for cars, drives the car RFL band lookup. Null for vans.
  co2GKm: integer("co2_g_km"),
  // Grants. Admin enters as £ paid by government — these are NO VAT and
  // come off the customer-facing price after the discount stack.
  pivgGrantGbp: real("pivg_grant_gbp").notNull().default(0),
  olevGrantGbp: real("olev_grant_gbp").notNull().default(0),
  // Ford 1F programme bonus discount, per derivative (Stock List
  // Generator col "1F"). Only applied when customer takes 1F finance.
  oneFDiscountPct: real("one_f_discount_pct").notNull().default(0),
  // Which margin bucket's rules apply. Null = no margins (admin hasn't
  // assigned yet).
  marginBucketId: text("margin_bucket_id"),
  // Minimum profit TF retains. Mode toggles between flat £ and % of
  // basic_list_price; whichever is set wins at calc time.
  profitMode: text("profit_mode").notNull().default("gbp"),  // 'gbp' | 'pct'
  profitValue: real("profit_value").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byLookup: index("idx_vehicle_master_lookup").on(
    t.modelYear, t.model, t.bodystyle, t.derivative, t.engine, t.transmission,
  ),
  byModel: index("idx_vehicle_master_model").on(t.model, t.modelYear),
}));

// One row per available option on a vehicle. Customer-selected options
// get added on top of the base OTR.
export const vehicleOptions = sqliteTable("vehicle_options", {
  id: text("id").primaryKey(),
  vehicleId: text("vehicle_id").notNull(),
  optionCode: text("option_code"),                 // optional manufacturer code
  label: text("label").notNull(),                  // human-readable name
  priceGbp: real("price_gbp").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byVehicle: index("idx_vehicle_options_vehicle").on(t.vehicleId),
}));

// A margin bucket groups vehicles that share the same set of discount
// rules — e.g. "Ranger", "Transit Custom", "Kuga PHEV". Each bucket
// owns a list of margin rules (trading margin %, franchise bonus %,
// etc) which are summed at quote time. Vehicles point at one bucket
// via vehicle_master.margin_bucket_id.
export const marginBuckets = sqliteTable("margin_buckets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const marginBucketRules = sqliteTable("margin_bucket_rules", {
  id: text("id").primaryKey(),
  bucketId: text("bucket_id").notNull(),
  label: text("label").notNull(),                  // e.g. "Base Trading Margin"
  pct: real("pct").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byBucket: index("idx_margin_bucket_rules_bucket").on(t.bucketId),
}));

// Singleton row of global settings. Admin updates these once and they
// apply across every vehicle in the new model.
export const brokerSettings = sqliteTable("broker_settings", {
  id: integer("id").primaryKey(),                  // always 1
  firstRegFeeGbp: real("first_reg_fee_gbp").notNull().default(55),
  pdiPlatesGbp: real("pdi_plates_gbp").notNull().default(135),
  // CV RFL is a flat amount per fuel type. ICE + PHEV share one bracket;
  // BEV has its own (often £0).
  cvRflIcePhevGbp: real("cv_rfl_ice_phev_gbp").notNull().default(335),
  cvRflBevGbp: real("cv_rfl_bev_gbp").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Car RFL bands keyed on CO2 g/km. Customer-facing RFL for a car is the
// row whose [co2From, co2To] range contains the car's CO2.
export const carRflBands = sqliteTable("car_rfl_bands", {
  id: text("id").primaryKey(),
  co2From: integer("co2_from").notNull(),
  co2To: integer("co2_to").notNull(),
  rflGbp: real("rfl_gbp").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Editable discount table driven by admin. Keyed by a stable id (slug).
export const modelDiscounts = sqliteTable("model_discounts", {
  id: text("id").primaryKey(), // stable slug e.g. "puma-ice", "explorer-new-my-std"
  label: text("label").notNull(), // display name e.g. "Puma ICE"
  trimNote: text("trim_note"),
  termsPct: real("terms_pct").notNull().default(0), // "Terms" column (Ford BP/BQ)
  dealerPct: real("dealer_pct").notNull().default(0), // Dealer Discount
  additionalDiscountsGbp: real("additional_discounts_gbp").notNull().default(0), // £ extras applied to every quote in this profile
  novunaChip3Yr: real("novuna_chip_3yr"), // Novuna-only % bonus on 3-year terms
  novunaChip4Yr: real("novuna_chip_4yr"), // Novuna-only % bonus on 4-year terms
  grantText: text("grant_text"),
  customerSavingGbp: real("customer_saving_gbp"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});
