import { describe, it, expect } from "vitest";
import {
  BROKER_ENQUIRY_TO, MAILTO_MAX, buildEnquiryMailto, enquiryBody, enquirySubject,
  type EnquiryVehicle,
} from "./broker-enquiry";

const VEHICLE: EnquiryVehicle = {
  ref: "TF-2GG495H9",
  model: "Puma",
  variant: "ST-Line X",
  derivative: "Sport",
  bodyStyle: "Hatchback",
  engine: "1.0L EcoBoost 125PS",
  transmission: "Auto",
  drive: "FWD",
  colour: "Solar Silver",
  options: ["Winter Pack", "Panoramic roof"],
  availability: "Available now",
};
const SENDER = { name: "Dan Whitfield", brokerName: "Acme Vehicle Leasing" };
const decode = (mailto: string) =>
  decodeURIComponent(mailto.split("&body=")[1] ?? "");

describe("enquirySubject", () => {
  it("names the vehicle and carries the reference", () => {
    expect(enquirySubject("quote", VEHICLE)).toBe("Quote request — Puma ST-Line X Sport (TF-2GG495H9)");
    expect(enquirySubject("secure", VEHICLE)).toBe("SECURE — Puma ST-Line X Sport (TF-2GG495H9)");
  });
});

describe("enquiryBody", () => {
  it("always carries the reference — it is how we find the vehicle", () => {
    for (const kind of ["quote", "secure"] as const) {
      expect(enquiryBody(kind, VEHICLE)).toContain("TF-2GG495H9");
    }
  });

  it("asks a quote for the four figures and nothing else", () => {
    const b = enquiryBody("quote", VEHICLE);
    expect(b).toContain("Upfront (rentals in advance):");
    expect(b).toContain("Term (months):");
    expect(b).toContain("Annual mileage:");
    expect(b).toContain("Desired commission (+VAT):");
    expect(b).not.toContain("Rental sold at:");
  });

  it("asks a secure for the same four plus the rental it sold at", () => {
    const b = enquiryBody("secure", VEHICLE);
    expect(b).toContain("Upfront (rentals in advance):");
    expect(b).toContain("Term (months):");
    expect(b).toContain("Annual mileage:");
    expect(b).toContain("Commission (+VAT):");
    expect(b).toContain("Rental sold at:");
  });

  it("tells a secure it needs the finance proposal form, and a quote that it does not", () => {
    expect(enquiryBody("secure", VEHICLE)).toContain("full finance proposal form");
    expect(enquiryBody("quote", VEHICLE)).not.toContain("finance proposal");
  });

  it("carries the spec through", () => {
    const b = enquiryBody("quote", VEHICLE);
    for (const bit of ["Puma", "ST-Line X", "Hatchback", "1.0L EcoBoost 125PS", "Auto", "FWD", "Solar Silver", "Winter Pack", "Available now"]) {
      expect(b, `"${bit}" missing from the enquiry`).toContain(bit);
    }
  });

  it("omits a field that has no value rather than printing an empty label", () => {
    const b = enquiryBody("quote", { ref: "TF-ABCD2345", model: "Transit", options: [] });
    expect(b).not.toContain("Colour:");
    expect(b).not.toContain("Options:");
    expect(b).toContain("TF-ABCD2345");
  });
});

describe("buildEnquiryMailto", () => {
  it("addresses the broker desk and encodes the body", () => {
    const m = buildEnquiryMailto("quote", VEHICLE, SENDER);
    expect(m.startsWith(`mailto:${BROKER_ENQUIRY_TO}?subject=`)).toBe(true);
    expect(m).toContain("&body=");
    // Raw newlines and spaces would break the URL in some clients.
    expect(m).not.toContain("\n");
    expect(m).not.toContain(" ");
  });

  it("survives a round trip", () => {
    expect(decode(buildEnquiryMailto("secure", VEHICLE, SENDER))).toBe(enquiryBody("secure", VEHICLE, SENDER));
  });

  it("stays under the Outlook limit by trimming options, never the instructions", () => {
    // Outlook truncates silently, so the end of the body is what must never
    // be sacrificed — that is where the finance-proposal instruction lives.
    const many = { ...VEHICLE, options: Array.from({ length: 120 }, (_, i) => `Optional extra number ${i + 1}`) };
    const m = buildEnquiryMailto("secure", many, SENDER);
    expect(m.length).toBeLessThanOrEqual(MAILTO_MAX);
    const body = decode(m);
    expect(body).toContain("full finance proposal form");
    expect(body).toContain("Rental sold at:");
    expect(body).toContain("TF-2GG495H9");
    expect(body).toContain("…"); // says it was trimmed rather than pretending
  });

  it("leaves a short options list alone", () => {
    expect(decode(buildEnquiryMailto("quote", VEHICLE, SENDER))).toContain("Winter Pack, Panoramic roof");
  });
});
