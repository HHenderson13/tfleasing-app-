import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG, EMPTY_INPUT, MSG_MODELS, buildMessage, emailChoices, firstNameGuess, forText, isUkMobile, longDate, msgModel, msgModelFor, offerLine,
  offerProblems, offersFor, questionsFor, smsParts, ukNational, waLink, waStyles, type MessageOffer, type MsgInput, type Sender,
} from "./message-templates";
import { configOverrides, configProblems, normaliseConfig, unknownTokens, type MessageConfig } from "./message-config";

const TODAY = "2026-11-06";
const FREDDY: Sender = { name: "Freddy Smith", email: "freddy@trustfordleasing.co.uk", landline: "0113 496 0000", mobile: "07700 900123" };
const puma = msgModel("puma")!;
const custom = msgModel("transit-custom")!;

const offer = (o: Partial<MessageOffer> = {}): MessageOffer => ({
  id: "o1", title: "Custom Trail", models: ["transit-custom"], who: "both", offer: "It's £299 + VAT a month, with metallic paint and ply lining included",
  details: "", validUntil: null, day1: "", day2: "", day3: "", active: true, updatedAt: 0, updatedBy: "", ...o,
});

/** A Day 2 Puma email with everything filled in. */
const ready = (o: Partial<MsgInput> = {}): MsgInput => ({
  ...EMPTY_INPUT, day: 2, first: "James", who: "personal", modelKey: "puma",
  question: questionsFor(2, "personal", puma).find((q) => q.suggested)!.text, ...o,
});

describe("matching the model", () => {
  it("maps what was typed on a profile onto the right questions", () => {
    expect(msgModelFor("Kuga PHEV")?.key).toBe("kuga");
    expect(msgModelFor("Ford Ranger Raptor")?.key).toBe("ranger");
    expect(msgModelFor("E-Transit Custom")?.key).toBe("e-transit-custom");
    expect(msgModelFor("Transit Custom Trail")?.key).toBe("transit-custom");
    expect(msgModelFor("Transit Connect L2")?.key).toBe("transit-connect");
    expect(msgModelFor("Tourneo Custom")?.key).toBe("tourneo-custom");
    expect(msgModelFor("Puma Gen-E")?.key).toBe("puma-gen-e");
    expect(msgModelFor("Puma ST-Line")?.key).toBe("puma");
    expect(msgModelFor("Explorer Van")?.key).toBe("explorer-van");
    expect(msgModelFor("Transit 350")?.key).toBe("transit");
    expect(msgModelFor("Mustang Mach-E")?.key).toBe("mach-e");
    expect(msgModelFor("Golf")).toBeNull();
  });
});

