import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  NotAnEnquiryLogError,
  isExcludedExec,
  makeEnquiryKey,
  outcomeOf,
  parseFirstContact,
  parseTenAtTenWorkbook,
  sourceName,
  vehicleOf,
} from "./ten-at-ten";

const HEADER = ["Date Time", "SE", "Dealer Location", "Customer", "Source", "NU", "Model", "First Contact Type",
  "First Contact Details", "Last Contact Type", "Last Contact Details", "Next Contact Date", "Next Contact Type",
  "IDD Seen", "IDD Sent", "Strength", "Status"];

function line(at: string, se: string, customer: string, source: string, model: string, status: string, details = ""): unknown[] {
  const r: unknown[] = new Array(17).fill(null);
  r[0] = at; r[1] = se; r[3] = customer; r[4] = source; r[6] = model; r[8] = details; r[16] = status;
  return r;
}

function workbook(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "ag-grid");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("sources", () => {
  it("names the four MotorComplete feeds and groups the rest as Broker / Prospect", () => {
    expect(sourceName("MotorComplete - carwow")).toBe("CarWow");
    expect(sourceName("MotorComplete - LeaseLoco")).toBe("LeaseLoco");
    expect(sourceName("MotorComplete - Leasing.com")).toBe("Leasing.com");
    expect(sourceName("MotorComplete Lead")).toBe("TF Lead");
    expect(sourceName(" motorcomplete  lead ")).toBe("TF Lead");
    for (const other of ["Customer", "Broker Introduction", "FR Website", "FRoLLeasing.com", "TF.co.uk", ""]) {
      expect(sourceName(other)).toBe("Broker / Prospect");
    }
  });
});

describe("status", () => {
  it("counts Ordered, Delivered and Handover Arranged as orders", () => {
    expect(outcomeOf("Ordered")).toBe("order");
    expect(outcomeOf("Delivered")).toBe("order");
    expect(outcomeOf("Handover Arranged")).toBe("order");
    expect(outcomeOf("Live")).toBe("live");
    expect(outcomeOf("Lost Sale")).toBe("lost");
    expect(outcomeOf("")).toBe("other");
  });
});

describe("excluded execs", () => {
  it("strips HaHe and JoRu whatever the case or spacing", () => {
    expect(isExcludedExec("HaHe")).toBe(true);
    expect(isExcludedExec(" joru ")).toBe(true);
    expect(isExcludedExec("DoJa")).toBe(false);
  });
});

describe("vehicle", () => {
  it("reads the model, and keeps the derivative only when it says more", () => {
    expect(vehicleOf("Ford Ranger Pick Up Double Cab XLT 3.0 EcoBlue V6 240 Auto")).toMatchObject({
      model: "Ranger", derivative: "Ford Ranger Pick Up Double Cab XLT 3.0 EcoBlue V6 240 Auto",
    });
    expect(vehicleOf("Ford Capri 140kW Style 58kWh 5dr Auto").model).toBe("Capri");
    expect(vehicleOf("Ford Explorer EV")).toEqual({ model: "Explorer", derivative: null, derivativeKey: null });
    expect(vehicleOf("Ford E-Transit Custom ").model).toBe("Transit E-Custom");
    expect(vehicleOf("Ford Transit Custom E- 320 L1 Electric RWD 100KW 71KWH H1 Van Trend Auto").model).toBe("Transit E-Custom");
    expect(vehicleOf("Ford Transit Custom 320 L1 Diesel Fwd 2.0 EcoBlue 136ps H1 Van Limited").model).toBe("Transit Custom");
    expect(vehicleOf("Ford Puma 124kW Premium 47kWh 5dr Auto").model).toBe("Puma Gen-E");
    expect(vehicleOf("Ford Puma 1.0 EcoBoost Hybrid mHEV ST-Line X 5dr").model).toBe("Puma");
    expect(vehicleOf("Ford Explorer Electric 210KW 79KWH Select Van Auto").model).toBe("Explorer Van");
    expect(vehicleOf("Mach E AWD").model).toBe("Mustang Mach-E");
    expect(vehicleOf("Ford").model).toBe("Not specified");
    expect(vehicleOf("  n").model).toBe("Not specified");
  });

  it("groups differently-typed spellings of one derivative", () => {
    const key = (v: string) => vehicleOf(v).derivativeKey;
    expect(key("Ford Ranger Diesel Pick Up Double Cab XLT 3.0 EcoBlue V6 240 Auto"))
      .toBe(key("Ford Ranger Pick Up Double Cab XLT 3.0 EcoBlue V6 240 Auto"));
    expect(key("Ford Ranger Petrol Pick UP D/Cab Platinum 2.3 Ecoboost Phev 281 Auto"))
      .toBe(key("Ford Ranger Pick Up D/Cab Platinum 2.3 EcoBoost PHEV 281 Auto"));
    expect(key("Ford Explorer Estate 140kW Style 58kWh 5dr Auto")).toBe(key("Ford Explorer 140kW Style 58kWh 5dr Auto"));
    expect(key("Ford Transit Custom E- 320 L1 Electric RWD 100KW 71KWH H1 Van Trend Auto"))
      .toBe(key("Ford E-Transit Custom 320 L1 Electric Rwd 100kW 71kWh H1 Van Trend Auto"));
    // A pack is a different vehicle.
    expect(key("Ford Explorer 140kW Style 58kWh 5dr Auto [Comfort Pack]")).not.toBe(key("Ford Explorer 140kW Style 58kWh 5dr Auto"));
  });
});

