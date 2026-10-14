"use client";

// The customer's copy of a fuel comparison: one A4 page with the answer,
// both vehicles, every price with its source and date, and the workings —
// so anyone can check it by hand. Loaded only when Export PDF is pressed.
// Helvetica covers Latin-1 only: "−" becomes "-", "CO₂" is written CO2.

import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ComparisonResult, CustomerType, FuelType, Segment } from "@/lib/fuel-calc";

Font.registerHyphenationCallback((word) => [word]);

export interface FuelPdfInput {
  customerName: string;
  preparedBy: string;
  date: string;
  segment: Segment;
  customer: CustomerType;
  termMonths: number;
  annualMiles: number;
  ice: { name: string; fuel: FuelType; mpg: number; basis: string };
  ev: { name: string; milesPerKwh: number; basis: string };
  result: ComparisonResult;
  verdict: { tone: "saving" | "cost" | "level"; headline: string };
  workings: { title: string; lines: string[] }[];
  prices: { label: string; short: string; unit: "litre" | "kWh"; published: number; paid: number; incVat: boolean; share: number | null; source: string; period: string | null }[];
}

const C = { ink: "#0f172a", body: "#334155", muted: "#64748b", faint: "#94a3b8", line: "#e2e8f0", wash: "#f8fafc", good: "#047857", goodWash: "#ecfdf5", warn: "#b45309", warnWash: "#fffbeb", petrol: "#b45309", ev: "#047857" };

