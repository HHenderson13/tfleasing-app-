import { describe, expect, it } from "vitest";
import {
  DATA_KEYS, KINDS, PX_FIELDS, RETIRED, SECTIONS, addDays, callbackOf, cleanPatch, crmText, dayWord, fieldsShown, fmtDate, fmtTime, fuelPrefillOf,
  isPlugIn, isRanger, isVanModel, kindFor, labelOf, matchEvModel, nextContactText, optionsOf, panelLayout, progressOf, promptsOf, pxEquity, pxText, rangerPrefillOf,
  retiredLines, sectionsFor, shortOf, sortLive, summaryOf, titleOf, topicsFor, ukNow, urgencyOf, type Ctx, type ProfileData, type ProfileKind,
} from "./customer-profiles";

const NOW = "2026-11-04T14:05"; // a Wednesday afternoon
const TODAY = NOW.slice(0, 10);
const sec = (id: string) => SECTIONS.find((s) => s.id === id)!;
const shown = (id: string, c: Ctx) => fieldsShown(sec(id), c).map((f) => f.id);

describe("the questions", () => {
  it("never reuses an answer's key, and never reuses a retired one", () => {
    const ids = [...SECTIONS.flatMap((s) => s.fields.map((f) => f.id)), ...PX_FIELDS.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(DATA_KEYS.has("heat")).toBe(true);
    for (const id of Object.keys(RETIRED)) expect(DATA_KEYS.has(id), id).toBe(false);
  });

  it("is cut to the topics that matter: no closing or follow-up steps", () => {
    const ids = (k: ProfileKind) => sectionsFor(k).map((s) => s.id);
    expect(ids("personal")).toEqual(["next", "vehicle", "why", "needs", "charging", "current", "terms", "notes"]);
    expect(ids("business_car")).toEqual(["next", "vehicle", "why", "business", "needs", "charging", "current", "terms", "decision", "notes"]);
    expect(ids("business_van")).toEqual(["next", "vehicle", "why", "business", "needs", "spec", "charging", "current", "terms", "decision", "notes"]);
    expect(topicsFor("personal").map((s) => s.id)).toEqual(["vehicle", "why", "needs", "charging", "current", "terms"]);
    expect(titleOf(sec("vehicle"), "business_van")).toBe("The van");
    expect(titleOf(sec("terms"), "personal")).toBe("Quote and price");
  });

  it("gives every question shown a label and every choice its options", () => {
    for (const k of KINDS) for (const s of sectionsFor(k)) {
      expect(titleOf(s, k)).not.toBe("");
      for (const f of s.fields.filter((x) => !x.kinds || x.kinds.includes(k))) {
        expect(labelOf(f, k), `${s.id}.${f.id} for ${k}`).not.toBe("");
        expect(labelOf(f, k)).not.toContain("{v}");
        if (f.type === "choice" || f.type === "multi") expect(optionsOf(f, k).length, `${f.id} for ${k}`).toBeGreaterThan(1);
      }
    }
  });

  it("asks a Ranger 5 seat or 2 seat, and nothing else", () => {
    expect(shown("vehicle", { kind: "business_van", model: "Ranger", data: {} })).toContain("rangerSeats");
    expect(shown("vehicle", { kind: "personal", model: "Ranger Raptor", data: {} })).toContain("rangerSeats");
    expect(shown("vehicle", { kind: "business_van", model: "Transit Custom", data: {} })).not.toContain("rangerSeats");
    expect(optionsOf(sec("vehicle").fields.find((f) => f.id === "rangerSeats")!, "business_van")).toEqual(["5 seat", "2 seat"]);
  });

  it("asks about charging straight away for a plug-in, and only after 'open to electric' otherwise", () => {
    const charging = ["offStreet", "homeCharger", "workCharging", "dailyMiles"];
    expect(shown("charging", { kind: "personal", model: "Kuga", data: {} })).toEqual(["openToElectric"]);
    expect(shown("charging", { kind: "personal", model: "Kuga", data: { openToElectric: "No" } })).toEqual(["openToElectric"]);
    expect(shown("charging", { kind: "personal", model: "Kuga", data: { openToElectric: "Maybe" } })).toEqual(["openToElectric", ...charging]);
    expect(shown("charging", { kind: "personal", model: "Puma Gen-E", data: {} })).toEqual(charging);
    expect(shown("charging", { kind: "personal", model: "Kuga", data: { derivative: "ST-Line 2.5 PHEV" } })).toEqual(charging);
    expect(labelOf(sec("charging").fields.find((f) => f.id === "workCharging")!, "business_van")).toBe("Charging at the depot?");
  });

  it("asks a van customer for the V5 that unlocks the renewal discount, and nobody else", () => {
    expect(shown("current", { kind: "business_van", model: "Transit Custom", data: {} })).toContain("v5");
    expect(shown("current", { kind: "business_car", model: "Kuga", data: {} })).not.toContain("v5");
    expect(shown("current", { kind: "personal", model: "Transit Custom", data: {} })).not.toContain("v5");
  });

  it("hides a follow-on question until it's needed", () => {
    const c = (data: ProfileData): Ctx => ({ kind: "personal", model: "Kuga", data });
    expect(shown("vehicle", c({}))).not.toContain("openIf");
    expect(shown("vehicle", c({ exact: "Open to similar" }))).toContain("openIf");
    expect(shown("terms", c({ availability: "On a lead time" }))).toContain("leadTime");
  });

  it("has no em or en dashes anywhere an exec reads", () => {
    const text: string[] = [];
    for (const k of KINDS) for (const s of sectionsFor(k)) {
      text.push(titleOf(s, k), ...promptsOf(s, k));
      for (const f of s.fields) text.push(labelOf(f, k), shortOf(f, k), ...optionsOf(f, k));
    }
    for (const f of PX_FIELDS) text.push(labelOf(f, "personal"), ...optionsOf(f, "personal"));
    text.push(...Object.values(RETIRED));
    expect(text.join(" ")).not.toMatch(/[–—]/);
  });
});

describe("personal or business, car or van", () => {
  it("lets the model decide car or van, and treats a Ranger as a van", () => {
    expect(kindFor("personal", "Transit Custom")).toBe("personal");
    expect(kindFor("personal", "Ranger")).toBe("personal");
    expect(kindFor("business", "Ranger")).toBe("business_van");
    expect(kindFor("business", "Ranger Raptor")).toBe("business_van");
    expect(kindFor("business", "Transit Custom")).toBe("business_van");
    expect(kindFor("business", "Explorer Van")).toBe("business_van");
    expect(kindFor("business", "Explorer")).toBe("business_car");
    expect(kindFor("business", "Kuga")).toBe("business_car");
    expect(kindFor("business", "")).toBe("business_car");
  });

  it("knows a Ranger, a van and a plug-in when it sees one", () => {
    expect(isRanger("ford ranger raptor")).toBe(true);
    expect(isRanger("Kuga")).toBe(false);
    expect(isVanModel("E-Transit Courier")).toBe(true);
    expect(isVanModel("Ranger")).toBe(true);
    expect(isVanModel("Tourneo Custom")).toBe(false);
    for (const m of ["Puma Gen-E", "Capri", "Explorer", "Explorer Van", "Mustang Mach-E", "E-Transit Custom", "Transit City", "Kuga PHEV", "Ranger PHEV"]) expect(isPlugIn(m), m).toBe(true);
    for (const m of ["Puma", "Kuga", "Mustang", "Transit Custom", "Ranger", "Focus"]) expect(isPlugIn(m), m).toBe(false);
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
    // An agreed contact is a promise: due beats cold.
    expect(urgencyOf({ heat: "Cold", callbackDate: "2026-11-02" }, NOW).tier).toBe(0);
  });

  it("ignores a next contact that isn't a real date", () => {
    expect(callbackOf({ callbackDate: "next week" })).toBeNull();
    expect(callbackOf({ callbackDate: "2026-11-05", callbackTime: "9" })).toEqual({ date: "2026-11-05", time: null });
  });

  it("sorts most important first, soonest next contact next, then newest", () => {
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

  it("measures progress over the topics shown, leaving out the next contact and the notes", () => {
    const c = (data: ProfileData): Ctx => ({ kind: "personal", model: "Kuga", data });
    expect(progressOf(c({})).pct).toBe(0);
    const p = progressOf(c({ derivative: "Titanium", exact: "Exact", otherNotes: "hello", callbackDate: TODAY }));
    expect(p.answered).toBe(2);
    expect(progressOf(c({ exact: "Open to similar" })).total).toBe(progressOf(c({})).total + 1);
    // Saying they're open to electric brings the charging questions into the count.
    expect(progressOf(c({ openToElectric: "Yes" })).total).toBe(progressOf(c({})).total + 4);
  });
});

describe("the summary tiles", () => {
  it("shows what's known as short label and value, or what to ask while it's empty", () => {
    const ranger: Ctx = { kind: "business_van", model: "Ranger", data: {} };
    expect(summaryOf(sec("vehicle"), ranger, TODAY)).toEqual({ rows: [], more: 0, ask: ["Derivative", "Seats", "Exact or similar"] });
    expect(summaryOf(sec("vehicle"), { ...ranger, data: { derivative: "Wildtrak 3.0 V6", rangerSeats: "2 seat" } }, TODAY))
      .toEqual({ rows: [["Derivative", "Wildtrak 3.0 V6"], ["Seats", "2 seat"]], more: 0, ask: [] });
    const terms = summaryOf(sec("terms"), { kind: "business_car", model: "Kuga", data: { upfront: "3000", term: "36", mileage: "10000", maintenance: "Included", rental: "389.5" } }, TODAY, 4);
    expect(terms.rows).toEqual([["Upfront", "£3,000"], ["Term", "36 months"], ["Mileage", "10,000 miles a year"], ["Maintenance", "Included"]]);
    expect(terms.more).toBe(1);
  });
});

describe("the panel's layout", () => {
  it("only ever puts short questions side by side, in pairs, so every row lines up", () => {
    const layout = (id: string, c: Ctx) => panelLayout(fieldsShown(sec(id), c), c.kind).map(({ f, half }) => `${f.id}${half ? "/2" : ""}`);
    expect(layout("needs", { kind: "business_van", model: "Ranger", data: {} }))
      .toEqual(["usedFor", "driver/2", "payload/2", "loadSize", "access", "towing/2", "caz/2", "taxRate/2", "fuelCard/2"]);
    // A short question with no short neighbour takes the whole row rather than leave a gap.
    expect(layout("terms", { kind: "business_van", model: "Ranger", data: {} }))
      .toEqual(["upfront", "term", "mileage", "maintenance", "rental", "availability", "alternative"]);
    for (const k of KINDS) for (const s of sectionsFor(k)) {
      const rows = panelLayout(fieldsShown(s, { kind: k, model: "Ranger PHEV", data: { exact: "Open to similar", openToElectric: "Yes", approver: "Goes via someone else" } }), k);
      let run = 0;
      for (const r of rows) { if (r.half) run++; else { expect(run % 2, `${s.id} for ${k}`).toBe(0); run = 0; } }
      expect(run % 2, `${s.id} for ${k}`).toBe(0);
    }
  });
});

describe("copy for the CRM", () => {
  const data: ProfileData = {
    heat: "Hot",
    derivative: "Titanium X 2.5 PHEV",
    exact: "Open to similar",
    openIf: ["Availability", "Lower rental"],
    upfront: "3000",
    term: "48",
    mileage: "10000",
    rental: "389.5",
    contactBy: "Text",
    callbackDate: "2026-11-06",
    callbackTime: "14:30",
    otherNotes: "Family: two kids, dog\nHot buttons: towing",
  };
  const kuga = { kind: "personal" as const, model: "Kuga" };

  it("leads with the agreed next contact, leaves out what the CRM already has, and reads like notes", () => {
    const t = crmText({ ...kuga, data, today: TODAY });
    expect(t).toBe([
      "Agreed next contact: Text, Fri 6 Nov at 2:30pm",
      "",
      "The car",
      "Derivative: Titanium X 2.5 PHEV",
      "Exact or similar: Open to similar",
      "Similar for: Availability, Lower rental",
      "",
      "Quote and price",
      "Upfront: £3,000",
      "Term: 48 months",
      "Mileage: 10,000 miles a year",
      "Rental: £389.50 a month",
      "",
      "Notes",
      "Family: two kids, dog\nHot buttons: towing",
    ].join("\n"));
    expect(t).not.toMatch(/Kuga|Personal|Warm|Cold/);
    expect(t).not.toMatch(/[–—]/);
  });

  it("marks a business rental as plus VAT", () => {
    expect(crmText({ kind: "business_car", model: "Kuga", data: { rental: "450" }, today: TODAY })).toBe("Quote and price\nRental: £450 + VAT a month");
  });

  it("copies the Ranger's seats, the charging answers and the V5", () => {
    expect(crmText({ kind: "business_van", model: "Ranger", data: { rangerSeats: "2 seat", openToElectric: "Maybe", homeCharger: "Could fit one", v5: "Yes" }, today: TODAY })).toBe([
      "The van", "Seats: 2 seat", "",
      "Charging", "Open to electric: Maybe", "Home charger: Could fit one", "",
      "Current vehicle", "V5 for renewal: Yes",
    ].join("\n"));
  });

  it("copies only what's new or changed since the last copy", () => {
    const since = { data: { ...data }, at: 1000 };
    const later = { ...data, mileage: "12000", colour: "Blue", callbackTime: "16:00" };
    const docs = [{ createdAt: 900, text: "Old PDF" }, { createdAt: 1100, text: "Fuel cost comparison, Wed 4 Nov: saves £85 a month" }];
    expect(crmText({ ...kuga, data: later, since, docs, today: TODAY })).toBe([
      "Agreed next contact: Text, Fri 6 Nov at 4pm", "",
      "The car", "Colour: Blue", "",
      "Quote and price", "Mileage: 12,000 miles a year", "",
      "Documents", "Fuel cost comparison, Wed 4 Nov: saves £85 a month",
    ].join("\n"));
    expect(crmText({ ...kuga, data, since, today: TODAY })).toBe("");
  });

  it("copies one topic on its own", () => {
    expect(crmText({ ...kuga, data, only: "terms", today: TODAY })).toBe("Quote and price\nUpfront: £3,000\nTerm: 48 months\nMileage: 10,000 miles a year\nRental: £389.50 a month");
  });

  it("writes the agreed next contact however much of it was agreed", () => {
    expect(crmText({ ...kuga, data: { contactBy: "Call", callbackDate: "2026-11-05", callbackTime: "10:00" }, today: TODAY })).toBe("Agreed next contact: Call, Thu 5 Nov at 10am");
    expect(crmText({ ...kuga, data: { callbackDate: "2027-01-15" }, today: TODAY })).toBe("Agreed next contact: Fri 15 Jan 2027");
    expect(crmText({ ...kuga, data: { contactBy: "Email" }, today: TODAY })).toBe("Agreed next contact: Email");
    expect(nextContactText({ contactBy: "Call", callbackDate: "2026-11-05", callbackTime: "10:00" }, TODAY)).toBe("Call tomorrow at 10am");
    expect(nextContactText({ callbackDate: "2026-11-09" }, TODAY)).toBe("Contact Mon 9 Nov");
    expect(nextContactText({ contactBy: "Call" }, TODAY)).toBeNull();
  });

  it("leaves out an answer whose question is hidden", () => {
    expect(crmText({ ...kuga, data: { exact: "Exact", openIf: ["Spec"] }, today: TODAY })).toBe("The car\nExact or similar: Exact");
  });

  it("never drops anything typed into a question the first version asked", () => {
    const old = { interest: "The range", hardDeadline: "Yes", showOnQuote: ["P11D", "VAT"] };
    expect(retiredLines(old)).toEqual(["What interested them: The range", "Hard deadline: Yes", "Show on the quote: P11D, VAT"]);
    expect(crmText({ ...kuga, data: { ...old, otherNotes: "hello" }, today: TODAY }))
      .toBe("Notes\nhello\nWhat interested them: The range\nHard deadline: Yes\nShow on the quote: P11D, VAT");
    expect(crmText({ ...kuga, data: { interest: "The range" }, today: TODAY })).toBe("Notes\nWhat interested them: The range");
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
    expect(cleanPatch({ derivative: "Titanium", colour: "", openIf: ["Spec"], accessories: [] }))
      .toEqual({ derivative: "Titanium", colour: null, openIf: ["Spec"], accessories: null });
  });
  it("refuses anything else, including the retired questions", () => {
    expect(cleanPatch({ customer_name: "x" })).toBeNull();
    expect(cleanPatch({ interest: "x" })).toBeNull();
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

  it("finds their Ranger, and takes the seats from the question", () => {
    const r = (model: string, data: ProfileData = {}, kind: ProfileKind = "business_van") => rangerPrefillOf({ customerName: "x", kind, model, data });
    expect(r("Ranger", { derivative: "Wildtrak 3.0 V6" })).toMatchObject({ trim: "Wildtrak", versionId: "wildtrak-diesel", seats: 5 });
    expect(r("Ranger", { derivative: "Wildtrak PHEV" }).versionId).toBe("wildtrak-phev");
    expect(r("Ranger", { derivative: "Wildtrak" })).toMatchObject({ trim: "Wildtrak", versionId: null });
    expect(r("Ranger Raptor").versionId).toBe("raptor-petrol");
    expect(r("Ranger", { derivative: "Limited" }).versionId).toBe("limited-phev");
    expect(r("Ranger", { derivative: "MS-RT" }).versionId).toBe("msrt-diesel");
    expect(r("Ranger", { derivative: "XLT diesel", rangerSeats: "2 seat" })).toMatchObject({ versionId: "xlt-diesel", seats: 2 });
    expect(r("Ranger", { derivative: "XLT 2 seat diesel" }).seats).toBe(2);
    // The question wins over the typing, and a 2 seat only where Ford build one.
    expect(r("Ranger", { derivative: "XLT 2 seat diesel", rangerSeats: "5 seat" }).seats).toBe(5);
    expect(r("Ranger", { derivative: "Platinum diesel", rangerSeats: "2 seat" })).toMatchObject({ versionId: "platinum-diesel", seats: 5 });
    expect(r("Ranger")).toMatchObject({ trim: null, versionId: null });
    expect(r("Ranger", { taxRate: "40%", fuelCard: "Yes", term: "36", rental: "450" })).toMatchObject({ taxRate: "40", fuelCard: "yes", termMonths: 36, rental: 450 });
    // A personal quote includes VAT, so its rental isn't the calculator's ex VAT figure.
    expect(r("Ranger", { rental: "450" }, "personal").rental).toBeNull();
  });
});
