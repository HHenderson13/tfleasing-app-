"use client";

// The customer's copy of a Ranger comparison. Page 1 is the answer and every
// figure side by side; page 2 is why each Ranger is taxed as it is, the
// workings and the rates, so anyone can check it by hand. Loaded only when
// Export PDF is pressed.
//
// Set in Geist from public/fonts (SIL Open Font Licence), like the fuel
// comparison: it carries £, −, × and ₂. Never set lineHeight on <Page>: it
// silently drops the fixed footer.

import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { pounds, type BreakdownSection, type Comparison, type VehicleResult, type WorkingsStep } from "@/lib/ranger-tax";

const origin = typeof window !== "undefined" ? window.location.origin : "";
Font.register({
  family: "Geist",
  fonts: [
    { src: `${origin}/fonts/Geist-Regular.ttf`, fontWeight: 400 },
    { src: `${origin}/fonts/Geist-Medium.ttf`, fontWeight: 500 },
    { src: `${origin}/fonts/Geist-SemiBold.ttf`, fontWeight: 600 },
    { src: `${origin}/fonts/Geist-Bold.ttf`, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface RangerPdfInput {
  customerName: string;
  preparedBy: string;
  date: string;
  ratesLabel: string;
  termMonths: number;
  settingsLine: string;
  comparison: Comparison;
  /** Each Ranger's number on the page, so the PDF and the screen agree. */
  numbers: number[];
  sections: BreakdownSection[];
  rules: { title: string; text: string }[];
  workings: WorkingsStep[];
  sources: { label: string; detail: string }[];
}

const C = {
  ink: "#0f172a", body: "#334155", muted: "#64748b", faint: "#94a3b8", line: "#e2e8f0", wash: "#f8fafc",
  onInk: "#cbd5e1", onInkMuted: "#94a3b8", track: "#1e293b",
  car: "#d97706", carText: "#b45309", carWash: "#fffbeb", carRing: "#fde68a",
  van: "#059669", vanText: "#047857", vanWash: "#ecfdf5", vanRing: "#a7f3d0", vanLight: "#6ee7b7",
};

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 40, fontFamily: "Geist", fontSize: 8.5, color: C.body },
  kicker: { fontSize: 7, fontWeight: 600, color: C.muted, letterSpacing: 1.3 },
  h2: { fontSize: 9.5, fontWeight: 600, color: C.ink, marginBottom: 5 },
  card: { borderWidth: 0.75, borderColor: C.line, borderRadius: 8 },
  footer: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
});

const colour = (v: VehicleResult) => (v.taxClass === "car" ? C.car : C.van);

function Dot({ fill, size = 6 }: { fill: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill }} />;
}

function ClassPill({ v }: { v: VehicleResult }) {
  const car = v.taxClass === "car";
  return (
    <View style={{ alignSelf: "flex-end", backgroundColor: car ? C.carWash : C.vanWash, borderWidth: 0.5, borderColor: car ? C.carRing : C.vanRing, borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4, marginTop: 3 }}>
      <Text style={{ fontSize: 6.5, fontWeight: 600, color: car ? C.carText : C.vanText }}>{car ? "TAXED AS A CAR" : "TAXED AS A VAN"}</Text>
    </View>
  );
}

