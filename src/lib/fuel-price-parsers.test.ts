import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  desnzWeeklyCsvUrl, octopusOffPeak, parseDesnzNonDomestic, parseDesnzWeeklyCsv, parseOfgemCap, parseZapmap,
} from "./fuel-price-parsers";

// Fixtures cut from the real sources on 14 Oct 2026.

describe("DESNZ weekly road fuel prices", () => {
  it("finds the current-series CSV in the gov.uk record", () => {
    expect(desnzWeeklyCsvUrl({ details: { attachments: [
      { title: "Weekly road fuel prices (Excel)", url: "https://x/Weekly.xlsx", content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { title: "Weekly road fuel prices (CSV) 2018 to 2026", url: "https://x/CSV__2018_-__.csv", content_type: "text/csv" },
      { title: "Weekly road fuel prices (CSV) 2003 to 2017", url: "https://x/old.csv", content_type: "text/csv" },
    ] } })).toBe("https://x/CSV__2018_-__.csv");
  });

  it("reads the latest week", () => {
    const csv = "﻿Date,ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre,ULSD (Ultra low sulphur diesel) Pump price in pence/litre,ULSP Duty,ULSD Duty,ULSP VAT,ULSD VAT\n"
      + "05/10/2026,174.88,199.52,52.95,52.95,20,20\n12/10/2026,175.28,200.04,52.95,52.95,20,20\n\n";
    expect(parseDesnzWeeklyCsv(csv)).toEqual({ asOf: "2026-10-12", petrol: 175.28, diesel: 200.04 });
    expect(parseDesnzWeeklyCsv("Date,Something,Else\n12/10/2026,1,2")).toBeNull();
  });
});

describe("Ofgem price cap", () => {
  const html = `<h2>Energy price cap per unit and standing charge</h2><table><tr><th>Energy price cap per unit and standing charge 1 July to 30 September 2026</th>
    <th>Energy price cap per unit and standing charge 1 October to 31 December 2026</th></tr>
    <tr><td>Electricity</td><td>26.11 pence per kWh<br>57.19 pence daily standing charge</td><td>26.32 pence per kWh<br>54.83 pence daily standing charge</td></tr>
    <tr><td>Gas</td><td>7.33 pence per kWh 29.04 pence daily standing charge</td><td>7.97 pence per kWh 29.68 pence daily standing charge</td></tr></table>`;

  it("takes the period in force today", () => {
    expect(parseOfgemCap(html, "2026-10-14")).toEqual({ value: 26.32, period: "1 October to 31 December 2026", asOf: "2026-10-01" });
    expect(parseOfgemCap(html, "2026-08-20")).toMatchObject({ value: 26.11, asOf: "2026-07-01" });
  });

  it("handles a period running into the next year", () => {
    const winter = html.replace(/1 July to 30 September 2026/, "1 January to 31 March 2027").replace(/1 October to 31 December 2026/, "1 December to 28 February 2027");
    expect(parseOfgemCap(winter, "2027-01-10")).toMatchObject({ asOf: "2026-12-01" });
  });

  it("gives up rather than guessing on a page it doesn't recognise", () => {
    expect(parseOfgemCap("<p>Prices are changing</p>", "2026-10-14")).toBeNull();
  });
});

describe("Octopus Go off-peak", () => {
  it("is the cheapest slot in force", () => {
    const rates = [
      { value_inc_vat: 29.6946, valid_from: "2026-10-14T04:30:00Z", valid_to: "2026-10-14T23:30:00Z" },
      { value_inc_vat: 8.2143, valid_from: "2026-10-13T23:30:00Z", valid_to: "2026-10-14T04:30:00Z" },
      { value_inc_vat: 4.5, valid_from: "2024-01-01T00:00:00Z", valid_to: "2024-02-01T00:00:00Z" }, // long gone
    ];
    expect(octopusOffPeak(rates, "2026-10-14T09:00:00Z")).toBe(8.2143);
    expect(octopusOffPeak([], "2026-10-14T09:00:00Z")).toBeNull();
  });
});

describe("DESNZ non-domestic electricity", () => {
  it("reads the latest quarter's Small price, incl. CCL", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Table 3.4.2 Prices of fuels purchased by non-domestic consumers (including the Climate Change Levy) (Quarterly)"],
      ["Year", "Quarter", "Electricity: Very Small (Pence per kWh)", "Electricity: Small (Pence per kWh)", "Electricity: Medium (Pence per kWh)"],
      [2026, "1st", 35.02, 28.7554, 24.99],
      ["2026 p", "2nd", 38.36, 28.588760398, 25.16],
    ]), "3.4.2 (incl CCL)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Year", "Electricity: Small (Pence per kWh)"], [2025, 99]]), "3.4.2 (Annual inc CCL)");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(parseDesnzNonDomestic(buf)).toEqual({ value: 28.59, asOf: "2026-04-01", period: "Q2 2026" });
  });
});

describe("Zapmap Price Index", () => {
  it("reads the Rapid / Ultra-rapid PAYG price and its month", () => {
    const html = "<p>Updated 07/10/2026</p><p>As of September 2026, the weighted average PAYG price to charge an EV on the UK public network is 54p/kWh for Standard and Standard Plus chargers, and 79p/kWh for Rapid and Ultra-rapid chargers, according to Zapmap's monthly Price Index.</p>";
    expect(parseZapmap(html)).toEqual({ value: 79, month: "September 2026", asOf: "2026-09-01" });
    expect(parseZapmap("<p>No index this month</p>")).toBeNull();
  });
});
