"use client";

// The customer's copy of a fuel comparison: one A4 page with the answer,
// both vehicles, every price with its source and date, and the workings, so
// anyone can check it by hand. Loaded only when Export PDF is pressed.
//
// Set in Geist, the app's own typeface, from public/fonts (SIL Open Font
// Licence). It carries £, −, ×, ÷ and ₂, so nothing needs swapping out.

import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ComparisonResult, CustomerType, FuelType, PriceKey, Segment } from "@/lib/fuel-calc";

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

export interface FuelPdfInput {
  customerName: string;
  preparedBy: string;
  date: string;
  segment: Segment;
  customer: CustomerType;
  termMonths: number;
  annualMiles: number;
  ice: { name: string; detail: string | null; fuel: FuelType; mpg: number; basis: string; nedc: boolean };
  ev: { name: string; detail: string | null; milesPerKwh: number; basis: string };
  result: ComparisonResult;
  tone: "saving" | "cost" | "level";
  headline: string;
  workings: { title: string; lines: string[] }[];
  prices: { key: PriceKey; label: string; unit: "litre" | "kWh"; paid: number; incVat: boolean; share: number | null; source: string; period: string | null }[];
}

const C = {
  ink: "#0f172a", body: "#334155", muted: "#64748b", faint: "#94a3b8", line: "#e2e8f0", wash: "#f8fafc",
  onInk: "#cbd5e1", onInkMuted: "#94a3b8",
  fossil: "#d97706", fossilText: "#b45309",
  electric: "#059669", electricText: "#047857", electricLight: "#6ee7b7", amberLight: "#fcd34d",
  amberWash: "#fffbeb", amberInk: "#78350f",
};
const CHARGE_COLOUR: Record<string, string> = { home_overnight: "#065f46", home_standard: "#34d399", depot: "#075985", public_rapid: "#8b5cf6" };