const tx = (s: string) => s.replace(/−/g, "-").replace(/CO₂/g, "CO2").replace(/₂/g, "2");
const money = (n: number, dp = 0) => `${n < 0 ? "-" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pence = (n: number, dp = 1) => `${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}p`;

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, color: C.body },
  kicker: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 1.2 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 2 },
  label: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.6 },
  box: { borderWidth: 0.75, borderColor: C.line, borderRadius: 6, padding: 10 },
  th: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.5 },
  td: { fontSize: 9, color: C.body },
  section: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 5 },
  footer: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 5 },
});

function VehicleBox({ title, colour, name, lines, monthly, perMile }: { title: string; colour: string; name: string; lines: string[]; monthly: number; perMile: number }) {
  return (
    <View style={[s.box, { flex: 1, borderTopWidth: 3, borderTopColor: colour }]}>
      <Text style={s.label}>{title.toUpperCase()}</Text>
      <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 3 }}>{tx(name)}</Text>
      {lines.map((l) => <Text key={l} style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{tx(l)}</Text>)}
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 8, gap: 4 }}>
        <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink }}>{money(monthly)}</Text>
        <Text style={{ fontSize: 8.5, color: C.muted }}>a month · {pence(perMile)} a mile</Text>
      </View>
    </View>
  );
}

function Row({ cells, bold, shade }: { cells: ReactNode[]; bold?: boolean; shade?: boolean }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.line, backgroundColor: shade ? C.wash : undefined }}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.td, { flex: i === 0 ? 1.6 : 1, textAlign: i === 0 ? "left" : "right" }, bold ? { fontFamily: "Helvetica-Bold", color: C.ink } : {}]}>{c}</Text>
      ))}
    </View>
  );
}

export function FuelComparisonPdf(d: FuelPdfInput) {
  const r = d.result;
  const fuel = d.ice.fuel === "petrol" ? "Petrol" : "Diesel";
  const saving = d.verdict.tone === "saving";
  const tone = d.verdict.tone === "saving" ? { fg: C.good, bg: C.goodWash } : d.verdict.tone === "cost" ? { fg: C.warn, bg: C.warnWash } : { fg: C.ink, bg: C.wash };
  const mix = d.prices.filter((p) => p.share != null && p.share > 0).map((p) => `${p.share}% ${p.short.toLowerCase()}`).join(", ");
  return (
    <Document title={`Fuel cost comparison${d.customerName ? ` — ${d.customerName}` : ""}`} author="TrustFord Leasing" subject="Fuel cost comparison">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.2, borderBottomColor: C.ink, paddingBottom: 8 }}>
          <View>
            <Text style={s.kicker}>FUEL COST COMPARISON</Text>
            <Text style={s.h1}>{d.customerName ? tx(d.customerName) : `Petrol or diesel against electric`}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 9, color: C.ink, fontFamily: "Helvetica-Bold" }}>{d.date}</Text>
            <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>Prepared by {tx(d.preparedBy)}, TrustFord Leasing</Text>
          </View>
        </View>

        {/* The answer */}
        <View style={{ marginTop: 14, borderRadius: 6, backgroundColor: tone.bg, padding: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: tone.fg }}>{tx(d.verdict.headline)}</Text>
          <Text style={{ fontSize: 9.5, color: C.body, marginTop: 4 }}>
            {money(Math.abs(r.saving.annual))} a year · {money(Math.abs(r.saving.overTerm))} over {d.termMonths} months ·{" "}
            {d.annualMiles.toLocaleString("en-GB")} miles a year · {d.customer === "business" ? "business prices, reclaimable VAT excluded" : "prices include VAT"}
          </Text>
        </View>

        {/* The two vehicles */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <VehicleBox title={`Current ${d.segment} — ${fuel.toLowerCase()}`} colour={C.petrol} name={d.ice.name}
            lines={[`${d.ice.mpg.toFixed(1)} MPG — ${d.ice.basis}`, `${fuel} at ${r.ice.effectivePrice.toFixed(2)}p a litre`]}
            monthly={r.ice.monthly} perMile={r.ice.pencePerMile} />
          <VehicleBox title={`Electric ${d.segment}`} colour={C.ev} name={d.ev.name}
            lines={[`${d.ev.milesPerKwh.toFixed(1)} miles per kWh — ${d.ev.basis}`, `Charging: ${mix || "—"} — ${r.ev.blendedPence.toFixed(2)}p a kWh blended`]}
            monthly={r.ev.monthly} perMile={r.ev.pencePerMile} />
        </View>

        {/* Costs */}
        <View style={{ marginTop: 12 }}>
          <Text style={s.section}>Running costs</Text>
          <View style={[s.box, { padding: 0 }]}>
            <View style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
              {["", "A mile", "A month", "A year", `Over ${d.termMonths} months`].map((h, i) => (
                <Text key={h || "x"} style={[s.th, { flex: i === 0 ? 1.6 : 1, textAlign: i === 0 ? "left" : "right" }]}>{h.toUpperCase()}</Text>
              ))}
            </View>
            <Row cells={[fuel, pence(r.ice.pencePerMile), money(r.ice.monthly, 2), money(r.ice.annual), money(r.ice.overTerm)]} />
            <Row cells={["Electric", pence(r.ev.pencePerMile), money(r.ev.monthly, 2), money(r.ev.annual), money(r.ev.overTerm)]} />
            <Row bold shade cells={[saving ? "Electric saves" : d.verdict.tone === "cost" ? "Electric costs more by" : "Difference",
              pence(Math.abs(r.saving.pencePerMile)), money(Math.abs(r.saving.monthly), 2), money(Math.abs(r.saving.annual)), money(Math.abs(r.saving.overTerm))]} />
          </View>
        </View>

        {/* Prices */}
        <View style={{ marginTop: 12 }}>
          <Text style={s.section}>Prices used</Text>
          <View style={[s.box, { padding: 0 }]}>
            <View style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
              {["Price", "Share", "Paid", "Source"].map((h, i) => (
                <Text key={h} style={[s.th, { flex: [1.3, 0.5, 0.8, 2.4][i], textAlign: i === 0 || i === 3 ? "left" : "right", paddingLeft: i === 3 ? 8 : 0 }]}>{h.toUpperCase()}</Text>
              ))}
            </View>
            {d.prices.map((p) => (
              <View key={p.label} style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                <Text style={[s.td, { flex: 1.3 }]}>{p.label}</Text>
                <Text style={[s.td, { flex: 0.5, textAlign: "right" }]}>{p.share == null ? "" : `${p.share}%`}</Text>
                <Text style={[s.td, { flex: 0.8, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.ink }]}>{p.paid.toFixed(2)}p/{p.unit === "litre" ? "L" : "kWh"}</Text>
                <Text style={[s.td, { flex: 2.4, paddingLeft: 8, fontSize: 7.5, color: C.muted }]}>
                  {tx(p.source)}{p.period ? ` · ${p.period}` : ""} · {p.incVat ? "incl. VAT" : "ex VAT"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Workings */}
        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={s.section}>The workings</Text>
          <View style={[s.box, { backgroundColor: C.wash, borderColor: C.wash }]}>
            {d.workings.map((w) => (
              <View key={w.title} style={{ marginBottom: 4 }}>
                <Text style={[s.label, { marginBottom: 1.5 }]}>{w.title.toUpperCase()}</Text>
                {w.lines.map((l, i) => <Text key={i} style={{ fontSize: 7.8, color: l.startsWith("  ") ? C.muted : C.body, marginLeft: l.startsWith("  ") ? 10 : 0, lineHeight: 1.35 }}>{tx(l.trim())}</Text>)}
              </View>
            ))}
          </View>
        </View>

        <Text style={{ marginTop: 10, fontSize: 6.8, color: C.muted, lineHeight: 1.4 }}>
          For comparison purposes only — this is not a formal quotation. Figures are estimates based on official (WLTP) efficiency figures
          and UK average prices on the date shown, and may not reflect real-life results. Costs change with fuel and electricity prices, driving
          style, journey type and vehicle load. Electric range and efficiency vary with temperature, driver behaviour, vehicle maintenance and
          battery age.
        </Text>

        <View style={s.footer} fixed>
          <Text>TrustFord Leasing · Fuel cost comparison · {d.date}</Text>
          <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")} />
        </View>
      </Page>
    </Document>
  );
}