describe("the discovery questions", () => {
  it("are the guide's, What then Why then When, with its suggested one marked", () => {
    const q = questionsFor(2, "personal", puma);
    expect(q.map((x) => x.angle)).toEqual([...Array(4).fill("what"), ...Array(4).fill("why"), ...Array(4).fill("when")]);
    const s = q.filter((x) => x.suggested);
    expect(s).toHaveLength(1);
    // A fuller version of the first What question takes its place rather than repeating it.
    expect(q[0]).toEqual({ angle: "what", suggested: true, text: "Have you got a particular Puma spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you." });
  });

  it("puts a business car on the business questions whatever the model, and a van on its own", () => {
    expect(questionsFor(2, "business", msgModel("kuga")!)[0].text).toMatch(/^Is this car for yourself or another driver in the business\?/);
    expect(questionsFor(2, "business", custom).find((x) => x.suggested)?.text).toBe("Have you got a particular Custom size or spec in mind, and would you need anything fitted before delivery?");
    expect(questionsFor(3, "business", msgModel("kuga")!).find((x) => x.suggested)?.text).toMatch(/^Is the business still looking to get the Kuga sorted/);
  });

  it("only asks about electric's tax benefits for something they'd plug in", () => {
    const tax = (key: string) => questionsFor(2, "business", msgModel(key)!).some((x) => /tax benefits/.test(x.text));
    expect(tax("explorer")).toBe(true);
    expect(tax("kuga")).toBe(true);
    expect(tax("mustang")).toBe(false);
  });

  it("asks Day 3's own questions on Day 3, and Day 1 has its own suggestion", () => {
    expect(questionsFor(3, "personal", puma).find((x) => x.suggested)?.text).toBe("Are you still looking at the Puma, or have you found something else?");
    expect(questionsFor(1, "personal", puma).find((x) => x.suggested)?.text).toBe("What caught your eye about the Puma?");
    expect(questionsFor(1, "business", custom).find((x) => x.suggested)?.text).toBe("What sort of work will you mainly use the van for?");
  });

  it("names the model in the lists made for models the guide doesn't cover", () => {
    const q = questionsFor(2, "personal", msgModel("mustang")!);
    expect(q[0].text).toMatch(/particular Mustang spec/);
    expect(q.some((x) => x.text.includes("{model}"))).toBe(false);
  });

  it("gives every model a question for every day and both customers", () => {
    for (const m of MSG_MODELS) for (const day of [1, 2, 3] as const) for (const who of ["personal", "business"] as const) {
      const q = questionsFor(day, who, m);
      expect(q.filter((x) => x.suggested), `${m.key} day ${day} ${who}`).toHaveLength(1);
      expect(new Set(q.map((x) => x.text)).size, `${m.key} day ${day} ${who}`).toBe(q.length);
    }
  });
});

