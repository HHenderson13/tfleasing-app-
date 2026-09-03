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
    // Coarse "expected delivery month" the exec sets when a firm date
    // isn't yet known. Stored as YYYY-MM (e.g. "2026-07") so it can be
    // ranked + grouped trivially without needing a full date. Optional —
    // some execs use it as a planning aid, others don't.
    estimatedDeliveryMonth: text("estimated_delivery_month"),
    regNumber: text("reg_number"),
    deliveredAt: integer("delivered_at", { mode: "timestamp" }),
    // Admin-only manual back-load into awaiting delivery. These deals have
    // incomplete fields (no funder/term/etc captured) and must be excluded
    // from reports/KPIs.
    backLoaded: integer("back_loaded", { mode: "boolean" }).notNull().default(false),
    isEv: integer("is_ev", { mode: "boolean" }).notNull().default(false),
    wallboxIncluded: integer("wallbox_included", { mode: "boolean" }).notNull().default(false),
    customerSavingGbp: real("customer_saving_gbp"),
    // Delivery tracker fields (mirror Lou's Excel "2026" tab columns G-U).
    // Most are optional — only execs who use them will fill them in.
    vehicleColour: text("vehicle_colour"),
    factoryOptions: text("factory_options"),
    pdiDone: integer("pdi_done", { mode: "boolean" }).notNull().default(false),
    invoiced: integer("invoiced", { mode: "boolean" }).notNull().default(false),
    itcComplete: integer("itc_complete", { mode: "boolean" }).notNull().default(false),
    // GAP / TF Protect — tri-state because customers either don't have one,
    // have one pending setup, or have one fully paid + activated.
    gapPolicyStatus: text("gap_policy_status").notNull().default("none"),    // 'none' | 'pending' | 'complete'
    gapPolicyNumber: text("gap_policy_number"),                              // shown once status != 'none'
    tfpPolicyStatus: text("tfp_policy_status").notNull().default("none"),    // 'none' | 'pending' | 'complete'
    tfpPolicyNumber: text("tfp_policy_number"),
    // Taxed — promoted from the old admin-managed custom-check list because
    // every CV/car delivery needs it. Rendered as a core toggle card.
    taxed: integer("taxed", { mode: "boolean" }).notNull().default(false),
    deliveryNotes: text("delivery_notes"),
    // Gate the delivered transition — both must be ticked before status
    // can flip from awaiting_delivery to delivered.
    deliveryPackSubmitted: integer("delivery_pack_submitted", { mode: "boolean" }).notNull().default(false),
    deliveryDetailsChecked: integer("delivery_details_checked", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byCustomer: index("idx_proposals_customer").on(t.customerId),
    byStatus: index("idx_proposals_status").on(t.status),
  })
);

// Dealer-fit options the customer's ordered (tow bars, mats, paint protection,
// etc) — one row per item, marked off as fitted. Surface on the delivery
// tracker so the exec can confirm everything's been installed before the
// vehicle goes out.
export const dealerFitOptions = sqliteTable(
  "dealer_fit_options",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id").notNull(),
    label: text("label").notNull(),
    fitted: integer("fitted", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ byProposal: index("idx_dealer_fit_options_proposal").on(t.proposalId) }),
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

