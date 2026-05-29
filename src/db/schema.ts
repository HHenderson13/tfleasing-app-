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

// ─── World Cup prediction game ─────────────────────────────────────────────
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
