import { describe, expect, it } from "vitest";
import {
  DATA_KEYS, KINDS, PX_FIELDS, SECTIONS, addDays, callbackOf, cleanPatch, crmText, dayWord, fieldsShown, fmtDate, fmtTime, fuelPrefillOf, hintOf,
  isRanger, isVanModel, labelOf, matchEvModel, nextContactText, optionsOf, progressOf, promptsOf, pxEquity, pxText, rangerPrefillOf, sectionsFor, sortLive,
  titleOf, ukNow, urgencyOf, type ProfileData,
} from "./customer-profiles";

const NOW = "2026-11-04T14:05"; // a Wednesday afternoon
const TODAY = NOW.slice(0, 10);

describe("the sections", () => {
  it("never reuses an answer's key", () => {
    const ids = [...SECTIONS.flatMap((s) => s.fields.map((f) => f.id)), ...PX_FIELDS.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(DATA_KEYS.has("heat")).toBe(true);
  });

  it("only waits on answers that exist, with values that can be picked", () => {
    for (const s of SECTIONS) for (const f of s.fields) {
      if (!f.showIf) continue;
      const on = s.fields.find((x) => x.id === f.showIf!.field);
      expect(on, `${f.id} waits on ${f.showIf.field}`).toBeDefined();
      for (const k of KINDS) {
        if (f.kinds && !f.kinds.includes(k)) continue;
        expect(optionsOf(on!, k)).toContain(f.showIf.is);
      }
    }
  });

  it("gives every field shown to a kind a label, and every choice options", () => {
    for (const k of KINDS) for (const s of sectionsFor(k)) {
      expect(titleOf(s, k)).not.toBe("");
      for (const f of s.fields.filter((x) => !x.kinds || x.kinds.includes(k))) {
        expect(labelOf(f, k), `${s.id}.${f.id} for ${k}`).not.toBe("");
        expect(labelOf(f, k)).not.toContain("{v}");
        if (f.type === "choice" || f.type === "multi") expect(optionsOf(f, k).length, `${f.id} for ${k}`).toBeGreaterThan(1);
      }
    }
  });

  it("follows the three call guides: business gets the fleet and decision sections, vans the accessories", () => {
    const ids = (k: (typeof KINDS)[number]) => sectionsFor(k).map((s) => s.id);
    expect(ids("personal")).toEqual(["next", "vehicle", "why", "needs", "current", "terms", "search", "close", "followup", "insight", "notes"]);
    expect(ids("business_car")).toEqual(["next", "vehicle", "why", "business", "needs", "current", "terms", "decision", "search", "close", "followup", "insight", "notes"]);
    expect(ids("business_van")).toEqual(["next", "vehicle", "why", "business", "needs", "spec", "current", "terms", "decision", "search", "close", "followup", "insight", "notes"]);
    const vehicle = SECTIONS.find((s) => s.id === "vehicle")!;
    expect(titleOf(vehicle, "business_van")).toBe("The van");
    expect(labelOf(vehicle.fields[1], "personal")).toBe("Exact car, or open to similar?");
  });

  it("hides a follow-on question until it's needed", () => {
    const vehicle = SECTIONS.find((s) => s.id === "vehicle")!;
    expect(fieldsShown(vehicle, "personal", {}).map((f) => f.id)).not.toContain("openIf");
    expect(fieldsShown(vehicle, "personal", { exact: "Open to similar" }).map((f) => f.id)).toContain("openIf");
    const needs = SECTIONS.find((s) => s.id === "needs")!;
    expect(fieldsShown(needs, "business_van", { fuel: ["Diesel"] }).map((f) => f.id)).not.toContain("charging");
    expect(fieldsShown(needs, "business_van", { fuel: ["Diesel", "Electric"] }).map((f) => f.id)).toContain("charging");
  });

  it("has no em or en dashes anywhere an exec reads", () => {
    const text: string[] = [];
    for (const k of KINDS) for (const s of sectionsFor(k)) {
      text.push(titleOf(s, k), hintOf(s, k) ?? "", ...promptsOf(s, k));
      for (const f of s.fields) text.push(labelOf(f, k), ...optionsOf(f, k));
    }
    for (const f of PX_FIELDS) text.push(labelOf(f, "personal"), ...optionsOf(f, "personal"));
    expect(text.join(" ")).not.toMatch(/[–—]/);
  });
});

describe("dates and times", () => {
  it("reads UK wall-clock time either side of the clock change", () => {
    expect(ukNow(new Date("2026-07-01T12:00:00Z"))).toBe("2026-07-01T13:00"); // BST
    expect(ukNow(new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01T12:00"); // GMT
    expect(ukNow(new Date("2026-11-04T23:30:00Z"))).toBe("2026-11-04T23:30");
  });

  it("writes times and dates the way people say them", () => {
    expect(fmtTime("14:30")).toBe("2:30pm");
    expect(fmtTime("09:00")).toBe("9am");
    expect(fmtTime("12:00")).toBe("12pm");
    expect(fmtTime("00:15")).toBe("12:15am");
    expect(fmtDate("2026-11-06", TODAY)).toBe("Fri 6 Nov");
    expect(fmtDate("2027-01-15", TODAY)).toBe("Fri 15 Jan 2027");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayWord("2026-11-05", TODAY)).toBe("tomorrow");
    expect(dayWord("2026-11-03", TODAY)).toBe("yesterday");
    expect(dayWord("2026-11-09", TODAY)).toBe("Mon 9 Nov");
  });
});

describe("what to work on first", () => {
  it("puts a missed next contact first, then today's, then hot, then nothing booked, then booked, then cold", () => {
    expect(urgencyOf({ contactBy: "Call", callbackDate: "2026-11-03", callbackTime: "10:00" }, NOW)).toMatchObject({ tier: 0, label: "Overdue", detail: "Call was due yesterday, 10am" });
    expect(urgencyOf({ callbackDate: TODAY, callbackTime: "10:30" }, NOW)).toMatchObject({ tier: 0, detail: "Contact was due 10:30am" });
    expect(urgencyOf({ callbackDate: TODAY, callbackTime: "14:05" }, NOW).tier).toBe(0); // due this minute
    expect(urgencyOf({ contactBy: "Text", callbackDate: TODAY, callbackTime: "16:00" }, NOW)).toMatchObject({ tier: 1, label: "Due today", detail: "Text at 4pm" });
    expect(urgencyOf({ contactBy: "Call", callbackDate: TODAY }, NOW)).toMatchObject({ tier: 1, detail: "Call any time today" });
    expect(urgencyOf({ heat: "Hot" }, NOW)).toMatchObject({ tier: 2, detail: "Nothing booked" });
    expect(urgencyOf({ heat: "Hot", contactBy: "Call", callbackDate: "2026-11-05", callbackTime: "09:00" }, NOW)).toMatchObject({ tier: 2, detail: "Call tomorrow, 9am" });
    expect(urgencyOf({}, NOW)).toMatchObject({ tier: 3, label: "Nothing booked" });
    // How on its own isn't an agreed contact: it needs a day.
    expect(urgencyOf({ contactBy: "Call" }, NOW).tier).toBe(3);
    expect(urgencyOf({ heat: "Warm", contactBy: "Email", callbackDate: "2026-11-09" }, NOW)).toMatchObject({ tier: 4, label: "Email Mon 9 Nov" });
    expect(urgencyOf({ heat: "Cold", callbackDate: "2026-11-09" }, NOW)).toMatchObject({ tier: 5 });
    // A call back is a promise: due beats cold.
    expect(urgencyOf({ heat: "Cold", callbackDate: "2026-11-02" }, NOW).tier).toBe(0);
  });

  it("ignores a call back that isn't a real date", () => {
    expect(callbackOf({ callbackDate: "next week" })).toBeNull();
    expect(callbackOf({ callbackDate: "2026-11-05", callbackTime: "9" })).toEqual({ date: "2026-11-05", time: null });
  });

  it("sorts most important first, soonest call back next, then newest", () => {
    const row = (name: string, data: ProfileData, createdAt = 1) => ({ name, data, createdAt });
    const sorted = sortLive([
      row("cold", { heat: "Cold" }),
      row("booked later", { callbackDate: "2026-11-10" }),
      row("booked sooner", { callbackDate: "2026-11-06", callbackTime: "11:00" }),
      row("nothing booked, old", {}, 100),
      row("nothing booked, new", {}, 200),
      row("hot", { heat: "Hot" }),
      row("today 4pm", { callbackDate: TODAY, callbackTime: "16:00" }),
      row("today 3pm", { callbackDate: TODAY, callbackTime: "15:00" }),
      row("overdue yesterday", { callbackDate: "2026-11-03", callbackTime: "09:00" }),
      row("overdue last week", { callbackDate: "2026-10-28" }),
    ], NOW);
    expect(sorted.map((r) => r.name)).toEqual([
      "overdue last week", "overdue yesterday", "today 3pm", "today 4pm", "hot", "nothing booked, new", "nothing booked, old", "booked sooner", "booked later", "cold",
    ]);
  });

  it("measures progress over the questions shown, leaving out the free notes", () => {
    expect(progressOf("personal", {}).pct).toBe(0);
    const p = progressOf("personal", { derivative: "Titanium", exact: "Exact", otherNotes: "hello" });
    expect(p.answered).toBe(2);
    expect(p.total).toBeGreaterThan(30);
    expect(progressOf("personal", { exact: "Open to similar" }).total).toBe(progressOf("personal", {}).total + 1);
  });
});

describe("copy for the CRM", () => {
  const data: ProfileData = {
    heat: "Hot",
    derivative: "Titanium X 2.5 PHEV",
    exact: "Open to similar",
    openIf: ["Better availability", "Lower rental"],
    onlineTerms: "Yes",
    upfront: "3000",
    term: "48",
    mileage: "10000",
    rental: "389.5",
    callbackDate: "2026-11-06",
    callbackTime: "14:30",
    contactBy: "Text",
    insight: "Family and personal: two kids, dog\nHot buttons: towing",
  };

  it("leaves out what the CRM already has and reads like notes", () => {
    const t = crmText({ kind: "personal", data, today: TODAY });
    expect(t).toBe([
      "Agreed next contact: Text, Fri 6 Nov at 2:30pm",
      "",
      "The car",
      "Derivative they enquired on: Titanium X 2.5 PHEV",
      "Exact car, or open to similar? Open to similar",
      "Open to similar for: Better availability, Lower rental",
      "Picked upfront, term and mileage online? Yes",
      "",
      "Quote terms",
      "Upfront they saw: £3,000",
      "Term: 48 months",
      "Annual mileage: 10,000 miles a year",
      "",
      "Availability and price",
      "Rental on their terms: £389.50 a month",
      "",
      "Customer insight",
      "Family and personal: two kids, dog\nHot buttons: towing",
    ].join("\n"));
    expect(t).not.toMatch(/Hot\b(?! buttons)/);
    expect(t).not.toMatch(/[–—]/);
  });

  it("marks a business rental as plus VAT", () => {
    expect(crmText({ kind: "business_car", data: { rental: "450" }, today: TODAY })).toBe("Availability and price\nRental on their terms: £450 + VAT a month");
  });

  it("copies only what's new or changed since the last copy", () => {
    const since = { data: { ...data }, at: 1000 };
    const later = { ...data, mileage: "12000", colour: "Blue", callbackTime: "16:00" };
    const docs = [{ createdAt: 900, text: "Old PDF" }, { createdAt: 1100, text: "Fuel cost comparison, Wed 4 Nov: saves £85 a month" }];
    expect(crmText({ kind: "personal", data: later, since, docs, today: TODAY })).toBe([
      "Agreed next contact: Text, Fri 6 Nov at 4pm", "",
      "What they need", "Preferred colour: Blue", "",
      "Quote terms", "Annual mileage: 12,000 miles a year", "",
      "Documents", "Fuel cost comparison, Wed 4 Nov: saves £85 a month",
    ].join("\n"));
    expect(crmText({ kind: "personal", data, since, today: TODAY })).toBe("");
  });

  it("copies one section on its own", () => {
    expect(crmText({ kind: "personal", data, only: "terms", today: TODAY })).toBe("Quote terms\nUpfront they saw: £3,000\nTerm: 48 months\nAnnual mileage: 10,000 miles a year");
  });

  it("writes the agreed next contact however much of it was agreed", () => {
    expect(crmText({ kind: "personal", data: { contactBy: "Call", callbackDate: "2026-11-05", callbackTime: "10:00" }, today: TODAY }))
      .toBe("Agreed next contact: Call, Thu 5 Nov at 10am");
    expect(crmText({ kind: "personal", data: { callbackDate: "2027-01-15" }, today: TODAY })).toBe("Agreed next contact: Fri 15 Jan 2027");
    expect(crmText({ kind: "personal", data: { contactBy: "Email" }, today: TODAY })).toBe("Agreed next contact: Email");
    expect(nextContactText({ contactBy: "Call", callbackDate: "2026-11-05", callbackTime: "10:00" }, TODAY)).toBe("Call tomorrow at 10am");
    expect(nextContactText({ callbackDate: "2026-11-09" }, TODAY)).toBe("Contact Mon 9 Nov");
    expect(nextContactText({ contactBy: "Call" }, TODAY)).toBeNull();
  });

  it("leaves out an answer whose question is hidden", () => {
    expect(crmText({ kind: "personal", data: { exact: "Exact", openIf: ["Better spec"] }, today: TODAY })).toBe("The car\nExact car, or open to similar? Exact");
  });
});

describe("part exchange", () => {
  it("works out equity to the penny", () => {
    expect(pxEquity(12500, 8000)).toBe(4500);
    expect(pxEquity(9000, 11250.5)).toBe(-2250.5);
    expect(pxEquity(12500.5, 8000.25)).toBe(4500.25);
    expect(pxEquity(0.3, 0.1)).toBe(0.2);
  });

  it("sums it up in a line", () => {
    expect(pxText({ pxHas: "Yes", pxReg: "ab12 cde", pxMileage: "45000", pxValue: "12500", pxSettlement: "8000", pxValidUntil: "2026-11-20" }, TODAY))
      .toBe("AB12 CDE, 45,000 miles. Valued at £12,500, valid until Fri 20 Nov. £8,000 to settle, so £4,500 equity.");
    expect(pxText({ pxValue: "9000", pxSettlement: "11250.50" }, TODAY)).toBe("Valued at £9,000. £11,250.50 to settle, so £2,250.50 negative equity.");
    expect(pxText({ pxReg: "AB12CDE", pxLinkSent: "2026-11-04" }, TODAY)).toBe("AB12CDE. Appraisal link sent Wed 4 Nov.");
    expect(pxText({ pxHas: "No", pxReg: "AB12CDE" }, TODAY)).toBe("No part exchange");
    expect(pxText({}, TODAY)).toBeNull();
    expect(pxText({ pxHas: "Yes" }, TODAY)).toBe("Has a part exchange");
  });
});

describe("what the browser may save", () => {
  it("takes known answers and turns an empty one into a removal", () => {
    expect(cleanPatch({ derivative: "Titanium", colour: "", openIf: ["Better spec"], adjust: [] }))
      .toEqual({ derivative: "Titanium", colour: null, openIf: ["Better spec"], adjust: null });
  });
  it("refuses anything else", () => {
    expect(cleanPatch({ customer_name: "x" })).toBeNull();
    expect(cleanPatch({ derivative: 5 })).toBeNull();
    expect(cleanPatch({ openIf: [1] })).toBeNull();
    expect(cleanPatch(["derivative"])).toBeNull();
    expect(cleanPatch(null)).toBeNull();
  });
  it("caps lengths", () => {
    expect((cleanPatch({ derivative: "x".repeat(5000) })!.derivative as string).length).toBe(2000);
    expect((cleanPatch({ otherNotes: "x".repeat(30000) })!.otherNotes as string).length).toBe(20000);
  });
});

describe("opening the calculators", () => {
  it("fills the fuel calculator from the profile", () => {
    expect(fuelPrefillOf({ customerName: "Sarah Jones", kind: "personal", model: "Puma Gen-E", data: { mileage: "10,000", term: "48", currentVehicle: " VW Golf 2019 " } }))
      .toEqual({ customerName: "Sarah Jones", segment: "car", customer: "private", annualMiles: 10000, termMonths: 48, currentVehicle: "VW Golf 2019", model: "Puma Gen-E" });
    const van = fuelPrefillOf({ customerName: "Smith Ltd", kind: "business_van", model: "E-Transit Custom", data: { term: "30" } });
    expect(van).toMatchObject({ segment: "van", customer: "business", annualMiles: null, termMonths: null });
    expect(fuelPrefillOf({ customerName: "x", kind: "business_car", model: "Transit Custom", data: {} }).segment).toBe("van");
  });

  it("picks the electric model they enquired on", () => {
    const evs = [
      { key: "Ford|Puma Gen-E", model: "Puma Gen-E" }, { key: "Ford|Explorer", model: "Explorer" },
      { key: "Ford|Explorer Van", model: "Explorer Van" }, { key: "Ford|E-Transit Custom", model: "E-Transit Custom" },
    ];
    expect(matchEvModel("Puma Gen-E", evs)).toBe("Ford|Puma Gen-E");
    expect(matchEvModel("Ford Puma", evs)).toBe("Ford|Puma Gen-E");
    expect(matchEvModel("Explorer", evs)).toBe("Ford|Explorer");
    expect(matchEvModel("e-transit custom", evs)).toBe("Ford|E-Transit Custom");
    expect(matchEvModel("Kuga", evs)).toBeNull();
    expect(matchEvModel("", evs)).toBeNull();
  });

  it("finds their Ranger from what's been typed", () => {
    const r = (model: string, data: ProfileData = {}, kind: "personal" | "business_car" | "business_van" = "business_car") =>
      rangerPrefillOf({ customerName: "x", kind, model, data });
    expect(r("Ranger", { derivative: "Wildtrak 3.0 V6" })).toMatchObject({ trim: "Wildtrak", versionId: "wildtrak-diesel", seats: 5 });
    expect(r("Ranger", { derivative: "Wildtrak PHEV" }).versionId).toBe("wildtrak-phev");
    expect(r("Ranger", { derivative: "Wildtrak" })).toMatchObject({ trim: "Wildtrak", versionId: null });
    expect(r("Ranger Raptor").versionId).toBe("raptor-petrol");
    expect(r("Ranger", { trim: "Limited" }).versionId).toBe("limited-phev");
    expect(r("Ranger", { derivative: "MS-RT" }).versionId).toBe("msrt-diesel");
    expect(r("Ranger", { derivative: "XLT 2 seat diesel" })).toMatchObject({ versionId: "xlt-diesel", seats: 2 });
    expect(r("Ranger", { derivative: "Platinum 2-seat diesel" })).toMatchObject({ versionId: "platinum-diesel", seats: 5 });
    expect(r("Ranger")).toMatchObject({ trim: null, versionId: null });
    expect(r("Ranger", { taxRate: "40%", fuelCard: "Yes", term: "36", rental: "450" })).toMatchObject({ taxRate: "40", fuelCard: "yes", termMonths: 36, rental: 450 });
    // A personal quote includes VAT, so its rental isn't the calculator's ex VAT figure.
    expect(r("Ranger", { rental: "450" }, "personal").rental).toBeNull();
  });

  it("knows a Ranger and a van when it sees one", () => {
    expect(isRanger("Ranger")).toBe(true);
    expect(isRanger("ford ranger raptor")).toBe(true);
    expect(isRanger("Raptor")).toBe(true);
    expect(isRanger("Kuga")).toBe(false);
    expect(isVanModel("Transit Custom")).toBe(true);
    expect(isVanModel("E-Transit Courier")).toBe(true);
    expect(isVanModel("Explorer Van")).toBe(true);
    expect(isVanModel("Explorer")).toBe(false);
    expect(isVanModel("Tourneo Custom")).toBe(false);
  });
});