describe("first contact details", () => {
  it("reads finance type, term and mileage, tolerating truncation", () => {
    const block = "Monthly rental: 255.00. \nFunder: . \nFinance type: Business Contract Hire. \nInitial payment: 12. \nContract length: 24. \nAnnual mileage: 6000. \nMaintenance: No.";
    expect(parseFirstContact(block)).toEqual({ financeType: "Business", termMonths: 24, annualMileage: 6000 });
    expect(parseFirstContact("Finance type: Personal. \nContract length: 2. ").financeType).toBe("Personal");
    expect(parseFirstContact("Finance type: Bu").financeType).toBe("Business");
    expect(parseFirstContact("Contract length: 2. ").termMonths).toBeNull();
    expect(parseFirstContact("First contact")).toEqual({ financeType: null, termMonths: null, annualMileage: null });
  });
});

describe("parseTenAtTenWorkbook", () => {
  it("keys an enquiry on time, customer and source — not the exec", () => {
    expect(makeEnquiryKey(1, "Mr Paul Burns", "MotorComplete - carwow")).toBe(makeEnquiryKey(1, " mr paul  burns ", "MotorComplete - carwow"));
    expect(makeEnquiryKey(1, "A", "MotorComplete Lead")).not.toBe(makeEnquiryKey(1, "A", "MotorComplete - carwow"));
  });

  it("collapses a repeated line, keeping the one furthest along", () => {
    // September 2026: Paul Burns appears twice in the same minute, once Lost
    // Sale and once Ordered. The order must survive.
    const { rows, duplicatesCollapsed } = parseTenAtTenWorkbook(workbook([
      HEADER,
      line("20 September 2026 16:08", "MiHo", "Mr Paul Burns", "MotorComplete - carwow", "Ford Explorer 140kW Premium 58kWh 5dr Auto", "Ordered"),
      line("20 September 2026 16:08", "MiHo", "Mr Paul Burns", "MotorComplete - carwow", "Ford Explorer 140kW Premium 58kWh 5dr Auto", "Lost Sale"),
    ]));
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("order");
    expect(duplicatesCollapsed).toBe(1);
  });

  it("strips HaHe and JoRu and reports their keys for removal", () => {
    const p = parseTenAtTenWorkbook(workbook([
      HEADER,
      line("1 October 2026 09:00", "HaHe", "Dup One", "MotorComplete Lead", "Ford Ranger", "Lost Sale"),
      line("1 October 2026 09:05", "JoRu", "Dup Two", "Customer", "Ford Capri", "Live"),
      line("1 October 2026 09:10", "DoJa", "Real Person", "MotorComplete - Leasing.com", "Ford Capri", "Live"),
    ]));
    expect(p.rows.map((r) => r.exec)).toEqual(["DoJa"]);
    expect(p.skippedExcluded).toBe(2);
    expect(p.excludedIds).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ source: "Leasing.com", model: "Capri", enquiryDay: "2026-10-01", outcome: "live" });
  });

  it("refuses a file with a different column layout", () => {
    expect(() => parseTenAtTenWorkbook(workbook([["Status", "SE", "Sales Type", "Customer", "Order Date"], ["R", "DoJa"]])))
      .toThrow(NotAnEnquiryLogError);
  });
});
