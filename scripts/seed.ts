/**
 * Seed funders, commissions, and discounts. Idempotent — safe to re-run.
 * Does NOT touch ratebook rows (those come from admin uploads or ingest-ratebooks).
 *
 *   npx tsx scripts/seed.ts
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data", "tf.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Apply migration if tables don't exist
const migrationFile = fs.readdirSync(path.resolve(process.cwd(), "drizzle")).find((f) => f.endsWith(".sql"))!;
const sql = fs.readFileSync(path.resolve(process.cwd(), "drizzle", migrationFile), "utf8");
for (const stmt of sql.split("--> statement-breakpoint")) {
  const s = stmt.trim();
  if (s) {
    try { db.exec(s); } catch (e: any) { if (!/already exists/.test(e.message)) throw e; }
  }
}

// Reseed reference tables (not ratebook, not vehicles)
db.exec("DELETE FROM funder_commission");
db.exec("DELETE FROM funders");
db.exec("DELETE FROM model_discounts");

// Funders
const funders = [
  { id: "ald", name: "ALD" },
  { id: "novuna", name: "Novuna" },
  { id: "lex", name: "Lex" },
  { id: "arval", name: "Arval" },
];
const insF = db.prepare("INSERT INTO funders (id, name) VALUES (?, ?)");
for (const f of funders) insF.run(f.id, f.name);

// Commissions (user-specified):
//   ALD: £425 across everything
//   Novuna: PCH £750, BCH £0
//   Arval: £500 across everything
//   Lex: BCH £0, PCH Customer Maintained £650, PCH Maintained £850
const comm: Array<[string, "PCH" | "BCH", "customer" | "maintained", number]> = [
  ["ald", "PCH", "customer", 425], ["ald", "PCH", "maintained", 425],
  ["ald", "BCH", "customer", 425], ["ald", "BCH", "maintained", 425],
  ["novuna", "PCH", "customer", 750], ["novuna", "PCH", "maintained", 750],
  ["novuna", "BCH", "customer", 0],   ["novuna", "BCH", "maintained", 0],
  ["arval", "PCH", "customer", 500], ["arval", "PCH", "maintained", 500],
  ["arval", "BCH", "customer", 500], ["arval", "BCH", "maintained", 500],
  ["lex", "PCH", "customer", 650],   ["lex", "PCH", "maintained", 850],
  ["lex", "BCH", "customer", 0],     ["lex", "BCH", "maintained", 0],
];
const insC = db.prepare("INSERT INTO funder_commission (funder_id, contract, maintenance, commission_gbp) VALUES (?, ?, ?, ?)");
for (const c of comm) insC.run(...c);

// Discounts from the Leasing Margins PDF (2026-04).
type D = {
  id: string;
  label: string;
  trim?: string;
  termsPct: number;
  dealerPct: number;
  grant?: string;
  saving?: number;
};
const discounts: D[] = [
  { id: "puma-gen-e-select", label: "Puma Gen-E Select", termsPct: 0.14, dealerPct: 0.06, grant: "£3,750 PiVG Grant", saving: 416.67 },
  { id: "puma-gen-e-premium", label: "Puma Gen-E Premium / Blue Cruise", termsPct: 0.16, dealerPct: 0.06, grant: "£3,750 PiVG Grant", saving: 416.67 },
  { id: "explorer-old-my", label: "Explorer Pre 26.75MY (Old MY)", termsPct: 0.33, dealerPct: 0.06, grant: "£1,250 +VAT", saving: 416.67 },
  { id: "capri-old-my", label: "Capri Pre 26.75MY (Old MY)", termsPct: 0.33, dealerPct: 0.06, grant: "£1,250 +VAT", saving: 416.67 },
  { id: "explorer-new-my-std", label: "Explorer 26.75MY (New MY) Style, Select & Premium Std Range", termsPct: 0.26, dealerPct: 0.06, grant: "£1,500 PiVG Grant NO VAT", saving: 416.67 },
  { id: "capri-new-my-std", label: "Capri 26.75MY (New MY) Style & Premium Std Range", termsPct: 0.26, dealerPct: 0.06, grant: "£1,500 PiVG Grant NO VAT", saving: 416.67 },
  { id: "explorer-new-my-ext", label: "Explorer 26.75MY (New MY) Premium Ext Range, Collection Edition", termsPct: 0.29, dealerPct: 0.06, saving: 416.67 },
  { id: "capri-new-my-ext", label: "Capri 26.75MY (New MY) Select, Premium Ext Range, Collection Edition", termsPct: 0.29, dealerPct: 0.06, saving: 416.67 },
  { id: "mach-e-select", label: "Mach-E Select", termsPct: 0.40, dealerPct: 0.06, saving: 416.67 },
  { id: "mach-e-premium-gt", label: "Mach-E Premium & GT", termsPct: 0.28, dealerPct: 0.06, saving: 416.67 },
  { id: "puma-ice", label: "Puma ICE", termsPct: 0.21, dealerPct: 0.015 },
  { id: "puma-st", label: "Puma ST", termsPct: 0.04, dealerPct: 0.015 },
  { id: "kuga-phev", label: "Kuga PHEV", termsPct: 0.315, dealerPct: 0.01 },
  { id: "kuga-ice-fhev", label: "Kuga ICE & FHEV", termsPct: 0.21, dealerPct: 0.015 },
  { id: "focus", label: "Focus", termsPct: 0.275, dealerPct: 0.015 },
  { id: "focus-st", label: "Focus ST", termsPct: 0.04, dealerPct: 0.015 },
  { id: "e-transit-courier", label: "E-Transit Courier", termsPct: 0.15, dealerPct: 0.084, grant: "£2,500 OLEV Grant", saving: 3000 },
  { id: "e-transit-custom", label: "E-Transit Custom", termsPct: 0.19, dealerPct: 0.11, grant: "£5,000 OLEV Grant", saving: 3000 },
  { id: "e-transit-custom-ms-rt", label: "E-Transit Custom MS-RT", termsPct: 0.075, dealerPct: 0.11, grant: "£5,000 OLEV Grant", saving: 3000 },
  { id: "e-transit", label: "E-Transit", termsPct: 0.13, dealerPct: 0.102, grant: "£5,000 OLEV Grant", saving: 3000 },
  { id: "transit-courier-ice", label: "Transit Courier ICE", termsPct: 0.025, dealerPct: 0.1075 },
  { id: "transit-connect-ice", label: "Transit Connect ICE", termsPct: 0.10, dealerPct: 0.1075 },
  { id: "transit-connect-phev-l1", label: "Transit Connect PHEV L1", termsPct: 0.075, dealerPct: 0.0965 },
  { id: "transit-connect-phev-l2", label: "Transit Connect PHEV L2", termsPct: 0.05, dealerPct: 0.0965 },
  { id: "transit-custom-ice-ltts", label: "Transit Custom ICE — Van, Multicab & Kombi (Leader, Trend, Trail & Sport)", termsPct: 0.205, dealerPct: 0.1275 },
  { id: "transit-custom-ice-limited", label: "Transit Custom ICE — Van, Multicab & Kombi (Limited)", termsPct: 0.2275, dealerPct: 0.1275 },
  { id: "transit-custom-phev", label: "Transit Custom PHEV (Ex DCiV)", termsPct: 0.16, dealerPct: 0.1275 },
  { id: "transit-custom-dciv", label: "Transit Custom DCiV — ICE & PHEV", termsPct: 0.125, dealerPct: 0.1275 },
  { id: "transit-custom-ms-rt-phev", label: "Transit Custom MS-RT PHEV", termsPct: 0.075, dealerPct: 0.1275 },
  { id: "transit-custom-ms-rt-ice", label: "Transit Custom MS-RT ICE", termsPct: 0.105, dealerPct: 0.1275 },
  { id: "ranger-phev-top", label: "Ranger PHEV (Wildtrak, Platinum & Stormtrak)", termsPct: 0.18, dealerPct: 0.0975 },
  { id: "ranger-phev-xlt-ltd", label: "Ranger PHEV (XLT & Limited)", termsPct: 0.12, dealerPct: 0.0975 },
  { id: "ranger-2-0l", label: "Ranger 2.0L", termsPct: 0.10, dealerPct: 0.0975 },
  { id: "ranger-3-0l", label: "Ranger 3.0L", termsPct: 0.12, dealerPct: 0.0975 },
  { id: "ranger-ms-rt", label: "Ranger MS-RT", termsPct: 0.12, dealerPct: 0.0975 },
  { id: "ranger-raptor", label: "Ranger Raptor", termsPct: 0.08, dealerPct: 0.0975 },
  { id: "transit-van", label: "Transit Van", termsPct: 0.22, dealerPct: 0.122 },
  { id: "transit-minibus", label: "Transit Minibus", termsPct: 0.25, dealerPct: 0.122 },
];
const insD = db.prepare(`INSERT INTO model_discounts
  (id, label, trim_note, terms_pct, dealer_pct, grant_text, customer_saving_gbp, notes, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
discounts.forEach((d, i) => insD.run(d.id, d.label, d.trim ?? null, d.termsPct, d.dealerPct, d.grant ?? null, d.saving ?? null, null, i));

console.log("Seed complete:");
console.log("  funders         :", db.prepare("SELECT COUNT(*) c FROM funders").get());
console.log("  commissions     :", db.prepare("SELECT COUNT(*) c FROM funder_commission").get());
console.log("  model_discounts :", db.prepare("SELECT COUNT(*) c FROM model_discounts").get());