const money = (n: number, dp = 0) => `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pence = (n: number, dp = 1) => `${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}p`;
const co2 = (t: string) => t.replace(/CO2/g, "CO₂");

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 42, fontFamily: "Geist", fontSize: 8.5, color: C.body },
  kicker: { fontSize: 7, fontWeight: 600, color: C.muted, letterSpacing: 1.3 },
  h2: { fontSize: 9.5, fontWeight: 600, color: C.ink, marginBottom: 5 },
  card: { borderWidth: 0.75, borderColor: C.line, borderRadius: 8 },
  th: { fontSize: 7, fontWeight: 500, color: C.muted },
  footer: { position: "absolute", bottom: 18, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
});

function Dot({ colour, size = 6 }: { colour: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }} />;
}

function KeyValue({ k, children }: { k: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 4 }}>
      <Text style={{ width: 58, fontSize: 7.5, color: C.muted }}>{k}</Text>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Text style={{ fontSize: 8, color: C.body }}>{children}</Text> : children}</View>
    </View>
  );
}

function VehicleCard({ kicker, colour, name, detail, figure, unit, rows, note }: {
  kicker: string; colour: string; name: string; detail: string | null; figure: string; unit: string; rows: ReactNode; note?: ReactNode;
}) {
  return (
    <View style={[s.card, { flex: 1, padding: 13 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Dot colour={colour} />
        <Text style={s.kicker}>{kicker}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{name}</Text>
          {detail && <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{detail}</Text>}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>{figure}</Text>
          <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{unit}</Text>
        </View>
      </View>
      <View style={{ marginTop: 7, paddingTop: 3, borderTopWidth: 0.5, borderTopColor: C.line }}>{rows}</View>
      {note}
    </View>
  );
}

function Footer({ d }: { d: FuelPdfInput }) {
  return (
    <View style={s.footer} fixed>
      <Text>TrustFord Leasing · Fuel cost comparison{d.customerName ? ` for ${d.customerName}` : ""}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function HeroBar({ label, colour, value, max }: { label: string; colour: string; value: number; max: number }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 8, color: C.onInk }}>{label}</Text>
        <Text style={{ fontSize: 8, fontWeight: 600, color: "#ffffff" }}>{money(value)} a month</Text>
      </View>
      <View style={{ height: 5, borderRadius: 2.5, backgroundColor: "#1e293b", marginTop: 3.5 }}>
        <View style={{ height: 5, borderRadius: 2.5, backgroundColor: colour, width: `${Math.max(2, (value / max) * 100)}%` }} />
      </View>
    </View>
  );
}

export function FuelComparisonPdf(d: FuelPdfInput) {
  const r = d.result;
  const fuel = d.ice.fuel === "petrol" ? "Petrol" : "Diesel";
  const fuelPrice = d.prices.find((p) => p.key === d.ice.fuel);
  const charging = d.prices.filter((p) => p.share != null && p.share > 0);
  const cost = d.tone === "cost";
  const accent = cost ? C.amberLight : C.electricLight;
  const max = Math.max(r.ice.monthly, r.ev.monthly, 1);
  const vat = d.customer === "business" ? "Business prices, reclaimable VAT excluded" : "Prices include VAT";
  const title = d.customerName || `${fuel} against electric`;

  return (
    <Document title={`Fuel cost comparison${d.customerName ? `, ${d.customerName}` : ""}`} author="TrustFord Leasing" subject="Fuel cost comparison" creator="TF Leasing">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.kicker}>FUEL COST COMPARISON</Text>
            <Text style={{ fontSize: 21, fontWeight: 600, color: C.ink, marginTop: 4, lineHeight: 1.15, letterSpacing: -0.3 }}>{title}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{d.date}</Text>
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>Prepared by {d.preparedBy}</Text>
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>TrustFord Leasing</Text>
          </View>
        </View>

        {/* The answer */}
        <View style={{ marginTop: 16, backgroundColor: C.ink, borderRadius: 10, paddingVertical: 18, paddingHorizontal: 18, flexDirection: "row", gap: 26 }}>
          <View style={{ flex: 1.15 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 500, color: accent }}>
              {d.tone === "saving" ? "Electric saves" : cost ? "Electric costs more by" : "Electric costs about the same"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 3 }}>
              <Text style={{ fontSize: 34, fontWeight: 600, color: "#ffffff", letterSpacing: -0.8, lineHeight: 1.05 }}>{money(Math.abs(r.saving.monthly))}</Text>
              <Text style={{ fontSize: 10, color: C.onInk, marginLeft: 5 }}>a month</Text>
            </View>
            <Text style={{ fontSize: 9, color: C.onInk, marginTop: 5 }}>
              <Text style={{ fontWeight: 600, color: "#ffffff" }}>{money(Math.abs(r.saving.annual))}</Text> a year, and{" "}
              <Text style={{ fontWeight: 600, color: "#ffffff" }}>{money(Math.abs(r.saving.overTerm))}</Text> over {d.termMonths} months
            </Text>
            <Text style={{ fontSize: 7.5, color: C.onInkMuted, marginTop: 4 }}>
              {d.annualMiles.toLocaleString("en-GB")} miles a year · {vat}
            </Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ fontSize: 7, fontWeight: 600, color: C.onInkMuted, letterSpacing: 1.1 }}>MONTHLY RUNNING COST</Text>
            <HeroBar label={fuel} colour={C.fossil} value={r.ice.monthly} max={max} />
            <HeroBar label="Electric" colour={C.electric} value={r.ev.monthly} max={max} />
          </View>
        </View>

        {/* The two vehicles */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <VehicleCard kicker={`CURRENT ${d.segment.toUpperCase()}`} colour={C.fossil} name={d.ice.name} detail={d.ice.detail}
            figure={d.ice.mpg.toFixed(1)} unit="MPG"
            rows={<>
              <KeyValue k="Efficiency">{co2(d.ice.basis)}</KeyValue>
              <KeyValue k={fuel}>{`${pence(fuelPrice?.paid ?? r.ice.effectivePrice, 2)} a litre, ${fuelPrice?.incVat === false ? "ex VAT" : "incl. VAT"}`}</KeyValue>
              <KeyValue k="Cost">{`${pence(r.ice.pencePerMile)} a mile`}</KeyValue>
            </>}
            note={d.ice.nedc ? (
              <View style={{ marginTop: 6, backgroundColor: C.amberWash, borderRadius: 5, paddingVertical: 4, paddingHorizontal: 7 }}>
                <Text style={{ fontSize: 7, color: C.amberInk }}>
                  Tested on NEDC, the older test, which flatters economy. The saving shown is if anything on the low side.
                </Text>
              </View>
            ) : undefined} />
          <VehicleCard kicker={`ELECTRIC ${d.segment.toUpperCase()}`} colour={C.electric} name={d.ev.name} detail={d.ev.detail}
            figure={d.ev.milesPerKwh.toFixed(1)} unit="miles per kWh"
            rows={<>
              <KeyValue k="Efficiency">{co2(d.ev.basis)}</KeyValue>
              <KeyValue k="Charging">
                <View style={{ flexDirection: "row", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2.5, marginBottom: 3 }}>
                  {charging.map((p, i) => (
                    <View key={p.key} style={{ flexGrow: p.share!, flexBasis: 0, backgroundColor: CHARGE_COLOUR[p.key], marginLeft: i ? 1 : 0 }} />
                  ))}
                </View>
                <Text style={{ fontSize: 8, color: C.body }}>{charging.map((p) => `${p.share}% ${p.label.toLowerCase()}`).join(", ")}</Text>
              </KeyValue>
              <KeyValue k="Cost">{`${pence(r.ev.blendedPence, 2)} a kWh blended, ${pence(r.ev.pencePerMile)} a mile`}</KeyValue>
            </>} />
        </View>

        {/* Running costs */}
        <View style={{ marginTop: 18 }}>
          <Text style={s.h2}>Running costs</Text>
          <View style={[s.card, { paddingHorizontal: 10 }]}>
            <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              {["", fuel, "Electric", cost ? "Electric costs more" : "Electric saves"].map((h, i) => (
                <Text key={i} style={[s.th, { flex: i === 0 ? 1.2 : 1, textAlign: i === 0 ? "left" : "right" }]}>{h}</Text>
              ))}
            </View>
            {([
              ["A mile", pence(r.ice.pencePerMile), pence(r.ev.pencePerMile), pence(Math.abs(r.saving.pencePerMile))],
              ["A month", money(r.ice.monthly, 2), money(r.ev.monthly, 2), money(Math.abs(r.saving.monthly), 2)],
              ["A year", money(r.ice.annual), money(r.ev.annual), money(Math.abs(r.saving.annual))],
              [`Over ${d.termMonths} months`, money(r.ice.overTerm), money(r.ev.overTerm), money(Math.abs(r.saving.overTerm))],
            ] as const).map(([label, a, b, c], i, all) => (
              <View key={label} style={{ flexDirection: "row", paddingVertical: 5.5, borderBottomWidth: i < all.length - 1 ? 0.5 : 0, borderBottomColor: C.line }}>
                <Text style={{ flex: 1.2, fontSize: 8.5, color: C.muted }}>{label}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, textAlign: "right", color: C.body }}>{a}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, textAlign: "right", color: C.body }}>{b}</Text>
                <Text style={{ flex: 1, fontSize: 8.5, textAlign: "right", fontWeight: 600, color: cost ? C.fossilText : C.electricText }}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Prices */}
        <View style={{ marginTop: 18 }}>
          <Text style={s.h2}>Prices used</Text>
          <View style={[s.card, { paddingHorizontal: 10 }]}>
            <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              {["", "Share", "Price paid", "Source"].map((h, i) => (
                <Text key={i} style={[s.th, { flex: [1.2, 0.45, 0.9, 2.6][i], textAlign: i === 1 || i === 2 ? "right" : "left", paddingLeft: i === 3 ? 14 : 0 }]}>{h}</Text>
              ))}
            </View>
            {d.prices.map((p, i) => (
              <View key={p.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 5.5, borderBottomWidth: i < d.prices.length - 1 ? 0.5 : 0, borderBottomColor: C.line }}>
                <View style={{ flex: 1.2, flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Dot colour={p.share == null ? C.fossil : CHARGE_COLOUR[p.key]} size={5} />
                  <Text style={{ fontSize: 8.5, color: C.ink }}>{p.label}</Text>
                </View>
                <Text style={{ flex: 0.45, fontSize: 8.5, textAlign: "right", color: C.body }}>{p.share == null ? "" : `${p.share}%`}</Text>
                <Text style={{ flex: 0.9, fontSize: 8.5, textAlign: "right", fontWeight: 600, color: C.ink }}>
                  {p.paid.toFixed(2)}p<Text style={{ fontWeight: 400, color: C.muted }}>/{p.unit}</Text>
                </Text>
                <Text style={{ flex: 2.6, fontSize: 7.5, color: C.muted, paddingLeft: 14 }}>
                  {p.source}{p.period ? `, ${p.period}` : ""}. {p.incVat ? "Incl. VAT" : "Ex VAT"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Footer d={d} />
      </Page>

      {/* Page 2: how it was worked out */}
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.kicker}>FUEL COST COMPARISON</Text>
            <Text style={{ fontSize: 16, fontWeight: 600, color: C.ink, marginTop: 4, letterSpacing: -0.2 }}>{"How it’s worked out"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {d.customerName ? <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{d.customerName}</Text> : null}
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{d.date}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={s.h2}>The workings</Text>
          <Text style={{ fontSize: 8, color: C.muted, marginBottom: 8 }}>Every step from the figures on page 1 to the answer, so it can be checked by hand.</Text>
          <View style={{ backgroundColor: C.wash, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 }}>
            {d.workings.map((w, i) => (
              <View key={w.title} style={{ flexDirection: "row", marginTop: i ? 9 : 0, paddingTop: i ? 9 : 0, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.line }}>
                <View style={{ width: 86, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                  <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 7, fontWeight: 600, color: C.body, lineHeight: 1 }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{w.title}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {w.lines.map((l, j) => (
                    <Text key={j} style={{ fontSize: 8.3, color: l.startsWith("  ") ? C.muted : C.body, marginLeft: l.startsWith("  ") ? 12 : 0, lineHeight: 1.55 }}>{l.trim()}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={s.h2}>About these figures</Text>
          {[
            ["Efficiency", "Both vehicles are judged on official figures: WLTP where the vehicle has one. Older vehicles were tested on NEDC, which flatters economy, so a saving against one is if anything understated. An electric vehicle's official miles per kWh is measured at the plug, so charging losses are already in it."],
            ["Prices", "UK averages, checked every day: petrol and diesel from the government's weekly road fuel prices, home electricity from the Ofgem price cap and the Octopus Go overnight rate, depot electricity from government non-domestic prices, and public rapid charging from the Zapmap Price Index."],
            ["VAT", d.customer === "business"
              ? "Business prices leave out the VAT a VAT-registered business reclaims on fuel, depot and public charging. Home electricity keeps its 5% VAT, as it isn't reclaimable on a domestic bill."
              : "Every price includes VAT, as a private customer pays it."],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", marginTop: 7 }}>
              <Text style={{ width: 86, fontSize: 8.5, fontWeight: 600, color: C.ink }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 8.3, color: C.body, lineHeight: 1.55 }}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={{ marginTop: 18, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: C.line, fontSize: 7.2, color: C.muted, lineHeight: 1.55 }}>
          For comparison only, and not a formal quotation. Figures are estimates from official efficiency figures and UK average prices on the
          date shown, and real results will differ. Running costs change with fuel and electricity prices, driving style, journey type and load.
          Electric range and efficiency also vary with temperature, maintenance and battery age.
        </Text>
        <Footer d={d} />
      </Page>
    </Document>
  );
}
