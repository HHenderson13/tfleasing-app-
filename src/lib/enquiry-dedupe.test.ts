import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";

// enquiries.ts pulls in `server-only` and the DB client; neither is needed
// for the pure parse path these tests exercise.
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ enquiryUploads: {} }));

const { parseEnquiryWorkbook } = await import("./enquiries");

// Build a MotorComplete-shaped sheet. Columns are positional, so only the
// ones the parser reads need real values.
function sheet(rows: Array<Partial<Record<string, unknown>> & {
  exec: string; customer: string; ref?: string | null;
  raised: string; transferred?: string | null; contacted?: string | null;
  lostSaleReason?: string | null;
}>) {
  const header = Array.from({ length: 29 }, (_, i) => `col${i}`);
  const body = rows.map((r) => {
    const a = new Array<unknown>(29).fill(null);
    a[0] = "TrustFord LCV Lease";
    a[1] = r.exec;          // B Created By
    a[2] = r.customer;      // C Customer
    a[3] = r.ref ?? null;   // D Customer Id
    a[4] = r.raised;        // E Date Raised
    a[11] = r.contacted ?? null;    // L first contact
    a[15] = r.transferred ?? null;  // P transferred
    a[29] = r.lostSaleReason ?? null; // AD Lost Sale Reason
    return a;
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ag-grid");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("duplicate rows inside one export", () => {
  it("collapses rows sharing a natural key, so the ingest cannot hit a PK clash", () => {
    // This is the shape that broke the real upload: MotorComplete listed the
    // same enquiry twice, once per touchpoint.
    const buf = sheet([
      { exec: "Douglas James", customer: "Malcolm Griffiths", ref: "26359360",
        raised: "17 August 2026 09:33", transferred: "17 August 2026 09:47",
        contacted: "17 August 2026 10:04" },
      { exec: "Douglas James", customer: "Malcolm Griffiths", ref: "26359360",
        raised: "17 August 2026 09:33", transferred: "17 August 2026 09:47",
        contacted: "17 August 2026 11:20" },
      { exec: "Helen Mort", customer: "Someone Else", ref: "999",
        raised: "17 August 2026 10:00" },
    ]);
    const p = parseEnquiryWorkbook(buf);

    expect(p.rows).toHaveLength(2);
    expect(p.duplicatesCollapsed).toBe(1);
    expect(new Set(p.rows.map((r) => r.id)).size).toBe(2);
  });

  it("keeps the LAST occurrence, matching the newest-wins merge rule", () => {
    const buf = sheet([
      { exec: "Douglas James", customer: "Malcolm Griffiths", ref: "26359360",
        raised: "17 August 2026 09:33", transferred: "17 August 2026 09:47",
        contacted: "17 August 2026 10:04" },
      { exec: "Douglas James", customer: "Malcolm Griffiths", ref: "26359360",
        raised: "17 August 2026 09:33", transferred: "17 August 2026 09:47",
        contacted: "17 August 2026 11:20" },
    ]);
    const [row] = parseEnquiryWorkbook(buf).rows;
    // 11:20 is the later of the two contact stamps.
    expect(row.contactedAt).toBe(Date.UTC(2026, 7, 17, 11, 20));
  });

  it("reports zero collapsed when every row is distinct", () => {
    const buf = sheet([
      { exec: "A Exec", customer: "Cust One", ref: "1", raised: "17 August 2026 09:00" },
      { exec: "A Exec", customer: "Cust Two", ref: "2", raised: "17 August 2026 09:00" },
    ]);
    const p = parseEnquiryWorkbook(buf);
    expect(p.rows).toHaveLength(2);
    expect(p.duplicatesCollapsed).toBe(0);
  });

  it("de-duplicates rows with no customer id by name + timestamp", () => {
    const buf = sheet([
      { exec: "A Exec", customer: "No Ref Person", raised: "17 August 2026 09:00" },
      { exec: "A Exec", customer: "No Ref Person", raised: "17 August 2026 09:00" },
    ]);
    const p = parseEnquiryWorkbook(buf);
    expect(p.rows).toHaveLength(1);
    expect(p.duplicatesCollapsed).toBe(1);
  });
});

// Opportunistic: if the operator's sample exports are present locally, hold
// them to the same guarantee. Skipped anywhere they are not.
const DL = "/Users/harryhenderson/Downloads";
const SAMPLES = [
  "export (23).xlsx", "export (24).xlsx", "export (25).xlsx",
  "export (26).xlsx", "export (27).xlsx", "export (28).xlsx",
].filter((f) => existsSync(`${DL}/${f}`));

describe.skipIf(SAMPLES.length === 0)("real sample exports", () => {
  it.each(SAMPLES)("%s parses to unique ids", (f) => {
    const p = parseEnquiryWorkbook(readFileSync(`${DL}/${f}`));
    expect(new Set(p.rows.map((r) => r.id)).size).toBe(p.rows.length);
  });
});

describe("Lost Sale Reason exclusion (column AD)", () => {
  const withReason = (reason: string | null) => sheet([
    { exec: "Douglas James", customer: "Merged Person", ref: "1",
      raised: "17 August 2026 09:00", lostSaleReason: reason },
    { exec: "Douglas James", customer: "Real Person", ref: "2",
      raised: "17 August 2026 09:00", lostSaleReason: "Unable to Contact" },
  ]);

  it("drops rows merged into an existing customer", () => {
    const p = parseEnquiryWorkbook(withReason("Lead Merged into Existing Customer"));
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].customer).toBe("Real Person");
    expect(p.skippedLostSaleReason).toBe(1);
  });

  it("matches regardless of case, spacing and punctuation drift", () => {
    for (const variant of [
      "lead merged into existing customer",
      "LEAD MERGED INTO EXISTING CUSTOMER",
      "  Lead  Merged   into Existing Customer  ",
      "Lead-Merged into Existing Customer",
    ]) {
      expect(parseEnquiryWorkbook(withReason(variant)).skippedLostSaleReason).toBe(1);
    }
  });

  it("leaves every other lost-sale reason alone", () => {
    for (const keep of [
      "Unable to Contact", "Bought elsewhere", "Duplicate",
      "Other Future purchase", "Unable To Get Finance", null,
    ]) {
      const p = parseEnquiryWorkbook(withReason(keep));
      expect(p.rows).toHaveLength(2);
      expect(p.skippedLostSaleReason).toBe(0);
    }
  });

  it("reports the excluded row's id so ingest can delete a stored copy", () => {
    const p = parseEnquiryWorkbook(withReason("Lead Merged into Existing Customer"));
    expect(p.excludedIds).toHaveLength(1);
    // The id must match what the surviving-row path would have produced,
    // otherwise the retroactive delete would miss.
    const same = parseEnquiryWorkbook(withReason("Unable to Contact"));
    const mergedRow = same.rows.find((r) => r.customer === "Merged Person")!;
    expect(p.excludedIds[0]).toBe(mergedRow.id);
  });
});