function Footer({ d }: { d: RangerPdfInput }) {
  return (
    <View style={s.footer} fixed>
      <Text>TrustFord Leasing · Ranger tax comparison{d.customerName ? ` for ${d.customerName}` : ""}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Header({ d, title, big }: { d: RangerPdfInput; title: string; big: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={s.kicker}>RANGER TAX COMPARISON · {d.ratesLabel} TAX YEAR</Text>
        <Text style={{ fontSize: big ? 21 : 16, fontWeight: 600, color: C.ink, marginTop: 4, lineHeight: 1.15, letterSpacing: big ? -0.3 : -0.2 }}>{title}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{big ? d.date : d.customerName || d.date}</Text>
        {big ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>Prepared by {d.preparedBy}</Text> : <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{d.customerName ? d.date : ""}</Text>}
        {big ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>TrustFord Leasing</Text> : null}
      </View>
    </View>
  );
}

function HeroBar({ v, n, max }: { v: VehicleResult; n: number; max: number }) {
  return (
    <View style={{ marginTop: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 7.6, color: C.onInk }}>{n}. {v.name}</Text>
        <Text style={{ fontSize: 7.6, fontWeight: 600, color: "#ffffff" }}>{pounds(v.together.annual)}</Text>
      </View>
      <View style={{ height: 4.5, borderRadius: 2.25, backgroundColor: C.track, marginTop: 3 }}>
        <View style={{ height: 4.5, borderRadius: 2.25, backgroundColor: colour(v), width: `${Math.max(2, (v.together.annual / max) * 100)}%` }} />
      </View>
    </View>
  );
}

/** Who saves what: the driver or the business, a year and a month. */
function WhoSaves({ who, annual, monthly }: { who: string; annual: number; monthly: number }) {
  const more = annual < -0.5;
  return (
    <View style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 7, paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={{ fontSize: 6.8, fontWeight: 600, letterSpacing: 0.9, color: more ? "#fcd34d" : C.vanLight }}>{(more ? `${who} pays more` : `${who} saves`).toUpperCase()}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
        <Text style={{ fontSize: 19, fontWeight: 600, color: "#ffffff", letterSpacing: -0.4 }}>{pounds(Math.abs(annual))}</Text>
        <Text style={{ fontSize: 8, color: C.onInk, marginLeft: 4 }}>a year</Text>
      </View>
      <Text style={{ fontSize: 8.5, color: C.onInk, marginTop: 3 }}>
        <Text style={{ fontWeight: 600, color: "#ffffff" }}>{pounds(Math.abs(monthly))}</Text> a month
      </Text>
    </View>
  );
}

/** One line of the workings; an indented line is a sub-line of the one above. */
function WorkLine({ l }: { l: string }) {
  const sub = l.startsWith("  ");
  return <Text style={{ fontSize: 6.7, color: sub ? C.muted : C.body, marginLeft: sub ? 8 : 0, lineHeight: 1.4 }}>{l.trim()}</Text>;
}

/** Figures side by side, one column per Ranger, with the same rows as the screen. */
function FiguresTable({ d, sections, labelFlex }: { d: RangerPdfInput; sections: BreakdownSection[]; labelFlex: number }) {
  const c = d.comparison;
  return (
    <View style={[s.card, { marginTop: 8, paddingHorizontal: 10, paddingBottom: 3 }]}>
      <View style={{ flexDirection: "row", paddingTop: 6, paddingBottom: 5, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
        <View style={{ flex: labelFlex }} />
        {c.vehicles.map((v, i) => (
          <View key={i} style={{ flex: 1, paddingLeft: 6, alignItems: "flex-end" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Dot fill={colour(v)} size={5} />
              <Text style={{ fontSize: 7, color: C.muted }}>{i === 0 ? "Their choice" : `Option ${d.numbers[i] ?? i + 1}`}</Text>
            </View>
            <Text style={{ fontSize: 7.8, fontWeight: 600, color: C.ink, textAlign: "right", marginTop: 2, lineHeight: 1.25 }}>{v.name}</Text>
            <ClassPill v={v} />
          </View>
        ))}
      </View>
      {sections.map((sec) => (
        <View key={sec.title} wrap={false}>
          <Text style={{ fontSize: 6.6, fontWeight: 600, color: sec.title.startsWith("Saving") ? C.vanText : C.muted, letterSpacing: 0.9, marginTop: 5, paddingBottom: 2.5, borderBottomWidth: 0.5, borderBottomColor: C.line }}>{sec.title.toUpperCase()}</Text>
          {sec.rows.map((r, j) => (
            <View key={r.label} style={{ flexDirection: "row", paddingVertical: 2.1, borderBottomWidth: j < sec.rows.length - 1 ? 0.5 : 0, borderBottomColor: C.line }}>
              <Text style={{ flex: labelFlex, fontSize: 7.4, fontWeight: r.strong ? 600 : 400, color: r.strong ? C.ink : C.muted }}>
                {r.label}{r.hint ? <Text style={{ fontWeight: 400, color: C.faint }}>{`, ${r.hint}`}</Text> : null}
              </Text>
              {r.values.map((x, i) => {
                const save = x.startsWith("Saves");
                const more = x.endsWith(" more");
                return (
                  <Text key={i} style={{ flex: 1, paddingLeft: 6, fontSize: 7.4, textAlign: "right", fontWeight: r.strong ? 600 : 400, color: save ? C.vanText : more ? C.carText : r.strong ? C.ink : C.body }}>{x}</Text>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function RangerComparisonPdf(d: RangerPdfInput) {
  const c = d.comparison;
  const first = c.vehicles[0];
  const b = c.best;
  const best = b != null ? c.vehicles[b] : null;
  const max = Math.max(...c.vehicles.map((v) => v.together.annual), 1);
  const cols = c.vehicles.length;
  const labelFlex = cols >= 4 ? 1.35 : 1.6;
  const page1 = d.sections.filter((x) => x.title !== "Buying it").map((x) => ({ ...x, rows: x.rows.filter((r) => r.label !== "Taxed as") }));
  const buying = d.sections.find((x) => x.title === "Buying it");
  const vehicleSteps = d.workings.filter((w) => w.title !== "The difference");
  const difference = d.workings.find((w) => w.title === "The difference");

  return (
    <Document title={`Ranger tax comparison${d.customerName ? `, ${d.customerName}` : ""}`} author="TrustFord Leasing" subject="Ranger tax comparison" creator="TF Leasing">
      <Page size="A4" style={s.page}>
        <Header d={d} title={d.customerName || "Ranger tax comparison"} big />

        {/* The answer */}
        <View style={{ marginTop: 12, backgroundColor: C.ink, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, flexDirection: "row", gap: 20 }}>
          <View style={{ flex: 1.1 }}>
            {best && b != null ? (
              <>
                <Text style={{ fontSize: 10, fontWeight: 600, color: "#ffffff", lineHeight: 1.3 }}>The {best.name} saves</Text>
                <View style={{ flexDirection: "row", gap: 7, marginTop: 7 }}>
                  <WhoSaves who="The driver" annual={c.split[b].driver.annual} monthly={c.split[b].driver.monthly} />
                  <WhoSaves who="The business" annual={c.split[b].business.annual} monthly={c.split[b].business.monthly} />
                </View>
                <Text style={{ fontSize: 8.5, color: C.onInk, marginTop: 7 }}>
                  {"Together "}<Text style={{ fontSize: 11, fontWeight: 600, color: "#ffffff" }}>{pounds(c.savings[b])}</Text>{" a year, "}
                  <Text style={{ fontWeight: 600, color: "#ffffff" }}>{pounds(c.savingsMonthly[b])}</Text>{" a month"}
                </Text>
                <Text style={{ fontSize: 7.6, color: C.onInkMuted, marginTop: 3, lineHeight: 1.4 }}>{`Against the ${first.name}, at ${d.ratesLabel} rates.`}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: 600, color: "#ffffff", lineHeight: 1.3 }}>{c.headline}</Text>
                <Text style={{ fontSize: 8.5, color: C.onInk, marginTop: 6, lineHeight: 1.45 }}>
                  {`The driver pays ${pounds(first.driver.monthly)} a month and the business ${pounds(first.business.annual)} a year.`}
                </Text>
              </>
            )}
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ fontSize: 6.8, fontWeight: 600, color: C.onInkMuted, letterSpacing: 1.1 }}>TAX A YEAR, DRIVER AND BUSINESS</Text>
            {c.vehicles.map((v, i) => <HeroBar key={i} v={v} n={d.numbers[i] ?? i + 1} max={max} />)}
          </View>
        </View>

        <Text style={{ fontSize: 7.2, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>{d.settingsLine}</Text>

        {/* Every figure, side by side. "Taxed as" is in each column's label; buying it goes on page 2. */}
        <FiguresTable d={d} sections={page1} labelFlex={labelFlex} />

        <Text style={{ marginTop: 8, fontSize: 6.5, color: C.muted, lineHeight: 1.45 }}>
          {/* One string: the React Compiler drops a space after {value} in JSX text holding an &apos; entity. */}
          {`For comparison only, and not tax advice. Figures use HMRC's ${d.ratesLabel} rates and Ford's list prices effective 5 February 2026, at the income tax and business tax rates shown. The driver's and the business's own circumstances decide what they pay, and rates change each April. The business's tax is shown net of the tax relief it gets on it.`}
        </Text>
        <Footer d={d} />
      </Page>

      {/* Page 2: why, and how it was worked out */}
      <Page size="A4" style={s.page}>
        <Header d={d} title={buying ? "Buying it, why, and the workings" : "Why, and how it's worked out"} big={false} />

        {buying ? (
          <View style={{ marginTop: 12 }} wrap={false}>
            <Text style={s.h2}>Buying it: tax relief on the purchase</Text>
            <FiguresTable d={d} sections={[buying]} labelFlex={labelFlex} />
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
              A van&apos;s allowances are all in year one; a car&apos;s come at 6% a year on the reducing balance, so most of its relief comes later. Timing, not an extra saving.
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={s.h2}>Why each Ranger is taxed the way it is</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
            {d.rules.map((r) => (
              <View key={r.title} style={{ width: "50%", paddingHorizontal: 6, marginTop: 4 }}>
                <View style={{ borderTopWidth: 1.5, borderTopColor: C.line, paddingTop: 5 }}>
                  <Text style={{ fontSize: 8, fontWeight: 600, color: C.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: 7, color: C.body, lineHeight: 1.45, marginTop: 2 }}>{r.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={s.h2}>The workings</Text>
          <Text style={{ fontSize: 7.8, color: C.muted, marginBottom: 6 }}>Every step from the price list to the answer, so it can be checked by hand. Figures a year unless shown.</Text>
          <View style={{ backgroundColor: C.wash, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 }}>
              {vehicleSteps.map((w, i) => (
                <View key={w.title} style={{ width: "50%", paddingHorizontal: 8, marginTop: i > 1 ? 8 : 0 }} wrap={false}>
                  <Text style={{ fontSize: 8, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{w.title}</Text>
                  {w.lines.map((l, j) => <WorkLine key={j} l={l} />)}
                </View>
              ))}
            </View>
            {difference ? (
              <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.line }} wrap={false}>
                <Text style={{ fontSize: 8, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{difference.title}</Text>
                {difference.lines.map((l, j) => <WorkLine key={j} l={l} />)}
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={s.h2}>Rates used, {d.ratesLabel}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
            {d.sources.map((x) => (
              <View key={x.label} style={{ width: "50%", paddingHorizontal: 6, flexDirection: "row", paddingVertical: 2.2 }}>
                <Text style={{ width: 92, fontSize: 7, fontWeight: 600, color: C.ink }}>{x.label}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: C.body, lineHeight: 1.4 }}>{x.detail}</Text>
              </View>
            ))}
          </View>
        </View>
        <Footer d={d} />
      </Page>
    </Document>
  );
}