describe("copying only when it's complete", () => {
  it("says what's missing from a blank message", () => {
    const b = buildMessage(EMPTY_INPUT, FREDDY, [], TODAY);
    expect(b.missing.map((m) => m.key)).toEqual(["day", "first", "who", "model", "question"]);
  });

  it("won't let an email go without the customer's name, and shows the gap", () => {
    const b = buildMessage(ready({ first: "  " }), FREDDY, [], TODAY);
    expect(b.missing.map((m) => m.key)).toEqual(["first"]);
    expect(b.paras[0]).toBe("Hi ⟦first name⟧,");
  });

  it("needs a question picked from this day's list, or one of their own", () => {
    expect(buildMessage(ready({ question: null }), FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["question"]);
    // A question picked on Day 2 doesn't carry over to Day 3, where the list is different.
    expect(buildMessage(ready({ day: 3 }), FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["question"]);
    expect(buildMessage(ready({ useOwn: true, own: "" }), FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["question"]);
    const own = buildMessage(ready({ useOwn: true, own: "Would a Kuga suit you better" }), FREDDY, [], TODAY);
    expect(own.missing).toEqual([]);
    expect(own.paras).toContain("Would a Kuga suit you better?");
  });

  it("asks on Day 1 whether they asked us something, and wants the answer if they did", () => {
    const d1 = ready({ day: 1, question: "What caught your eye about the Puma?" });
    expect(buildMessage(d1, FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["asked"]);
    expect(buildMessage({ ...d1, asked: "yes" }, FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["answer"]);
    const b = buildMessage({ ...d1, asked: "yes", answer: "Yes, it comes in Grabber Blue." }, FREDDY, [], TODAY);
    expect(b.missing).toEqual([]);
    expect(b.paras).toContain("Yes, it comes in Grabber Blue.");
    expect(buildMessage({ ...d1, asked: "no" }, FREDDY, [], TODAY).missing).toEqual([]);
    // Day 2 and 3 don't ask.
    expect(buildMessage(ready(), FREDDY, [], TODAY).missing).toEqual([]);
  });

  it("needs the exec's landline and mobile for an email, not for a WhatsApp", () => {
    const none = { ...FREDDY, landline: "", mobile: "0113 496 0000" };
    expect(buildMessage(ready(), none, [], TODAY).missing.map((m) => m.key)).toEqual(["landline", "mobile"]);
    expect(buildMessage(ready({ channel: "whatsapp" }), none, [], TODAY).missing).toEqual([]);
  });

  it("makes mentioning an offer a decision every time", () => {
    const base = ready({ modelKey: "transit-custom", who: "business", question: questionsFor(2, "business", custom)[0].text });
    expect(buildMessage(base, FREDDY, [offer()], TODAY).missing.map((m) => m.key)).toEqual(["offer"]);
    expect(buildMessage({ ...base, offerId: "none" }, FREDDY, [offer()], TODAY).missing).toEqual([]);
    const b = buildMessage({ ...base, offerId: "o1" }, FREDDY, [offer()], TODAY);
    expect(b.missing).toEqual([]);
    expect(b.paras).toContain("I also wanted to make sure you'd seen the offer we've got on the Transit Custom at the moment. It's £299 + VAT a month, with metallic paint and ply lining included.");
  });
});

describe("the email", () => {
  it("reads like the guide's Day 2 email, signed with both numbers and a WhatsApp button", () => {
    const b = buildMessage(ready(), FREDDY, [], TODAY);
    expect(b.subject).toBe("Your Ford Puma enquiry");
    expect(b.paras).toEqual([
      "Hi James,",
      "It's Freddy from TrustFord Leasing again.",
      "I've just tried giving you another quick call about your Puma enquiry.",
      "I wanted to see if I could help you narrow down the best options.",
      "Have you got a particular Puma spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you.",
      "If you can let me know, I'll have a look at what would work best for you.",
      "Feel free to reply here, call me or drop me a WhatsApp.",
      "Thanks,",
    ]);
    expect(b.signature).toEqual(["Freddy Smith", "TrustFord Leasing", "Tel: 0113 496 0000", "Mobile: 07700 900123", "Email: freddy@trustfordleasing.co.uk"]);
    expect(b.waHref).toBe(`https://wa.me/447700900123?text=${encodeURIComponent("Hi Freddy, it's James about the Puma.")}`);
    expect(b.html).toContain(`href="https://wa.me/447700900123?text=`);
    expect(b.html).toContain("Message me on WhatsApp");
    // The WhatsApp tile travels inside the email, not as a link to an image Outlook would block.
    expect(b.html).toContain(`src="data:image/png;base64,`);
    expect(b.text.endsWith(`Message me on WhatsApp: ${b.waHref}`)).toBe(true);
  });

  it("asks Day 3 if they're still looking, and drops the call me line where the ending says reply", () => {
    const q = questionsFor(3, "personal", puma)[0].text;
    const b = buildMessage(ready({ day: 3, question: q, emailEnding: 5 }), FREDDY, [], TODAY);
    expect(b.subject).toBe("Still looking at the Ford Puma?");
    expect(b.paras.slice(-2)).toEqual(["Just drop me a reply when you get a chance.", "Thanks,"]);
  });

  it("escapes whatever's typed, so a customer's name can't break the HTML", () => {
    const b = buildMessage(ready({ first: "<b>Jo</b>" }), FREDDY, [], TODAY);
    expect(b.html).toContain("Hi &lt;b&gt;Jo&lt;/b&gt;,");
  });

  it("offers each opening and ending as it'll read", () => {
    const c = emailChoices(2, { first: "James", exec: "Freddy", model: "Puma", van: false });
    expect(c.openings[0].text).toBe("I've just tried giving you another quick call about your Puma enquiry. I wanted to see if I could help you narrow down the best options.");
    expect(c.openings.at(-1)?.note).toBe("only if you've reviewed it");
    expect(c.endings).toHaveLength(6);
  });

  it("adds the fleet question for a business only, on Day 2 and 3", () => {
    const biz = ready({ who: "business", modelKey: "kuga", question: questionsFor(2, "business", msgModel("kuga")!)[0].text, fleet: true });
    expect(buildMessage(biz, FREDDY, [], TODAY).paras).toContain("Out of interest, do you normally replace your vehicles individually, or have you got a few coming up for renewal together?");
    expect(buildMessage({ ...biz, who: "personal" }, FREDDY, [], TODAY).paras.join(" ")).not.toMatch(/Out of interest/);
  });
});

describe("WhatsApp and text", () => {
  it("is the guide's Day 2 WhatsApp", () => {
    const b = buildMessage(ready({ channel: "whatsapp" }), FREDDY, [], TODAY);
    expect(b.text).toBe([
      "Hi James 👋",
      "It's Freddy from TrustFord Leasing again.",
      "Just tried giving you another quick call about the Puma.",
      "Have you got a particular Puma spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you.",
      "Let me know when you get a minute and I'll have a look at the options for you 👍",
      "Freddy",
    ].join("\n\n"));
    expect(b.html).toBeNull();
  });

  it("is the same as a text, without the emoji", () => {
    const b = buildMessage(ready({ channel: "text" }), FREDDY, [], TODAY);
    expect(b.paras[0]).toBe("Hi James,");
    expect(b.paras[4]).toBe("Let me know when you get a minute and I'll have a look at the options for you.");
    expect(b.text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(forText("Hi Sarah, it's Minny from TrustFord Leasing again 👋")).toBe("Hi Sarah, it's Minny from TrustFord Leasing again.");
    expect(forText("It’s fine")).toBe("It's fine");
  });

  it("needs no discovery question when a Day 3 easy reply asks its own", () => {
    const b = buildMessage(ready({ day: 3, channel: "whatsapp", question: null, waStyle: "easy-a" }), FREDDY, [], TODAY);
    expect(b.missing).toEqual([]);
    expect(b.text).toBe("Hi James, it's Freddy from TrustFord Leasing 👋\n\nJust checking where you're up to with the Puma.\n\nStill looking, leaving it until later, or got something sorted?\n\nNo problem either way 👍");
    // The same style as an email still needs one: the email has no style.
    expect(buildMessage(ready({ day: 3, question: null, waStyle: "easy-a" }), FREDDY, [], TODAY).missing.map((m) => m.key)).toEqual(["question"]);
  });

  it("only offers the easy replies that fit the customer", () => {
    const ids = (who: "personal" | "business", key: string) => waStyles(3, who, msgModel(key)).map((s) => s.id);
    expect(ids("personal", "puma")).toContain("easy-a");
    expect(ids("personal", "puma")).not.toContain("easy-b");
    expect(ids("business", "kuga")).toContain("easy-b");
    expect(ids("business", "transit-custom")).toContain("easy-c");
    expect(ids("business", "transit-custom")).not.toContain("easy-b");
  });

  it("counts a text's parts", () => {
    expect(smsParts("a".repeat(160))).toEqual({ chars: 160, parts: 1, plain: true });
    expect(smsParts("a".repeat(161)).parts).toBe(2);
    expect(smsParts("£".repeat(10)).plain).toBe(true);
    expect(smsParts("👍" + "a".repeat(70)).plain).toBe(false);
  });
});

describe("offers", () => {
  it("shows a live offer on its own models, for the right customer, until its last day", () => {
    expect(offersFor([offer()], "transit-custom", "business", TODAY)).toHaveLength(1);
    expect(offersFor([offer()], "transit-connect", "business", TODAY)).toHaveLength(0);
    expect(offersFor([offer({ who: "business" })], "transit-custom", "personal", TODAY)).toHaveLength(0);
    expect(offersFor([offer({ validUntil: TODAY })], "transit-custom", "business", TODAY)).toHaveLength(1);
    expect(offersFor([offer({ validUntil: "2026-11-05" })], "transit-custom", "business", TODAY)).toHaveLength(0);
    expect(offersFor([offer({ active: false })], "transit-custom", "business", TODAY)).toHaveLength(0);
  });

  it("reads differently each day, with the end date when there is one", () => {
    expect(offerLine(offer(), 1, "Transit Custom")).toBe("Good news, the Transit Custom you've enquired on is actually part of one of our bespoke offers at the moment, so it's a really good time to be looking! It's £299 + VAT a month, with metallic paint and ply lining included.");
    expect(offerLine(offer(), 3, "Transit Custom")).toBe("The offer on the Transit Custom is still running at the moment, so it's worth a look if you're still searching.");
    expect(offerLine(offer({ validUntil: "2026-11-28" }), 3, "Transit Custom")).toBe("The offer on the Transit Custom runs until Saturday 28 November, so it's worth a look if you're still searching.");
    expect(offerLine(offer({ day2: "Just so you know, [Model] is [Offer]" }), 2, "Transit Custom")).toBe("Just so you know, Transit Custom is It's £299 + VAT a month, with metallic paint and ply lining included.");
    expect(longDate("2026-11-06")).toBe("Friday 6 November");
  });

  it("checks an offer before it's saved", () => {
    expect(offerProblems(offer())).toEqual([]);
    expect(offerProblems(offer({ title: "", models: [], offer: "" }))).toHaveLength(3);
    expect(offerProblems(offer({ day3: "Ends [Valid until]" }))).toEqual(["Day 3 uses [Valid until], so it needs an end date."]);
    expect(offerProblems(offer({ day1: "[Price] a month" }))[0]).toMatch(/\[Price\]/);
  });
});

describe("the exec and the customer", () => {
  it("reads a UK mobile however it's typed", () => {
    expect(ukNational("+44 (0)7700 900123")).toBe("07700900123");
    expect(isUkMobile("+447700900123")).toBe(true);
    expect(isUkMobile("0113 496 0000")).toBe(false);
    expect(waLink("0113 496 0000")).toBeNull();
    expect(waLink("07700 900123")).toBe("https://wa.me/447700900123");
  });

  it("guesses the first name from a person's name, never a company's", () => {
    expect(firstNameGuess("sarah jones")).toBe("Sarah");
    expect(firstNameGuess("JAMES O'NEILL")).toBe("James");
    expect(firstNameGuess("Mr Smith")).toBe("Mr Smith");
    expect(firstNameGuess("Samliv property services ltd")).toBe("");
    expect(firstNameGuess("Wren Electrical - Wakefield Ltd")).toBe("");
    expect(firstNameGuess("Smith & Sons")).toBe("");
  });
});

describe("the words", () => {
  it("has no em or en dashes anywhere a customer or an exec reads", () => {
    const all: string[] = [...Object.values(DEFAULT_CONFIG.offers), ...Object.values(DEFAULT_CONFIG.fleet)];
    for (const m of MSG_MODELS) for (const day of [1, 2, 3] as const) for (const who of ["personal", "business"] as const) {
      all.push(...questionsFor(day, who, m).map((q) => q.text));
      for (const s of waStyles(day, who, m)) all.push(s.label, s.hint, s.text, ...s.endings);
      const c = emailChoices(day, { first: "J", exec: "F", model: m.label, van: m.van });
      all.push(...c.openings.map((o) => o.text), ...c.endings);
    }
    for (const channel of ["email", "whatsapp", "text"] as const) all.push(buildMessage(ready({ channel }), FREDDY, [offer()], TODAY).text);
    expect(all.join(" ")).not.toMatch(/[–—]/);
  });
});

describe("the templates admins can change", () => {
  const edit = (fn: (c: MessageConfig) => void) => { const c = structuredClone(DEFAULT_CONFIG); fn(c); return c; };

  it("has nothing wrong with the standard wording", () => {
    expect(configProblems(DEFAULT_CONFIG)).toEqual([]);
    expect(configOverrides(DEFAULT_CONFIG)).toEqual({});
    expect(normaliseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("stores only the sections that changed, and reads them back over the standard", () => {
    const c = edit((x) => { x.email[2].subject = "About your [Model]"; x.questions.puma.early.what[1].text = "Would you like it in blue?"; });
    const o = configOverrides(c);
    expect(Object.keys(o).sort()).toEqual(["email", "questions"]);
    expect(Object.keys(o.email as object)).toEqual(["2"]);
    expect(Object.keys(o.questions as object)).toEqual(["puma"]);
    expect(normaliseConfig(JSON.parse(JSON.stringify(o)))).toEqual(c);
  });

  it("uses an admin's wording in the message", () => {
    const c = edit((x) => {
      x.email[2].subject = "About your [Model], [First name]";
      x.email[2].openings[0].text = "It's [Your name] again.\n\nQuick one about the [Model].";
      x.models.mustang.label = "Ford Mustang";
    });
    const q = questionsFor(2, "personal", msgModel("mustang", c)!, c).find((x) => x.suggested)!.text;
    expect(q).toMatch(/particular Ford Mustang spec/);
    const b = buildMessage(ready({ modelKey: "mustang", question: q }), FREDDY, [], TODAY, c);
    expect(b.subject).toBe("About your Ford Mustang, James");
    expect(b.paras.slice(0, 3)).toEqual(["Hi James,", "It's Freddy again.", "Quick one about the Ford Mustang."]);
  });

  it("drops the question step when a layout has no [Question]", () => {
    const c = edit((x) => { x.email[2].template = x.email[2].template.replace("[Question]", ""); });
    const b = buildMessage(ready({ question: null }), FREDDY, [], TODAY, c);
    expect(b.missing).toEqual([]);
    expect(b.needsQuestion).toBe(false);
  });

  it("never reads what an exec typed as a placeholder", () => {
    const b = buildMessage(ready({ extra: "Ask me about [Question] or [Model]" }), FREDDY, [], TODAY);
    expect(b.paras).toContain("Ask me about [Question] or [Model]");
  });

  it("can send a model to another model's questions, and mark one electric", () => {
    const c = edit((x) => { x.models.mustang = { label: "Mustang", set: "ev", electric: true }; });
    expect(questionsFor(1, "personal", msgModel("mustang", c)!, c).find((q) => q.suggested)?.text).toBe("What made you start looking at electric cars?");
    expect(questionsFor(2, "business", msgModel("mustang", c)!, c).some((q) => /tax benefits/.test(q.text))).toBe(true);
  });

  it("catches a placeholder it can't fill, an empty question and a missing ending", () => {
    const c = edit((x) => {
      x.email[1].openings[0].text = "Hi [Customer]";
      x.questions.kuga.late.why[0].text = " ";
      x.whatsapp[2][0].endings = [];
      x.offers[3] = "Runs until [Valid until]";
    });
    const p = configProblems(c);
    expect(p.map((x) => x.tab)).toEqual(["email", "whatsapp", "questions", "extras"]);
    expect(p[0].text).toMatch(/^\[Customer\] isn't something it can fill in/);
    expect(unknownTokens("Hi [ first  NAME ] and [Model]", ["First name", "Model"])).toEqual([]);
  });

  it("falls back to the standard for anything stored in the wrong shape", () => {
    const c = normaliseConfig({ email: { 2: { subject: 7, openings: "nope" } }, models: { puma: { set: "nonsense" } }, whatsapp: { 1: [{ id: "a", text: "Hi" }, { id: "a", text: "Yo" }] } });
    expect(c.email[2].subject).toBe(DEFAULT_CONFIG.email[2].subject);
    expect(c.email[2].openings).toEqual(DEFAULT_CONFIG.email[2].openings);
    expect(c.models.puma.set).toBe("puma");
    expect(c.whatsapp[1].map((s) => s.id)).toEqual(["a", "a-2"]);
  });
});
