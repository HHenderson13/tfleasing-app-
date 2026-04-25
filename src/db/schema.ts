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

export const vehicles = sqliteTable(
  "vehicles",
  {
    capCode: text("cap_code").primaryKey(),
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const PROPOSAL_STATUSES = [
  "proposal_received",
  "accepted",
  "declined",
  "referred_to_dealer",
  "referred_to_underwriter",
  "lost_sale",
  "in_order",
  "awaiting_delivery",
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
  vin: text("vin").primaryKey(),
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
  sourceSheet: text("source_sheet"),
  uploadId: text("upload_id").notNull(),
});

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