// Vehicles that column H or column E says are available, whatever the rest of
// the row implies.
//
// Column H is normally the customer/fleet-assigned marker: ANY value in it
// hides the vehicle from /stock. Certain codes in it ("CO") and certain
// values of column E ("66170") mark stock that is genuinely ours to sell, so
// a matching row is pulled back into the list. It keeps its normal status —
// the rule decides whether a vehicle APPEARS, not whether it reads as
// in-stock or as an ETA.
//
// One row per column letter, seeded and then edited by admin, so a rule can
// be switched off or re-valued from the UI rather than in code.
export const stockAvailabilityRules = sqliteTable("stock_availability_rules", {
  columnLetter: text("column_letter").primaryKey(), // "E" | "H"
  matchValue: text("match_value").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Vehicles the feed calls one thing that are really another, identified by
// the dealer they sit at.
//
// An Explorer on a van dealer code is an Explorer Van — Ford's export gives
// both the same model name, and only the site tells them apart. It also
// carries a warning, different at each end: TF checks with Fleet before
// offering one, a broker checks with us. Offering a van as a car is the
// mistake this exists to prevent.
//
// Data, not code, because dealer codes move — sites open, close and get
// renumbered, and none of that should need a deploy.
export const stockModelDealerRules = sqliteTable("stock_model_dealer_rules", {
  id: text("id").primaryKey(),
  modelRaw: text("model_raw").notNull(),         // feed's model name, e.g. "EXPLORER"
  dealerCodes: text("dealer_codes").notNull(),   // comma-separated site codes
  displayName: text("display_name").notNull(),   // "Explorer Van"
  tfNote: text("tf_note"),                       // shown on /stock
  brokerNote: text("broker_note"),               // shown on /broker/stock
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// The key the vehicle reference hash is built with.
//
// Without it the scheme is reversible: dealer codes and order numbers are
// short and enumerable, and the whole reference space can be mapped in under
// a second on a laptop — handing anyone who worked out the algorithm the
// dealer code behind any reference, which is one of the things brokers are
// deliberately not shown.
//
// Kept in the DATABASE rather than an env var on purpose. It has to survive
// forever — change it and every reference in circulation stops resolving —
// so it lives where the backups are, rather than somewhere it can be lost or
// mismatched between environments. Generated once, on first use.
export const stockReferenceSecret = sqliteTable("stock_reference_secret", {
  id: integer("id").primaryKey(),
  secret: text("secret").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
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
  // Raw spreadsheet values, kept verbatim so the availability rules in
  // stock_availability_rules can be toggled or re-valued without re-uploading
  // stock. Positional (E = 5th column, H = 8th) because that is what an
  // operator reads off their own sheet, and the two parser layouts disagree
  // about what those columns are called.
  rawColE: text("raw_col_e"),
  rawColH: text("raw_col_h"),
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
  // Soft toggle — locks out every user under this broker without deleting
  // the company or its users.
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
  // Vestigial. Broker self-service was removed — TF adds and removes every
  // broker user from /admin/brokers — so nothing reads this. The column
  // stays because schema changes here are additive only; new rows are
  // written as 'user'.
  role: text("role").notNull().default("user"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Mirror of the TF user setup-token flow — admin (or broker owner)
  // creates a row, we email a setup URL, user lands on /broker/setup/[token]
  // and chooses their password.
  setupToken: text("setup_token"),
  setupTokenExpiresAt: integer("setup_token_expires_at", { mode: "timestamp" }),
  // TOTP second factor, required on every sign-in. Null until enrolled —
  // the login flow sends anyone without a secret to /broker/enrol first.
  // Admin clears it to re-enrol someone who has lost their phone.
  totpSecret: text("totp_secret"),
  totpEnrolledAt: integer("totp_enrolled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byBroker: index("idx_broker_users_broker").on(t.brokerId),
}));

export const brokerSessions = sqliteTable("broker_sessions", {
  id: text("id").primaryKey(),
  brokerUserId: text("broker_user_id").notNull(),
  // Absolute ceiling — the session dies here however active they are, which
  // is what forces a fresh 2FA code.
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  // Idle clock. Nullable because sessions created before this column existed
  // have no value; those are treated as last seen at createdAt.
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// A password that has been accepted but not yet second-factored.
//
// Deliberately a separate table from broker_sessions: until the emailed code
// comes back this is NOT a session and must not be able to become one by
// accident. Nothing here grants access to anything.
//
// No code is stored: it comes from the broker's authenticator app and is
// checked against their enrolled secret. This record only says "this person
// got the password right, and has ten minutes to prove the rest".
export const brokerLoginChallenges = sqliteTable("broker_login_challenges", {
  id: text("id").primaryKey(),
  brokerUserId: text("broker_user_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byUser: index("idx_broker_challenges_user").on(t.brokerUserId),
}));

// Who has accepted the stock-access terms, and which version.
//
// The watermark identifies a leaker; this is what makes that mean
// something. "Their name was on it" is an accusation — "their name was on
// it and they accepted these terms at 09:14 on 3 September from this IP"
// is a record. Versioned so tightened wording can be re-accepted rather
// than silently applied to people who never saw it.
export const brokerTermsAcceptances = sqliteTable("broker_terms_acceptances", {
  id: text("id").primaryKey(),
  brokerUserId: text("broker_user_id").notNull(),
  brokerId: text("broker_id").notNull(),
  version: text("version").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byUser: index("idx_broker_terms_user").on(t.brokerUserId),
}));

// Capture-attempt audit trail for the broker portal. No browser can stop a
// screenshot, so the deterrent is that every attempt we CAN see is recorded
// against a named user, and every rendered page carries their identity as a
// watermark. This table is the "we noticed" half.
//
// `kind` is a short slug — print-screen-key, print, watermark-tamper,
// devtools, copy, context-menu. `detail` is free-form JSON for anything
// worth keeping (user agent, screen size, how many times).
export const brokerSecurityEvents = sqliteTable("broker_security_events", {
  id: text("id").primaryKey(),
  brokerUserId: text("broker_user_id").notNull(),
  brokerId: text("broker_id").notNull(),
  kind: text("kind").notNull(),
  path: text("path"),
  detail: text("detail"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byUser: index("idx_broker_sec_events_user").on(t.brokerUserId),
  byCreated: index("idx_broker_sec_events_created").on(t.createdAt),
}));

// ─── Forecast calculator ───────────────────────────────────────────────────
// Monthly financial forecast built on top of dealbook CSV extracts. Two
// upload sources (Leasing + Salary Sacrifice) feed the same line table;
// each line carries an effective_month that defaults to the registered
// date but can be overridden by the user.

export const forecastDealbookUploads = sqliteTable("forecast_dealbook_uploads", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),                          // 'lease' | 'salary_sacrifice'
  monthYyyymm: text("month_yyyymm").notNull(),               // upload's intended month, e.g. "2026-06"
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  // Snapshot of live config + vehicle catalogue + per-vehicle bonuses
  // at the moment of upload, JSON-encoded. The monthly view computes
  // its forecast from the FIRST upload's snapshot for the month, so
  // later admin changes don't retroactively rewrite past months.
  settingsSnapshot: text("settings_snapshot"),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
});

export const forecastDealbookLines = sqliteTable("forecast_dealbook_lines", {
  id: text("id").primaryKey(),
  uploadId: text("upload_id").notNull(),
  source: text("source").notNull(),                          // copied from upload for fast filtering
  defaultMonth: text("default_month").notNull(),             // YYYY-MM derived from reg/invoice/order date
  overrideMonth: text("override_month"),                     // YYYY-MM user override (null = use default)
  effectiveMonth: text("effective_month").notNull(),         // override ?? default, kept in sync at write time

  branch: text("branch"),
  vehicleType: text("vehicle_type"),                         // "Car" | "LCV" | "Van"
  salesType: text("sales_type"),                             // "Retail" | …
  salesSubType: text("sales_sub_type"),
  customerName: text("customer_name"),
  model: text("model"),

  orderDate: text("order_date"),                             // YYYY-MM-DD (or original)
  regDate: text("reg_date"),
  delivDate: text("deliv_date"),
  invoiceDate: text("invoice_date"),
  delivStatus: text("deliv_status"),                         // "Dlv" | "Arr" | "Est"

  chassisProfit: real("chassis_profit").notNull().default(0),
  addBonus: real("add_bonus").notNull().default(0),
  metalSubsidy: real("metal_subsidy").notNull().default(0),
  reconCost: real("recon_cost").notNull().default(0),
  oallowDiscount: real("oallow_discount").notNull().default(0),
  accessoryProfit: real("accessory_profit").notNull().default(0),
  warrantyCost: real("warranty_cost").notNull().default(0),
  totalVehicleProfit: real("total_vehicle_profit").notNull().default(0),
  financeIncome: real("finance_income").notNull().default(0),
  financeMb: real("finance_mb").notNull().default(0),
  tyreInsIncome: real("tyre_ins_income").notNull().default(0),
  financeSubsidy: real("finance_subsidy").notNull().default(0),
  cpiIncome: real("cpi_income").notNull().default(0),
  smartRepair: real("smart_repair").notNull().default(0),
  gapRtiIncome: real("gap_rti_income").notNull().default(0),
  paintProtection: real("paint_protection").notNull().default(0),
  warranty: real("warranty").notNull().default(0),
  totalFiIncome: real("total_fi_income").notNull().default(0),
  totalGrossProfit: real("total_gross_profit").notNull().default(0),

  vin: text("vin"),
  regNo: text("reg_no"),
  customerExternalId: text("customer_external_id"),          // Dealbook "Customer Id"
  financeCo: text("finance_co"),

  // Vehicle classification — set at upload time by matching `model`
  // against forecast_vehicles.keywords. `kind` drives the Car/CV sheet
  // split; `vehicleId` lets per-vehicle bonus rates flow through.
  // `kind = "unknown"` flags lines we couldn't match and prompts the
  // admin to add the vehicle in Admin → Vehicles.
  vehicleId: text("vehicle_id"),
  kind: text("kind").notNull().default("unknown"),           // "car" | "van" | "unknown"

  // Column BQ of the dealbook export — used by the ICE chassis-GP
  // formula and by Standards / Stocking credits which multiply this by
  // a per-vehicle percentage.
  basic: real("basic").notNull().default(0),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  byUpload: index("idx_forecast_lines_upload").on(t.uploadId),
  byMonth: index("idx_forecast_lines_month").on(t.effectiveMonth),
  bySource: index("idx_forecast_lines_source").on(t.source),
  byKind: index("idx_forecast_lines_kind").on(t.kind),
}));

// User-keyed final accounts. Once the official accounts publish, the user
// enters them per (month, sheet, line) so the forecast view can show
// "Actual" alongside the dealbook-derived Day-X forecasts.
export const forecastActuals = sqliteTable("forecast_actuals", {
  id: text("id").primaryKey(),
  monthYyyymm: text("month_yyyymm").notNull(),
  sheet: text("sheet").notNull(),                            // 'car' | 'cv' | 'overheads'
  lineKey: text("line_key").notNull(),                       // stable line slug e.g. 'new_car_units'
  value: real("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
}, (t) => ({
  bySlot: index("idx_forecast_actuals_slot").on(t.monthYyyymm, t.sheet, t.lineKey),
}));

// User's "I'll forecast N more units at £X margin" inputs per month/sheet.
// Stored as free key/value pairs so we can add new inputs without schema
// changes — the admin tab controls which keys exist.
export const forecastInputs = sqliteTable("forecast_inputs", {
  id: text("id").primaryKey(),
  monthYyyymm: text("month_yyyymm").notNull(),
  sheet: text("sheet").notNull(),                            // 'car' | 'cv' | 'overheads'
  scenarioKey: text("scenario_key").notNull(),               // e.g. 'additional_units'
  value: real("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  bySlot: index("idx_forecast_inputs_slot").on(t.monthYyyymm, t.sheet, t.scenarioKey),
}));

// Admin-editable configuration: percentages, flat amounts, etc. that feed
// the forecast math. e.g. dpa_pct = 2.5, house_charge_per_unit = 175.
export const forecastConfig = sqliteTable("forecast_config", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),   // 'car' | 'cv' | 'overheads' | 'bpm' | 'general'
  // How the value should be applied to the forecast: multiplied by
  // total units (per_unit), used as-is (per_month), or referenced
  // directly by hardcoded formulas (special — e.g. car_house_charge).
  applies: text("applies").notNull().default("special"),     // 'per_unit' | 'per_month' | 'special'
  // The line key from line-definitions.ts that this config drives.
  // null for "special" entries that hardcoded formulas reference by key.
  appliesToLineKey: text("applies_to_line_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Per-month forecast scenarios. Each row says "I expect N more units of
// this vehicle to land in this month at this chassis £ per unit". F&I,
// Standards margin, Stocking credits, DPA Quarter / Half-Year and Pot of
// Gold contributions are derived automatically from the vehicle's per-
// vehicle bonus rates and its historical averages — see
// app/forecast/monthly/car-forecast.ts.
export const forecastScenarios = sqliteTable("forecast_scenarios", {
  id: text("id").primaryKey(),
  monthYyyymm: text("month_yyyymm").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  chassisGpPerUnit: real("chassis_gp_per_unit").notNull(),
  units: integer("units").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Vehicle catalogue used to split dealbook lines into Cars vs Commercials
// and to drive per-vehicle bonus rates (Guarantee B %, DPA %, etc.).
// `keywords` is a JSON array of substrings — when the classifier finds
// any of them inside the dealbook "Model" column, the line is tagged
// with this vehicle + kind. Longer keywords win to keep "Puma Gen-E"
// from being misclassified as plain "Puma".
export const forecastVehicles = sqliteTable("forecast_vehicles", {
  id: text("id").primaryKey(),                                  // slug e.g. "puma-gen-e"
  name: text("name").notNull(),                                  // display "Puma Gen-E"
  kind: text("kind").notNull(),                                  // "car" | "van"
  // Powertrain — only "car" rows use this, but it lives on every row
  // for simplicity. ICE rows get the Guarantee B deduction in Chassis
  // GP and qualify for Standards margin + Stocking credits; BEV rows
  // skip all three.
  fuelType: text("fuel_type").notNull().default("ice"),         // "ice" | "bev"
  keywords: text("keywords").notNull().default("[]"),            // JSON array of strings
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Per-vehicle bonus values. Each row is one bonus slot for one vehicle.
// Bonus keys differ for cars vs vans (see CAR_BONUS_KEYS / VAN_BONUS_KEYS
// in src/app/forecast/vehicle-bonuses.ts) but the table is generic so
// adding new bonus types is metadata-only.
export const forecastVehicleBonuses = sqliteTable("forecast_vehicle_bonuses", {
  vehicleId: text("vehicle_id").notNull(),
  bonusKey: text("bonus_key").notNull(),
  value: real("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.vehicleId, t.bonusKey] }),
}));

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

// ─── Enquiry Tracker ───────────────────────────────────────────────────
//
// One row per enquiry, ingested from the MotorComplete "ag-grid" export.
// Uploads stack: each daily export is merged in rather than replacing what
// is already stored, keyed on `id` (a stable hash of the natural key —
// see makeEnquiryId in src/lib/enquiries.ts). Re-uploading a row that has
// since been contacted updates the timestamps in place instead of
// creating a duplicate.
//
// All timestamps are *wall-clock* epochs (see src/lib/business-hours.ts):
// the local office time re-encoded as UTC, so business-hours maths is
// immune to BST/GMT transitions.
export const enquiries = sqliteTable(
  "enquiries",
  {
    id: text("id").primaryKey(),
    dealer: text("dealer"),                                  // col A
    salesExec: text("sales_exec").notNull(),                 // col B "Created By"
    customer: text("customer").notNull(),                    // col C
    customerRef: text("customer_ref"),                       // col D "Customer Id"
    enquiryAt: integer("enquiry_at").notNull(),              // col E "Date Raised"
    contactedAt: integer("contacted_at"),                    // col L "2nd Contact"
    transferredAt: integer("transferred_at"),                // col P "Date Transferred"
    enquiryOwner: text("enquiry_owner"),                     // col Q
    source: text("source"),                                  // col G
    status: text("status"),                                  // col AC
    // Derived on ingest so the dashboards can aggregate in SQL without
    // replaying the business-hours walk for every row on every request.
    allocMins: integer("alloc_mins"),                        // E → P, business mins
    contactMins: integer("contact_mins"),                    // P → L, business mins
    sameDayExpected: integer("same_day_expected", { mode: "boolean" }).notNull().default(false),
    sameDayMet: integer("same_day_met", { mode: "boolean" }).notNull().default(false),
    enquiryDay: text("enquiry_day").notNull(),               // "YYYY-MM-DD" grouping key
    uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
    uploadedByUserId: text("uploaded_by_user_id"),
  },
  (t) => ({
    byDay: index("idx_enquiries_day").on(t.enquiryDay),
    byExec: index("idx_enquiries_exec").on(t.salesExec),
    byEnquiryAt: index("idx_enquiries_enquiry_at").on(t.enquiryAt),
  }),
);

// One row per upload, so the admin page can show what landed when and
// the ingest can report "142 new, 38 updated, 400 unchanged".
export const enquiryUploads = sqliteTable("enquiry_uploads", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  rowsInFile: integer("rows_in_file").notNull(),
  rowsInserted: integer("rows_inserted").notNull(),
  rowsUpdated: integer("rows_updated").notNull(),
  rowsSkipped: integer("rows_skipped").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
});
