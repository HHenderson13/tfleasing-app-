import { describe, it, expect } from "vitest";
import { redactForBroker, type MappedStockRow } from "./stock-list";

// The broker payload is the security boundary. A field merely hidden in
// JSX still ships inside the server-rendered HTML, so redactForBroker is
// what actually keeps VINs, dealers and funding dates off the broker
// portal. These tests fail loudly if that leaks.

const FULL_ROW: MappedStockRow = {
  ref: "TF-2GG495H9",
  altRef: "TF-ALT12345",
  vin: "WF0AXXTTRAPY12345",
  bucket: "Puma",
  variant: "ST-Line X",
  derivative: "Sport",
  series: "ST-Line",
  modelYear: "MY24",
  bodyStyle: "Hatchback",
  engine: "1.0 EcoBoost 125ps",
  transmission: "Manual",
  drive: "FWD",
  colour: "Agate Black",
  options: ["Panoramic roof", "Winter pack"],
  orderNo: "ORD-99812",
  status: "In transit",
  gateRelease: "2026-06-01T00:00:00.000Z",
  eta: "2026-10-14T00:00:00.000Z",
  delivered: null,
  interestBearing: "2026-07-01T00:00:00.000Z",
  adopted: "2026-08-01T00:00:00.000Z",
  dealer: "TrustFord Enfield",
  destination: "Enfield",
  includedByRule: false,
  inStock: false,
};

// Every field a broker must never receive, and the value that would give
// it away if it ever appeared in the payload.
const FORBIDDEN_KEYS = [
  "vin", "orderNo", "dealer", "destination", "status",
  "modelYear", "gateRelease", "interestBearing", "adopted", "delivered",
  // How we classify our own stock is not a broker's business.
  "includedByRule",
  // A TF-side search key, not a handle a broker needs.
  "altRef",
] as const;

describe("redactForBroker", () => {
  it("drops every sensitive key from the object entirely", () => {
    const [row] = redactForBroker([FULL_ROW]);
    for (const key of FORBIDDEN_KEYS) {
      expect(row, `"${key}" must not survive redaction`).not.toHaveProperty(key);
    }
  });

  it("leaves no trace of a sensitive VALUE anywhere in the serialised payload", () => {
    // Serialising is what actually happens on the way to the browser, so
    // assert on the wire format rather than the object shape — this also
    // catches a sensitive value smuggled inside some other field.
    const json = JSON.stringify(redactForBroker([FULL_ROW]));
    for (const secret of ["WF0AXXTTRAPY12345", "ORD-99812", "TrustFord Enfield", "Enfield", "In transit", "MY24"]) {
      expect(json, `"${secret}" leaked into the broker payload`).not.toContain(secret);
    }
    // Funding dates specifically — "anything funding related" must be gone.
    expect(json).not.toContain("2026-07-01");
    expect(json).not.toContain("2026-08-01");
    // ...and so must the build milestone that back-doors the ageing figure.
    expect(json).not.toContain("2026-06-01");
  });

  it("keeps everything a broker is meant to see", () => {
    const [row] = redactForBroker([FULL_ROW]);
    expect(row).toEqual({
      ref: "TF-2GG495H9",
      bucket: "Puma",
      variant: "ST-Line X",
      derivative: "Sport",
      series: "ST-Line",
      bodyStyle: "Hatchback",
      engine: "1.0 EcoBoost 125ps",
      transmission: "Manual",
      drive: "FWD",
      colour: "Agate Black",
      options: ["Panoramic roof", "Winter pack"],
      eta: "2026-10-14T00:00:00.000Z",
      inStock: false,
    });
  });

  it("is an allow-list, so a new field added to the stock row is withheld until someone opts it in", () => {
    // The redaction builds a fresh object rather than deleting keys. That
    // way the failure mode of forgetting about redaction is a MISSING
    // field on the broker view — visible and harmless — instead of a
    // silent leak. This test documents that choice.
    const withNewSecret = { ...FULL_ROW, purchasePriceGbp: 24_500 } as MappedStockRow;
    const [row] = redactForBroker([withNewSecret]);
    expect(row).not.toHaveProperty("purchasePriceGbp");
  });

  it("carries the reference through, since it is the broker's only handle on a vehicle", () => {
    const rows = redactForBroker([FULL_ROW, { ...FULL_ROW, ref: "TF-ABCD2345", vin: "OTHER" }]);
    expect(rows.map((r) => r.ref)).toEqual(["TF-2GG495H9", "TF-ABCD2345"]);
  });

  it("preserves in-stock state, so availability works without shipping status", () => {
    const [here] = redactForBroker([{ ...FULL_ROW, inStock: true, status: "Delivered" }]);
    expect(here.inStock).toBe(true);
    expect(here).not.toHaveProperty("status");
  });

  it("withholds the arrival date even from a vehicle that is in stock", () => {
    // "In stock since 12 May" tells a broker how long we have been sitting
    // on it. inStock alone answers the only question they need answered.
    const [here] = redactForBroker([
      { ...FULL_ROW, inStock: true, status: "Delivered", delivered: "2026-05-12T00:00:00.000Z" },
    ]);
    expect(here).not.toHaveProperty("delivered");
    expect(JSON.stringify(here)).not.toContain("2026-05-12");
  });
});
