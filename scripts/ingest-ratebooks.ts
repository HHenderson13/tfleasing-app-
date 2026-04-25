/**
 * One-off: ingest the four ratebook sheets from the Leasing Margins workbook
 * into the DB. Assumes `npx tsx scripts/seed.ts` has already run.
 *
 *   npx tsx scripts/ingest-ratebooks.ts "/path/to/Leasing Margins.xlsx"
 */
import * as XLSX from "xlsx";
import Database from "better-sqlite3";
import path from "node:path";

const xlsxPath = process.argv[2] ?? "/Users/harryhenderson/Downloads/Leasing Margins (1) (2).xlsx";
const db = new Database(path.resolve(process.cwd(), "data", "tf.db"));
db.pragma("journal_mode = WAL");

const wb = XLSX.readFile(xlsxPath);
const normCap = (s: string) => s.trim().replace(/\s+/g, " ");

// vehicles from Model_Data
const mdArr = XLSX.utils.sheet_to_json<any>(wb.Sheets["Model_Data"], { header: 1, defval: null });
const insVehicle = db.prepare(
  "INSERT OR REPLACE INTO vehicles (cap_code, model, derivative, is_van, list_price_net, discount_key) VALUES (?, ?, ?, ?, ?, ?)"
);
for (let r = 1; r < mdArr.length; r++) {
  const row = mdArr[r] ?? [];
  const capCode = row[0], price = row[1], model = row[2], derivative = row[3];
  if (typeof capCode === "string" && typeof model === "string" && typeof derivative === "string") {
    insVehicle.run(normCap(capCode), model.trim(), derivative.trim(), 0, typeof price === "number" ? price : null, null);
  }
}

const ensureVehicle = db.prepare("INSERT OR IGNORE INTO vehicles (cap_code, model, derivative, is_van) VALUES (?, ?, ?, ?)");
const insRate = db.prepare(`INSERT OR REPLACE INTO ratebook
  (funder_id, cap_code, initial_rental_multiplier, term_months, annual_mileage, is_business, is_maintained, monthly_rental, monthly_maintenance)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

db.exec("DELETE FROM ratebook");
let total = 0;
for (const { sheet, funderId } of [
  { sheet: "ALD", funderId: "ald" },
  { sheet: "Lex", funderId: "lex" },
  { sheet: "Novuna", funderId: "novuna" },
  { sheet: "Arval", funderId: "arval" },
]) {
  const arr = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet], { header: 1, defval: null });
  db.exec("BEGIN");
  for (let r = 1; r < arr.length; r++) {
    const row = arr[r] ?? [];
    const capCode = normCap(String(row[5] ?? ""));
    if (!capCode) continue;
    const isVan = row[3] === true;
    const annualMileage = +row[6];
    const irm = +row[7];
    const term = +row[8];
    const isBusiness = row[9] === true;
    const isMaintained = row[10] === true;
    const monthly = +row[11];
    const monthlyMaint = +(row[12] ?? 0);
    if (!Number.isFinite(monthly) || !term || !annualMileage) continue;
    ensureVehicle.run(capCode, "Unknown", capCode, isVan ? 1 : 0);
    insRate.run(funderId, capCode, irm, term, annualMileage, isBusiness ? 1 : 0, isMaintained ? 1 : 0, monthly, monthlyMaint);
    total++;
  }
  db.exec("COMMIT");
}
console.log(`ratebook rows: ${total}`);
console.log(`vehicles     : ${(db.prepare("SELECT COUNT(*) c FROM vehicles").get() as any).c}`);
