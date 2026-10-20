"use client";

// 10 at 10 as a PDF to take the department through: one A4 landscape page
// per tab, Summary first, for the period chosen on screen (Market Analysis
// is always the latest scrape). Built in the browser from the data the page
// already holds, using the same stats functions as the tabs, so a figure on
// paper is the figure on screen. "Build a breakdown" is left out, and so are
// the customer lists behind each row (user, 2026-10-12) — apart from
// Cancellations, where the list with its reasons is the point.
//
// Helvetica is one of the PDF base fonts, so nothing is downloaded, but it
// only covers Latin-1: the page's "−" minus is swapped for a hyphen (tx).
//
// Imported only when the Export PDF button is pressed — react-pdf is large.

import { Document, Font, Page, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS, formatMins } from "@/lib/business-hours";
import type { EnquiryRow } from "@/lib/enquiries";
import {
  isTransferMissing, neverContactedOwner, partitionByReportability, sameDayMissOwner, summariseResponse, type ResponseSummary,
} from "@/lib/enquiry-reporting";
import type { MarketOverview, MarketSegmentView } from "@/lib/market-overview";
import {
  SEGMENTS, avgProfit, brokerPct, budgetLines, budgetMonths, conversionPct, daysToCancel, groupOrders, groupRows, inRange, inboundPct,
  orderStatsOf, periodProgress, rewritesAcross, statsOf, topInboundExecs,
  type BudgetLine, type CreditedReOrder, type Budgets, type CancellationView, type OrderRow, type OrderStats, type Range, type ReportRow, type Stats,
} from "@/lib/ten-at-ten-report";
import {
  DEPARTMENT_COLOURS, MARKET_META, SEGMENT_META, SOURCE_COLOURS, fastestFirst, firstName, gapText, gbp, int, isProper, marketTotals, needsReason,
  ordersAdjusted, pct, scrapeWhen, share, shortDate,
} from "./shared";

export interface PdfReportInput {
  range: Range;
  today: string;
  /** "12 Oct 2026, 14:55" — when the export was made. */
  exportedAt: string;
  enquiries: ReportRow[];
  responses: EnquiryRow[];
  reportHorizon: number | null;
  orders: OrderRow[];
  deliveries: OrderRow[];
  budgets: Budgets;
  cancellations: CancellationView[];
  cancelledOrderDays: string[];
  rewriteMoves: CreditedReOrder[];
  market: MarketOverview | null;
}

// react-pdf hyphenates long words to fill lines ("bro-ker", "AVG RE-SPONSE").
// A report reads better with whole words, so lines only break between them.
Font.registerHyphenationCallback((word) => [word]);

// ─── Look ──────────────────────────────────────────────────────────────────
//
// The page's palette: slate text, one indigo headline per page, emerald for
// good and rose for bad, amber for "needs doing".

const C = {
  ink: "#0f172a", body: "#334155", muted: "#64748b", faint: "#94a3b8", line: "#e2e8f0", wash: "#f8fafc", wash2: "#f1f5f9",
  hero: "#1e1b4b", heroSub: "#c7d2fe", accent: "#4f46e5", good: "#047857", bad: "#be123c", warn: "#b45309",
};

type Tone = "good" | "bad" | "warn" | undefined;
const toneColour = (t: Tone) => (t === "good" ? C.good : t === "bad" ? C.bad : t === "warn" ? C.warn : undefined);

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 34, paddingHorizontal: 28, fontFamily: "Helvetica", fontSize: 8, color: C.body, backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.2, borderBottomColor: C.ink, paddingBottom: 6, marginBottom: 10 },
  kicker: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.accent, letterSpacing: 1.2 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 1 },
  period: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  periodNote: { fontSize: 6.5, color: C.muted, textAlign: "right", marginTop: 1 },
  footer: {
    position: "absolute", bottom: 14, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 4, fontSize: 6.5, color: C.faint,
  },
  row: { flexDirection: "row", gap: 8 },
  stack: { flexDirection: "column", gap: 8 },
  kpi: { flex: 1, borderWidth: 0.75, borderColor: C.line, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8 },
  kpiHero: { backgroundColor: C.hero, borderColor: C.hero },
  box: { borderWidth: 0.75, borderColor: C.line, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8 },
  kpiLabel: { fontSize: 5.8, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.6 },
  kpiValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 2 },
  kpiSub: { fontSize: 6.3, color: C.muted, marginTop: 1.5, lineHeight: 1.25 },
  panel: { borderWidth: 0.75, borderColor: C.line, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 8 },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  panelTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink },
  panelNote: { fontSize: 6, color: C.faint },
  th: { fontSize: 5.6, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.4 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 2.1, borderBottomWidth: 0.5, borderBottomColor: C.wash2 },
  td: { fontSize: 7.3, color: C.body },
  note: { fontSize: 6.5, color: C.muted },
  strip: { borderRadius: 4, backgroundColor: C.wash2, paddingVertical: 4, paddingHorizontal: 7, fontSize: 6.8, color: C.body },
});

/** Latin-1 only: the page's typographic minus becomes a hyphen. */
const tx = (v: string) => v.replace(/−/g, "-");
const money = (n: number | null) => tx(gbp(n));
const signedMoney = (n: number | null) => (n == null ? "—" : Math.abs(n) < 0.5 ? "level" : `${n > 0 ? "+" : "-"}£${int(Math.round(Math.abs(n)))}`);

// ─── Building blocks ───────────────────────────────────────────────────────

function Header({ title, period, note }: { title: string; period: string; note?: string }) {
  return (
    <View style={s.header} fixed>
      <View>
        <Text style={s.kicker}>10 AT 10</Text>
        <Text style={s.title}>{title}</Text>
      </View>
      <View>
        <Text style={s.period}>{period}</Text>
        {note && <Text style={s.periodNote}>{note}</Text>}
      </View>
    </View>
  );
}

function Footer({ exportedAt, period }: { exportedAt: string; period: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>10 at 10 · {period} · exported {exportedAt}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function ReportPage({ title, input, note, period, children }: { title: string; input: PdfReportInput; note?: string; period?: string; children: ReactNode }) {
  const p = period ?? input.range.label;
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <Header title={title} period={p} note={note} />
      {children}
      <Footer exportedAt={input.exportedAt} period={input.range.label} />
    </Page>
  );
}

interface KpiProps { label: string; value: string; sub?: string; tone?: Tone; hero?: boolean; flex?: number; accent?: string }

function Kpi({ label, value, sub, tone, hero, flex = 1, accent }: KpiProps) {
  return (
    <View style={[s.kpi, { flex }, hero ? s.kpiHero : {}, accent ? { borderTopWidth: 2.5, borderTopColor: accent } : {}]}>
      <Text style={[s.kpiLabel, hero ? { color: C.heroSub } : {}]}>{label.toUpperCase()}</Text>
      <Text style={[s.kpiValue, hero ? { color: "#ffffff" } : { color: toneColour(tone) ?? C.ink }]}>{tx(value)}</Text>
      {sub && <Text style={[s.kpiSub, hero ? { color: C.heroSub } : {}]}>{tx(sub)}</Text>}
    </View>
  );
}

function Panel({ title, note, children, flex, breakable }: { title: string; note?: string; children: ReactNode; flex?: number; breakable?: boolean }) {
  return (
    <View style={[s.panel, flex ? { flex } : {}]} wrap={!!breakable}>
      <View style={s.panelHead}>
        <Text style={s.panelTitle}>{title}</Text>
        {note && <Text style={s.panelNote}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

function Bar({ value, of, colour, width = 34, height = 3 }: { value: number; of: number; colour: string; width?: number | string; height?: number }) {
  const w = of > 0 ? Math.max(0, Math.min(100, (value / of) * 100)) : 0;
  return (
    <View style={{ width, height, borderRadius: height / 2, backgroundColor: C.wash2 }}>
      <View style={{ width: `${w}%`, height, borderRadius: height / 2, backgroundColor: colour }} />
    </View>
  );
}

interface PCol<R> {
  label: string;
  /** Fixed width in points; the first column (or any without) takes the rest. */
  w?: number;
  align?: "left" | "right";
  text: (r: R) => string;
  tone?: (r: R) => Tone;
  strong?: boolean;
  /** A small bar ahead of the text — a share, a budget. */
  bar?: (r: R) => { value: number; of: number; colour?: string };
  /** Let long text run to two lines instead of being cut. */
  wrap?: boolean;
}

function Table<R>({ cols, rows, keyOf, empty = "Nothing in this period.", more, rowStyle }: {
  cols: PCol<R>[]; rows: R[]; keyOf: (r: R, i: number) => string; empty?: string; more?: string; rowStyle?: (r: R) => Styles[string] | undefined;
}) {
  if (rows.length === 0) return <Text style={[s.note, { color: C.faint }]}>{empty}</Text>;
  const box = (c: PCol<R>, i: number) => (c.w ? { width: c.w, paddingLeft: i ? 5 : 0 } : { flex: 1, paddingRight: 4 });
  const align = (c: PCol<R>, i: number) => c.align ?? (i === 0 ? "left" : "right");
  return (
    <View>
      <View style={[s.tr, { borderBottomColor: C.line, borderBottomWidth: 0.75, paddingVertical: 1.8 }]}>
        {cols.map((c, i) => (
          <View key={`${c.label}-${i}`} style={box(c, i)}>
            <Text style={[s.th, { textAlign: align(c, i) }]}>{c.label.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={keyOf(r, ri)} style={[s.tr, rowStyle?.(r) ?? {}]} wrap={false}>
          {cols.map((c, i) => {
            const b = c.bar?.(r);
            const t = (
              <Text style={[
                s.td, { textAlign: align(c, i) },
                c.strong ? { fontFamily: "Helvetica-Bold", color: C.ink } : {},
                toneColour(c.tone?.(r)) ? { color: toneColour(c.tone?.(r)) } : {},
                c.wrap ? { maxLines: 2, textOverflow: "ellipsis" } : { maxLines: 1, textOverflow: "ellipsis" },
              ]}>{tx(c.text(r))}</Text>
            );
            return (
              <View key={`${c.label}-${i}`} style={[box(c, i), b ? { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 } : {}]}>
                {b && <Bar value={b.value} of={b.of} colour={b.colour ?? C.faint} width={30} />}
                {t}
              </View>
            );
          })}
        </View>
      ))}
      {more && <Text style={[s.note, { color: C.faint, marginTop: 3 }]}>{more}</Text>}
    </View>
  );
}

/** "and 4 more — see the tab" under a table cut to fit. */
const moreNote = (shown: number, total: number, what: string) => (total > shown ? `and ${total - shown} more ${what} — see the tab` : undefined);

function Line({ label, children, size = 7 }: { label: string; children: ReactNode; size?: number }) {
  return (
    <View style={{ flexDirection: "row", marginTop: size * 0.45 }}>
      <Text style={[s.th, { width: size * 10, paddingTop: 1, fontSize: size * 0.82 }]}>{label.toUpperCase()}</Text>
      <Text style={{ flex: 1, fontSize: size, color: C.body, lineHeight: 1.3 }}>{children}</Text>
    </View>
  );
}

const B = ({ children, tone }: { children: ReactNode; tone?: Tone }) => (
  <Text style={{ fontFamily: "Helvetica-Bold", color: toneColour(tone) ?? C.ink }}>{children}</Text>
);

function SourceStrip({ groups, size = 6.8 }: { groups: { label: string; share: number }[]; size?: number }) {
  return (
    <View>
      <View style={{ flexDirection: "row", height: size * 0.95, borderRadius: 3, overflow: "hidden" }}>
        {groups.map((g) => <View key={g.label} style={{ width: `${g.share}%`, backgroundColor: SOURCE_COLOURS[g.label] ?? C.faint, borderRightWidth: 1, borderRightColor: "#ffffff" }} />)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 3, gap: 7 }}>
        {groups.map((g) => (
          <View key={g.label} style={{ flexDirection: "row", alignItems: "center", gap: 2.5 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: SOURCE_COLOURS[g.label] ?? C.faint }} />
            <Text style={{ fontSize: size }}>{g.label} <B>{g.share.toFixed(0)}%</B></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Shared figures ────────────────────────────────────────────────────────

function responseFor(input: PdfReportInput) {
  const { range } = input;
  const period = input.responses.filter((x) => x.enquiryDay >= range.startDay && x.enquiryDay <= range.endDay);
  const { reportable, held } = partitionByReportability(period, input.reportHorizon);
  return { reportable, held, s: summariseResponse(reportable) };
}

function deliveriesFor(input: PdfReportInput) {
  const d = inRange(input.deliveries, input.range);
  const months = budgetMonths(input.range);
  const lines = months ? budgetLines(d, input.budgets, months) : null;
  const delivered = d.filter((x) => x.delivery === "Delivered").length;
  const arrived = d.filter((x) => x.delivery === "Arrived").length;
  return { d, lines, delivered, arrived, due: d.length - delivered - arrived, pace: periodProgress(input.range, input.today) };
}

const ORDER_EXEC_COLS = (unit: string): PCol<{ label: string; stats: OrderStats }>[] => [
  { label: "Exec", text: (g) => g.label },
  { label: unit, w: 34, text: (g) => int(g.stats.orders) },
  { label: "Total profit", w: 50, text: (g) => money(g.stats.priced ? g.stats.profit : null), tone: (g) => (g.stats.profit < 0 ? "bad" : undefined) },
  { label: "Avg", w: 42, strong: true, text: (g) => money(avgProfit(g.stats)), tone: (g) => ((avgProfit(g.stats) ?? 0) < 0 ? "bad" : undefined) },
  { label: "Loss", w: 24, text: (g) => int(g.stats.loss), tone: (g) => (g.stats.loss ? "bad" : undefined) },
];

function profitLists(rows: OrderRow[]) {
  const priced = rows.filter((r) => r.profit != null).sort((a, b) => (b.profit as number) - (a.profit as number));
  const n = Math.min(5, Math.floor(priced.length / 2));
  return { best: priced.slice(0, n), worst: priced.slice(-n).reverse() };
}

const PROFIT_ROW_COLS: PCol<OrderRow>[] = [
  { label: "Customer", text: (r) => r.customer },
  { label: "Model", w: 62, align: "left", text: (r) => r.model },
  { label: "Exec", w: 30, align: "left", text: (r) => r.exec },
  { label: "Profit", w: 42, strong: true, text: (r) => money(r.profit), tone: (r) => ((r.profit ?? 0) < 0 ? "bad" : undefined) },
];

function SegmentKpis({ rows, noun }: { rows: OrderRow[]; noun: string }) {
  const groups = new Map(groupOrders(rows, ["segment"]).map((g) => [g.label, g]));
  return (
    <>
      {SEGMENTS.map((seg) => {
        const g = groups.get(seg);
        const avg = g ? avgProfit(g.stats) : null;
        return (
          <Kpi key={seg} label={`${SEGMENT_META[seg].title} · avg`} value={money(avg)} tone={(avg ?? 0) < 0 ? "bad" : undefined} accent={SEGMENT_META[seg].colour}
            sub={g ? `${int(g.stats.orders)} ${noun} · ${g.share.toFixed(0)}% · ${int(g.stats.loss)} loss-making` : `No ${noun}`} />
        );
      })}
    </>
  );
}

function ProfitColumn({ rows, noun }: { rows: OrderRow[]; noun: string }) {
  const bands = groupOrders(rows, ["profitBand"], "label");
  const total = rows.length;
  const { best, worst } = profitLists(rows);
  return (
    <View style={[s.stack, { flex: 1 }]}>
      <Panel title="Profit bands" note={`share of ${noun}`}>
        <Table cols={[
          { label: "Band", text: (g) => g.label, tone: (g) => (g.label.startsWith("−") ? "bad" : undefined) },
          { label: noun, w: 44, text: (g) => int(g.stats.orders) },
          { label: "Share", w: 58, text: (g) => `${g.share.toFixed(0)}%`, bar: (g) => ({ value: g.stats.orders, of: total, colour: g.label.startsWith("−") ? C.bad : C.faint }) },
          { label: "Total", w: 46, text: (g) => money(g.stats.priced ? g.stats.profit : null) },
        ]} rows={bands} keyOf={(g) => g.key} />
      </Panel>
      {best.length > 0 && (
        <Panel title={`Most and least profitable ${noun}`}>
          <Text style={[s.th, { color: C.good, marginBottom: 1.5 }]}>MOST PROFITABLE</Text>
          <Table cols={PROFIT_ROW_COLS} rows={best} keyOf={(r, i) => `b${i}`} />
          <Text style={[s.th, { color: C.bad, marginTop: 6, marginBottom: 1.5 }]}>LEAST PROFITABLE</Text>
          <Table cols={PROFIT_ROW_COLS} rows={worst} keyOf={(r, i) => `w${i}`} />
        </Panel>
      )}
    </View>
  );
}

// ─── 1 · Summary ───────────────────────────────────────────────────────────

const SUMMARY_TEXT = 8;

function SummaryCard({ title, kpis, children }: { title: string; kpis: KpiProps[]; children?: ReactNode }) {
  return (
    <View style={[s.panel, { flex: 1, paddingVertical: 10, paddingHorizontal: 11 }]} wrap={false}>
      <Text style={[s.panelTitle, { fontSize: 11.5, marginBottom: 8 }]}>{title}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {kpis.map((k) => (
          <View key={k.label} style={{ flex: 1 }}>
            <Text style={[s.kpiLabel, { fontSize: 6.3 }]}>{k.label.toUpperCase()}</Text>
            <Text style={{ fontSize: 19, fontFamily: "Helvetica-Bold", color: toneColour(k.tone) ?? C.ink, marginTop: 2 }}>{tx(k.value)}</Text>
            {k.sub && <Text style={[s.kpiSub, { fontSize: 6.8 }]}>{tx(k.sub)}</Text>}
          </View>
        ))}
      </View>
      {children && <View style={{ marginTop: 10, paddingTop: 7, borderTopWidth: 0.5, borderTopColor: C.line }}>{children}</View>}
    </View>
  );
}

function SummaryPage({ input }: { input: PdfReportInput }) {
  const { range } = input;
  const eRows = inRange(input.enquiries, range);
  const e = statsOf(eRows);
  const eTop = topInboundExecs(eRows);
  const r = responseFor(input);
  const rs = r.s;
  const misses = new Map<string, number>();
  for (const x of r.reportable) if (sameDayMissOwner(x) === "exec") misses.set(x.salesExec, (misses.get(x.salesExec) ?? 0) + 1);
  const missList = [...misses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const oRows = inRange(input.orders, range);
  const o = orderStatsOf(oRows);
  const oSeg = new Map(groupOrders(oRows, ["segment"]).map((g) => [g.label, g]));
  const oTop = groupOrders(oRows, ["exec"], "orders").slice(0, 3);
  const cancelledHere = input.cancelledOrderDays.filter((x) => x >= range.startDay && x <= range.endDay).length;
  const rewritesOut = rewritesAcross(input.rewriteMoves, range).out;
  const dv = deliveriesFor(input);
  const line = dv.lines?.combined ?? null;
  const gap = line?.budget != null ? line.going - line.budget : null;
  const deliveredPct = dv.d.length ? Math.round((dv.delivered / dv.d.length) * 100) : null;
  const c = inRange(input.cancellations, range);
  const proper = c.filter(isProper).sort((a, b) => Number(needsReason(b)) - Number(needsReason(a)) || b.day.localeCompare(a.day));
  const unexplained = c.filter(needsReason).length;
  const m = input.market;
  const cars = m?.segments.find((x) => x.segment === "car");
  const vans = m?.segments.find((x) => x.segment === "van");
  const all = m ? marketTotals(m.segments) : null;
  const ranked = (m?.segments ?? []).flatMap((sg) => sg.ranges.filter((x) => x.stats.compared >= 40).map((x) => ({ name: x.name, pct: share(x.stats.cheapest, x.stats.compared) ?? 0 })))
    .sort((a, b) => b.pct - a.pct);
  const sameDay = share(rs.sameDayMet, rs.sameDayExpected);
  const join = (xs: ReactNode[]) => xs.flatMap((x, i) => (i ? [" · ", x] : [x]));

  // A line or two more per card: who stands out, and the mix behind a total.
  const byExecResponse = [...r.reportable.reduce((acc, x) => acc.set(x.salesExec, [...(acc.get(x.salesExec) ?? []), x]), new Map<string, EnquiryRow[]>())]
    .map(([name, xs]) => ({ name, n: xs.length, avg: summariseResponse(xs).contactAvg }))
    .filter((x) => x.avg != null && x.n >= 3)
    .sort((a, b) => (b.avg as number) - (a.avg as number));
  const oFunders = groupOrders(oRows, ["funder"]).slice(0, 3);
  const dSeg = new Map(groupOrders(dv.d, ["segment"]).map((g) => [g.label, g]));
  const topDeliverer = groupOrders(dv.d.filter((x) => x.delivery === "Delivered"), ["exec"])[0];
  const undercutter = [...(m?.segments ?? []).flatMap((sg) => sg.competitors)
    .reduce((acc, x) => { const t = acc.get(x.broker) ?? { u: 0, h: 0 }; acc.set(x.broker, { u: t.u + x.undercuts, h: t.h + x.headToHead }); return acc; }, new Map<string, { u: number; h: number }>())]
    .sort((a, b) => b[1].u - a[1].u)[0];

  return (
    <ReportPage title="Summary" input={input} note="Every area at a glance — the pages after go through each in turn">
      <View style={[s.stack, { flex: 1 }]}>
        <View style={[s.row, { flex: 1 }]}>
          <SummaryCard title="Enquiries" kpis={[
            { label: "Enquiries", value: int(e.enquiries), sub: `${int(e.inboundEnquiries)} inbound · ${int(e.enquiries - e.inboundEnquiries)} broker` },
            { label: "Inbound", value: pct(inboundPct(e)), sub: "conversion" },
            { label: "Broker", value: pct(brokerPct(e)), sub: "conversion" },
            { label: "Overall", value: pct(conversionPct(e)), sub: `conversion · ${int(e.orders)} orders` },
          ]}>
            {e.enquiries > 0 && <View style={{ marginBottom: 3 }}><SourceStrip size={7.5} groups={groupRows(eRows, ["source"], "enquiries")} /></View>}
            <Line size={SUMMARY_TEXT} label="Best inbound">{eTop.length ? join(eTop.map((g) => <Text key={g.key}><B tone="good">{g.label}</B> {pct(inboundPct(g.stats), 0)} ({int(g.stats.inboundOrders)} of {int(g.stats.inboundEnquiries)})</Text>)) : "No inbound orders yet"}</Line>
            <Line size={SUMMARY_TEXT} label="Still open">{int(e.live)} live · {int(e.lost)} lost</Line>
          </SummaryCard>
          <SummaryCard title="Response times" kpis={[
            { label: "First contact", value: formatMins(rs.contactAvg), tone: rs.contactAvg == null ? undefined : rs.contactAvg <= CONTACT_TARGET_MINS ? "good" : "bad", sub: `target ${CONTACT_TARGET_MINS}m · ${int(rs.contactMissed)} over` },
            { label: "Same-day", value: sameDay == null ? "—" : `${Math.round(sameDay)}%`, tone: rs.sameDayExpected ? (rs.sameDayMissed ? "bad" : "good") : undefined, sub: `${int(rs.sameDayMissed)} missed` },
            { label: "Never contacted", value: int(rs.neverContacted), tone: rs.neverContacted ? "bad" : undefined, sub: `of ${int(rs.total)} judged` },
          ]}>
            <Line size={SUMMARY_TEXT} label="Allocation"><B tone={rs.allocAvg == null ? undefined : rs.allocAvg <= ALLOCATION_TARGET_MINS ? "good" : "bad"}>{formatMins(rs.allocAvg)}</B> average, target {ALLOCATION_TARGET_MINS}m · {int(rs.allocMissed)} over · Sales Support</Line>
            <Line size={SUMMARY_TEXT} label="Missed same day">{missList.length ? join(missList.slice(0, 4).map(([n, k]) => <Text key={n}><B tone="bad">{n}</B> {k}</Text>)) : <B tone="good">No exec missed one</B>}</Line>
            {byExecResponse.length > 1 && (
              <>
                <Line size={SUMMARY_TEXT} label="Slowest contact">{join(byExecResponse.slice(0, 2).map((x) => <Text key={x.name}><B tone={(x.avg as number) > CONTACT_TARGET_MINS ? "bad" : undefined}>{x.name}</B> {formatMins(x.avg)}</Text>))}</Line>
                <Line size={SUMMARY_TEXT} label="Fastest contact">{join(byExecResponse.slice(-2).reverse().map((x) => <Text key={x.name}><B tone="good">{x.name}</B> {formatMins(x.avg)}</Text>))}</Line>
              </>
            )}
            {r.held.length > 0 && <Line size={SUMMARY_TEXT} label="Not judged yet">{int(r.held.length)} — they need a full working day first</Line>}
          </SummaryCard>
          <SummaryCard title="Orders" kpis={[
            { label: "Orders", value: int(o.orders), sub: ordersAdjusted(cancelledHere, rewritesOut) },
            { label: "Total profit", value: money(o.priced ? o.profit : null), tone: o.profit < 0 ? "bad" : undefined },
            { label: "Avg per unit", value: money(avgProfit(o)), tone: (avgProfit(o) ?? 0) < 0 ? "bad" : undefined },
          ]}>
            <Line size={SUMMARY_TEXT} label="By segment">{join(SEGMENTS.map((seg) => { const g = oSeg.get(seg); return <Text key={seg}>{SEGMENT_META[seg].title} <B>{int(g?.stats.orders ?? 0)}</B> ({money(g ? avgProfit(g.stats) : null)} avg)</Text>; }))}</Line>
            <Line size={SUMMARY_TEXT} label="Most orders">{oTop.length ? join(oTop.map((g) => <Text key={g.key}><B>{g.label}</B> {int(g.stats.orders)}</Text>)) : "None yet"}</Line>
            {oFunders.length > 0 && <Line size={SUMMARY_TEXT} label="By funder">{join(oFunders.map((g) => <Text key={g.key}><B>{g.label}</B> {int(g.stats.orders)} ({money(avgProfit(g.stats))} avg)</Text>))}</Line>}
            <Line size={SUMMARY_TEXT} label="Loss-making"><B tone={o.loss ? "bad" : undefined}>{int(o.loss)}</B> of {int(o.priced)} priced</Line>
          </SummaryCard>
        </View>
        <View style={[s.row, { flex: 1 }]}>
          <SummaryCard title="Deliveries" kpis={line ? [
            { label: "Going vs budget", value: line.budget == null ? int(line.going) : `${int(line.going)} / ${int(line.budget)}`, tone: gap == null ? undefined : gap >= 0 ? "good" : "bad", sub: gap == null ? "no budget set" : gap >= 0 ? `${int(gap)} over budget` : `${int(-gap)} short of budget` },
            { label: "Delivered", value: deliveredPct == null ? "—" : `${deliveredPct}%`, tone: deliveredPct == null ? undefined : deliveredPct >= Math.round(dv.pace.pct) ? "good" : "bad", sub: `of going · ${Math.round(dv.pace.pct)}% through` },
            { label: "Still to deliver", value: int(dv.d.length - dv.delivered), sub: `${int(dv.arrived)} arrived · ${int(dv.due)} due` },
          ] : [
            { label: "Going", value: int(dv.d.length) },
            { label: "Delivered", value: int(dv.delivered), sub: deliveredPct == null ? undefined : `${deliveredPct}% of going` },
            { label: "Still to deliver", value: int(dv.d.length - dv.delivered), sub: `${int(dv.arrived)} arrived · ${int(dv.due)} due` },
          ]}>
            {dv.lines ? (["car", "cv"] as const).map((k) => {
              const l = dv.lines![k];
              const g = l.budget == null ? null : l.going - l.budget;
              return (
                <View key={k} style={{ marginTop: k === "car" ? 1 : 7 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: SUMMARY_TEXT, fontFamily: "Helvetica-Bold", color: C.ink }}>{k === "car" ? "Car" : "CV"}</Text>
                    <Text style={{ fontSize: SUMMARY_TEXT }}><B>{int(l.going)}</B>{l.budget != null ? ` of ${int(l.budget)}` : ""} going · {int(l.delivered)} delivered {g != null && <B tone={g >= 0 ? "good" : "bad"}>{g >= 0 ? `+${int(g)}` : `-${int(-g)}`}</B>}</Text>
                  </View>
                  <View style={{ marginTop: 2.5 }}><Bar value={l.going} of={l.budget ?? l.going} colour={DEPARTMENT_COLOURS[k]} width="100%" height={5} /></View>
                </View>
              );
            }) : <Text style={[s.note, { marginTop: 2, fontSize: 7.5 }]}>Budget is monthly — export a Month or Quarter to measure against it.</Text>}
            {dv.d.length > 0 && (
              <View style={{ marginTop: 5 }}>
                <Line size={SUMMARY_TEXT} label="By segment">{join(SEGMENTS.map((seg) => <Text key={seg}>{SEGMENT_META[seg].title} <B>{int(dSeg.get(seg)?.stats.orders ?? 0)}</B></Text>))}</Line>
                {topDeliverer && <Line size={SUMMARY_TEXT} label="Most delivered"><B>{topDeliverer.label}</B> {int(topDeliverer.stats.orders)}</Line>}
              </View>
            )}
          </SummaryCard>
          <SummaryCard title="Cancellations" kpis={[
            { label: "Cancellations", value: int(proper.length), sub: "not re-ordered" },
            { label: "Re-Writes", value: int(c.length - proper.length), sub: "re-ordered, not counted" },
            { label: "Reasons to add", value: int(unexplained), tone: proper.length ? (unexplained ? "bad" : "good") : undefined },
          ]}>
            {proper.slice(0, 4).map((x) => (
              <Text key={x.id} style={{ fontSize: SUMMARY_TEXT, marginTop: 4, maxLines: 1, textOverflow: "ellipsis" }}>
                <B>{x.customer}</B> · {firstName(x.exec)} — <Text style={{ color: x.note ? C.body : C.warn, fontFamily: x.note ? "Helvetica" : "Helvetica-Bold" }}>{x.note || "Reason needed"}</Text>
              </Text>
            ))}
            {proper.length > 4 && <Text style={[s.note, { marginTop: 3, fontSize: 7.5 }]}>and {int(proper.length - 4)} more</Text>}
            {proper.length === 0 && <Text style={[s.note, { marginTop: 2, fontSize: 7.5 }]}>No cancellations in this period.</Text>}
          </SummaryCard>
          <SummaryCard title="Market Analysis" kpis={m && all ? [
            { label: "Cars cheapest", value: pct(cars ? share(cars.overall.cheapest, cars.overall.compared) : null, 0), sub: cars ? gapText(cars.overall.gap) : "not scraped" },
            { label: "Vans cheapest", value: pct(vans ? share(vans.overall.cheapest, vans.overall.compared) : null, 0), sub: vans ? gapText(vans.overall.gap) : "not scraped" },
            { label: "Lowest headline", value: pct(share(all.headlineLowest, all.headlineCompared), 0), sub: "best price, any term" },
          ] : [{ label: "Cheapest", value: "—", sub: "no scrape yet" }]}>
            {ranked.length >= 2 && (
              <>
                <Line size={SUMMARY_TEXT} label="Strongest">{join(ranked.slice(0, 2).map((x) => <Text key={x.name}><B tone="good">{x.name}</B> {x.pct.toFixed(0)}%</Text>))}</Line>
                <Line size={SUMMARY_TEXT} label="Weakest">{join(ranked.slice(-2).reverse().map((x) => <Text key={x.name}><B tone="bad">{x.name}</B> {x.pct.toFixed(0)}%</Text>))}</Line>
              </>
            )}
            {undercutter && <Line size={SUMMARY_TEXT} label="Top undercutter"><B>{undercutter[0]}</B> — cheaper on {int(undercutter[1].u)} of {int(undercutter[1].h)}</Line>}
            {m && <Text style={[s.note, { marginTop: 5, color: C.faint, fontSize: 7 }]}>Latest scrape, {scrapeWhen(m.run.startedAt)} — not tied to the period.</Text>}
          </SummaryCard>
        </View>
      </View>
    </ReportPage>
  );
}

// ─── 2 · Enquiries ─────────────────────────────────────────────────────────

const ENQ_EXEC_COLS: PCol<{ label: string; share: number; stats: Stats }>[] = [
  { label: "Exec", text: (g) => g.label },
  { label: "Enquiries", w: 40, text: (g) => int(g.stats.enquiries) },
  { label: "Share", w: 56, text: (g) => `${g.share.toFixed(0)}%`, bar: (g) => ({ value: g.share, of: 100 }) },
  { label: "Orders", w: 32, text: (g) => int(g.stats.orders) },
  { label: "Inbound", w: 38, text: (g) => pct(inboundPct(g.stats)) },
  { label: "Broker", w: 38, text: (g) => pct(brokerPct(g.stats)) },
  { label: "Overall", w: 40, strong: true, text: (g) => pct(conversionPct(g.stats)) },
  { label: "Live", w: 26, text: (g) => int(g.stats.live) },
  { label: "Lost", w: 26, text: (g) => int(g.stats.lost) },
];

function EnquiriesPage({ input }: { input: PdfReportInput }) {
  const rows = inRange(input.enquiries, input.range);
  const e = statsOf(rows);
  // Performance order, as on the tab: sources by enquiries, execs and models by inbound conversion.
  const sources = groupRows(rows, ["source"], "enquiries");
  const execs = groupRows(rows, ["exec"], "inbound");
  const models = groupRows(rows, ["model"], "inbound");
  const MODELS = 14;
  return (
    <ReportPage title="Enquiries" input={input} note="Conversion is orders ÷ enquiries raised in the period">
      <View style={s.stack}>
        <View style={s.row}>
          <Kpi label="Inbound conversion" value={pct(inboundPct(e))} sub={`${int(e.inboundOrders)} orders of ${int(e.inboundEnquiries)} MotorComplete leads`} accent={C.accent} />
          <Kpi label="Broker / Prospect conv." value={pct(brokerPct(e))} sub={`${int(e.orders - e.inboundOrders)} orders of ${int(e.enquiries - e.inboundEnquiries)}`} accent={SOURCE_COLOURS["Broker / Prospect"]} />
          <Kpi label="Overall conversion" value={pct(conversionPct(e))} sub={`${int(e.orders)} orders of ${int(e.enquiries)} — the two together`} hero />
          <Kpi label="Enquiries" value={int(e.enquiries)} flex={0.75} />
          <Kpi label="Orders" value={int(e.orders)} flex={0.75} />
          <Kpi label="Live" value={int(e.live)} flex={0.75} />
          <Kpi label="Lost" value={int(e.lost)} flex={0.75} />
        </View>
        {rows.length === 0 ? <Text style={s.note}>No enquiries in {input.range.label}.</Text> : (
          <View style={s.row}>
            <View style={[s.stack, { flex: 1.25 }]}>
              <Panel title="By exec" note="sorted by inbound conversion">
                <Table cols={ENQ_EXEC_COLS} rows={execs} keyOf={(g) => g.key} />
              </Panel>
              <Panel title="By source">
                <SourceStrip groups={sources} />
                <View style={{ height: 5 }} />
                <Table cols={[
                  { label: "Source", text: (g) => g.label },
                  { label: "Enquiries", w: 40, text: (g) => int(g.stats.enquiries) },
                  { label: "Orders", w: 32, text: (g) => int(g.stats.orders) },
                  { label: "Conv.", w: 38, strong: true, text: (g) => pct(conversionPct(g.stats)) },
                  { label: "Live", w: 26, text: (g) => int(g.stats.live) },
                  { label: "Lost", w: 26, text: (g) => int(g.stats.lost) },
                ]} rows={sources} keyOf={(g) => g.key} />
              </Panel>
            </View>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title="By model" note="sorted by inbound conversion · derivatives on the tab">
                <Table cols={[
                  { label: "Model", text: (g) => g.label },
                  { label: "Enquiries", w: 40, text: (g) => int(g.stats.enquiries) },
                  { label: "Share", w: 52, text: (g) => `${g.share.toFixed(0)}%`, bar: (g) => ({ value: g.share, of: 100 }) },
                  { label: "Orders", w: 32, text: (g) => int(g.stats.orders) },
                  { label: "Inbound", w: 38, strong: true, text: (g) => pct(inboundPct(g.stats)) },
                  { label: "Overall", w: 38, text: (g) => pct(conversionPct(g.stats)) },
                ]} rows={models.slice(0, MODELS)} keyOf={(g) => g.key} more={moreNote(MODELS, models.length, "models")} />
              </Panel>
            </View>
          </View>
        )}
      </View>
    </ReportPage>
  );
}

// ─── 3 · Response times ────────────────────────────────────────────────────

interface RRow { label: string; s: ResponseSummary; count?: number; support?: boolean }

const mins = (avg: number | null) => formatMins(avg);
const minsTone = (avg: number | null, target: number): Tone => (avg == null ? undefined : avg <= target ? "good" : "bad");

function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function ResponsePage({ input }: { input: PdfReportInput }) {
  const { reportable, held, s: rs } = responseFor(input);
  const sameDay = share(rs.sameDayMet, rs.sameDayExpected);
  const attention: RRow[] = [
    ["Missed same day — exec", reportable.filter((r) => sameDayMissOwner(r) === "exec")],
    ["Missed same day — late allocation (Sales Support)", reportable.filter((r) => sameDayMissOwner(r) === "salesSupport")],
    ["Never contacted — exec", reportable.filter((r) => neverContactedOwner(r) === "exec")],
    [`First contact over ${CONTACT_TARGET_MINS} min`, reportable.filter((r) => r.contactMins != null && r.contactMins > CONTACT_TARGET_MINS)],
    [`Allocation over ${ALLOCATION_TARGET_MINS} min`, reportable.filter((r) => r.allocMins != null && r.allocMins > ALLOCATION_TARGET_MINS)],
    ["Never passed to an exec (Sales Support)", reportable.filter((r) => isTransferMissing(r))],
  ].map(([label, rows]) => ({ label: label as string, s: rs, count: (rows as EnquiryRow[]).length }));

  const byName = new Map<string, EnquiryRow[]>();
  for (const r of reportable) byName.set(r.salesExec, [...(byName.get(r.salesExec) ?? []), r]);
  const execs: RRow[] = [...byName].map(([label, rows]) => ({ label, s: summariseResponse(rows) }))
    .sort((a, b) => fastestFirst(a.s, b.s) || a.label.localeCompare(b.label));
  if (reportable.length) execs.push({ label: "Sales Support (allocation)", s: rs, support: true });

  // A day per line for up to a month; a long period goes by week so it fits.
  const span = (Date.parse(`${input.range.endDay}T00:00:00Z`) - Date.parse(`${input.range.startDay}T00:00:00Z`)) / 86_400_000 + 1;
  const weekly = span > 31;
  const byKey = new Map<string, EnquiryRow[]>();
  for (const r of reportable) { const k = weekly ? weekOf(r.enquiryDay) : r.enquiryDay; byKey.set(k, [...(byKey.get(k) ?? []), r]); }
  const days = [...byKey].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, rows]) => ({ label: weekly ? `w/c ${shortDate(k)}` : new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).replace(",", ""), s: summariseResponse(rows) }));

  return (
    <ReportPage title="Response times" input={input} note="MotorComplete leads · working hours Mon–Fri 09:00–17:30">
      <View style={s.stack}>
        <View style={s.row}>
          <Kpi label="Enquiries judged" value={int(rs.total)} sub={held.length ? `${int(held.length)} more not judged yet — they need a full working day` : "every one had a full working day"} />
          <Kpi label={`Allocation · target ${ALLOCATION_TARGET_MINS}m`} value={mins(rs.allocAvg)} tone={minsTone(rs.allocAvg, ALLOCATION_TARGET_MINS)} sub={`${int(rs.allocHit)} on target · ${int(rs.allocMissed)} over · Sales Support`} />
          <Kpi label={`First contact · target ${CONTACT_TARGET_MINS}m`} value={mins(rs.contactAvg)} hero sub={`${int(rs.contactHit)} on target · ${int(rs.contactMissed)} over`} />
          <Kpi label="Same-day contact" value={sameDay == null ? "—" : `${Math.round(sameDay)}%`} tone={rs.sameDayExpected ? (rs.sameDayMissed ? "bad" : "good") : undefined} sub={`${int(rs.sameDayMissed)} missed of ${int(rs.sameDayExpected)} · ${int(rs.sameDayMissedSupport)} late allocation`} />
          <Kpi label="Never contacted" value={int(rs.neverContacted)} tone={rs.neverContacted ? "bad" : undefined} sub={`${int(rs.noTransfer)} never passed to an exec`} />
        </View>
        {reportable.length === 0 ? <Text style={s.note}>No enquiries to judge in {input.range.label} yet.</Text> : (
          <View style={s.row}>
            <View style={[s.stack, { flex: 1.25 }]}>
              <Panel title="Needs attention" note="customers listed on the tab">
                <Table cols={[
                  { label: "Issue", text: (r) => r.label },
                  { label: "Enquiries", w: 44, strong: true, text: (r) => int(r.count ?? 0), tone: (r) => (r.count ? "bad" : undefined) },
                  { label: "Of all judged", w: 68, text: (r) => pct(share(r.count ?? 0, rs.total), 0), bar: (r) => ({ value: r.count ?? 0, of: rs.total, colour: C.bad }) },
                ]} rows={attention} keyOf={(r) => r.label} />
              </Panel>
              <Panel title="By exec" note={`from when the lead reached them · Sales Support is allocation (${ALLOCATION_TARGET_MINS}m)`}>
                <Table cols={[
                  { label: "Exec", text: (r) => r.label },
                  { label: "Enquiries", w: 40, text: (r) => int(r.s.total) },
                  { label: "Avg response", w: 52, strong: true, text: (r) => mins(r.support ? r.s.allocAvg : r.s.contactAvg), tone: (r) => (r.support ? minsTone(r.s.allocAvg, ALLOCATION_TARGET_MINS) : minsTone(r.s.contactAvg, CONTACT_TARGET_MINS)) },
                  { label: "Over target", w: 44, text: (r) => int(r.support ? r.s.allocMissed : r.s.contactMissed), tone: (r) => ((r.support ? r.s.allocMissed : r.s.contactMissed) ? "bad" : undefined) },
                  { label: "Missed same day", w: 58, strong: true, text: (r) => int(r.support ? r.s.sameDayMissedSupport : r.s.sameDayMissedExec), tone: (r) => ((r.support ? r.s.sameDayMissedSupport : r.s.sameDayMissedExec) ? "bad" : "good") },
                  { label: "Never contacted", w: 56, text: (r) => int(r.support ? r.s.noTransfer : r.s.neverContactedExec), tone: (r) => ((r.support ? r.s.noTransfer : r.s.neverContactedExec) ? "bad" : undefined) },
                ]} rows={execs} keyOf={(r) => r.label} rowStyle={(r) => (r.support ? { backgroundColor: C.wash } : undefined)} />
              </Panel>
            </View>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title={weekly ? "By week" : "By day"} note={weekly ? "the period is over a month, so by week" : undefined}>
                <Table cols={[
                  { label: weekly ? "Week" : "Day", text: (r) => r.label },
                  { label: "Enquiries", w: 40, text: (r) => int(r.s.total) },
                  { label: "In scope", w: 36, text: (r) => int(r.s.sameDayExpected) },
                  { label: "Missed", w: 34, strong: true, text: (r) => int(r.s.sameDayMissed), tone: (r) => (r.s.sameDayMissed ? "bad" : "good") },
                  { label: "Same day", w: 38, text: (r) => (r.s.sameDayExpected ? `${Math.round((r.s.sameDayMet / r.s.sameDayExpected) * 100)}%` : "—") },
                  { label: `Avg (${CONTACT_TARGET_MINS}m)`, w: 42, text: (r) => mins(r.s.contactAvg), tone: (r) => minsTone(r.s.contactAvg, CONTACT_TARGET_MINS) },
                ]} rows={days} keyOf={(r) => r.label} />
              </Panel>
            </View>
          </View>
        )}
      </View>
    </ReportPage>
  );
}

// ─── 4 · Orders ────────────────────────────────────────────────────────────

function OrdersPage({ input }: { input: PdfReportInput }) {
  const rows = inRange(input.orders, input.range);
  const o = orderStatsOf(rows);
  const cancelledHere = input.cancelledOrderDays.filter((x) => x >= input.range.startDay && x <= input.range.endDay).length;
  const rewritesOut = rewritesAcross(input.rewriteMoves, input.range).out;
  const execs = groupOrders(rows, ["exec"]);
  const models = groupOrders(rows, ["model"]);
  const funders = groupOrders(rows, ["funder"]);
  const MODELS = 14;
  return (
    <ReportPage title="Orders" input={input} note="Dealbook – Orders · profit is Total Gross">
      <View style={s.stack}>
        <View style={s.row}>
          <Kpi label="Orders" value={int(o.orders)} sub={[o.orders > o.priced ? `${int(o.orders - o.priced)} without a profit yet` : "", ordersAdjusted(cancelledHere, rewritesOut) ?? ""].filter(Boolean).join(" · ") || undefined} />
          <Kpi label="Total profit" value={money(o.priced ? o.profit : null)} tone={o.profit < 0 ? "bad" : undefined} sub={`${int(o.loss)} loss-making`} />
          <Kpi label="Avg profit per unit" value={money(avgProfit(o))} hero />
          <SegmentKpis rows={rows} noun="units" />
        </View>
        {rows.length === 0 ? <Text style={s.note}>No orders in {input.range.label}.</Text> : (
          <View style={s.row}>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title="By exec"><Table cols={ORDER_EXEC_COLS("Orders")} rows={execs} keyOf={(g) => g.key} /></Panel>
              <Panel title="By funder">
                <Table cols={[{ label: "Funder", text: (g) => g.label }, ...ORDER_EXEC_COLS("Orders").slice(1)]} rows={funders} keyOf={(g) => g.key} />
              </Panel>
            </View>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title="By model" note="derivatives on the tab">
                <Table cols={[{ label: "Model", text: (g) => g.label }, ...ORDER_EXEC_COLS("Orders").slice(1)]} rows={models.slice(0, MODELS)} keyOf={(g) => g.key} more={moreNote(MODELS, models.length, "models")} />
              </Panel>
            </View>
            <ProfitColumn rows={rows} noun="orders" />
          </View>
        )}
      </View>
    </ReportPage>
  );
}

// ─── 5 · Deliveries ────────────────────────────────────────────────────────

function BudgetBox({ title, colour, line, pace }: { title: string; colour: string; line: BudgetLine; pace: { day: number; days: number; pct: number } }) {
  const gap = line.budget == null ? null : line.going - line.budget;
  const deliveredPct = line.going ? Math.round((line.delivered / line.going) * 100) : null;
  const behind = deliveredPct == null ? null : deliveredPct - Math.round(pace.pct);
  return (
    <View style={[s.kpi, { borderTopWidth: 2.5, borderTopColor: colour }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink }}>{title}</Text>
        <Text style={s.note}>{line.budget == null ? "No budget set" : `Budget ${int(line.budget)}`}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.kpiLabel}>GOING VS BUDGET</Text>
          <Text style={[s.kpiValue, { fontSize: 14 }]}>{int(line.going)}{line.budget != null ? <Text style={{ fontSize: 8, color: C.muted, fontFamily: "Helvetica" }}> of {int(line.budget)}</Text> : null}</Text>
          {line.budget != null && <View style={{ marginTop: 2 }}><Bar value={line.going} of={line.budget} colour={colour} width="100%" /></View>}
          {gap != null && <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: gap >= 0 ? C.good : C.bad, marginTop: 2 }}>{gap >= 0 ? `${int(gap)} over budget` : `${int(-gap)} short of budget`}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.kpiLabel}>DELIVERED OF WHAT&apos;S GOING</Text>
          <Text style={[s.kpiValue, { fontSize: 14 }]}>{deliveredPct == null ? "—" : `${deliveredPct}%`}<Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica" }}>  {int(line.delivered)} of {int(line.going)}</Text></Text>
          <View style={{ marginTop: 2 }}><Bar value={line.delivered} of={line.going} colour={colour} width="100%" /></View>
          {behind != null && (
            <Text style={{ fontSize: 6.5, marginTop: 2, color: C.muted }}>
              vs {Math.round(pace.pct)}% through · <Text style={{ fontFamily: "Helvetica-Bold", color: behind >= 0 ? C.good : C.bad }}>{behind >= 0 ? `${behind} pts ahead` : `${-behind} pts behind`}</Text>
            </Text>
          )}
        </View>
      </View>
      <Text style={[s.kpiSub, { marginTop: 3 }]}>{int(line.arrived + line.due)} still to deliver · {int(line.arrived)} arrived · {int(line.due)} due</Text>
    </View>
  );
}

function DeliveriesPage({ input }: { input: PdfReportInput }) {
  const dv = deliveriesFor(input);
  const rows = dv.d;
  const st = orderStatsOf(rows);
  const execs = groupOrders(rows, ["exec"]);
  const models = groupOrders(rows, ["model"]);
  const funders = groupOrders(rows, ["funder"]);
  const MODELS = 10;
  const deliveredPct = rows.length ? Math.round((dv.delivered / rows.length) * 100) : null;
  return (
    <ReportPage title="Deliveries" input={input} note="Dealbook – Deliveries · counted in the month of the delivery date">
      <View style={s.stack}>
        {dv.lines ? (
          <View style={s.row}>
            <BudgetBox title="Car" colour={DEPARTMENT_COLOURS.car} line={dv.lines.car} pace={dv.pace} />
            <BudgetBox title="CV (commercial)" colour={DEPARTMENT_COLOURS.cv} line={dv.lines.cv} pace={dv.pace} />
            <BudgetBox title="Combined" colour={DEPARTMENT_COLOURS.combined} line={dv.lines.combined} pace={dv.pace} />
          </View>
        ) : <Text style={s.strip}>Budget is set by month — export a Month or Quarter to see Car, CV and Combined against budget.</Text>}
        <View style={s.row}>
          <Kpi label="Going" value={int(rows.length)} sub="delivered + arrived + due" />
          <Kpi label="Delivered" value={int(dv.delivered)} sub={deliveredPct == null ? undefined : `${deliveredPct}% of what's going`} />
          <Kpi label="Still to deliver" value={int(rows.length - dv.delivered)} sub={`${int(dv.arrived)} arrived · ${int(dv.due)} due`} />
          <Kpi label="Avg profit per unit" value={money(avgProfit(st))} hero sub={`${money(st.priced ? st.profit : null)} total`} />
          <SegmentKpis rows={rows} noun="units" />
        </View>
        {rows.length === 0 ? <Text style={s.note}>No deliveries in {input.range.label}.</Text> : (
          <View style={s.row}>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title="By exec">
                <Table cols={[
                  { label: "Exec", text: (g) => g.label },
                  { label: "Going", w: 30, text: (g) => int(g.stats.orders) },
                  { label: "Delivered", w: 44, text: (g) => int(g.rows.filter((r) => r.delivery === "Delivered").length) },
                  { label: "Total profit", w: 50, text: (g) => money(g.stats.priced ? g.stats.profit : null), tone: (g) => (g.stats.profit < 0 ? "bad" : undefined) },
                  { label: "Avg", w: 42, strong: true, text: (g) => money(avgProfit(g.stats)), tone: (g) => ((avgProfit(g.stats) ?? 0) < 0 ? "bad" : undefined) },
                ]} rows={execs} keyOf={(g) => g.key} />
              </Panel>
              <Panel title="By funder">
                <Table cols={[{ label: "Funder", text: (g) => g.label }, ...ORDER_EXEC_COLS("Units").slice(1)]} rows={funders} keyOf={(g) => g.key} />
              </Panel>
            </View>
            <View style={[s.stack, { flex: 1 }]}>
              <Panel title="By model" note="derivatives on the tab">
                <Table cols={[{ label: "Model", text: (g) => g.label }, ...ORDER_EXEC_COLS("Units").slice(1)]} rows={models.slice(0, MODELS)} keyOf={(g) => g.key} more={moreNote(MODELS, models.length, "models")} />
              </Panel>
            </View>
            <ProfitColumn rows={rows} noun="deliveries" />
          </View>
        )}
      </View>
    </ReportPage>
  );
}

// ─── 6 · Cancellations ─────────────────────────────────────────────────────

function CancellationsPage({ input }: { input: PdfReportInput }) {
  const c = inRange(input.cancellations, input.range);
  const proper = c.filter(isProper).sort((a, b) => b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer));
  const rewrites = c.filter((x) => !isProper(x)).sort((a, b) => b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer));
  const unexplained = c.filter(needsReason).length;
  const avgDays = proper.length ? proper.reduce((n, x) => n + daysToCancel(x), 0) / proper.length : null;
  const group = (keyOf: (x: CancellationView) => string) => {
    const m = new Map<string, CancellationView[]>();
    for (const x of c) m.set(keyOf(x), [...(m.get(keyOf(x)) ?? []), x]);
    return [...m].map(([label, xs]) => ({ label, proper: xs.filter(isProper).length, rewrites: xs.filter((x) => !isProper(x)).length, open: xs.filter(needsReason).length }))
      .sort((a, b) => b.proper - a.proper || b.rewrites - a.rewrites || a.label.localeCompare(b.label));
  };
  type G = ReturnType<typeof group>[number];
  const groupCols = (first: string): PCol<G>[] => [
    { label: first, text: (g) => g.label },
    { label: "Cancellations", w: 60, strong: true, text: (g) => int(g.proper), tone: (g) => (g.proper ? "bad" : undefined) },
    { label: "Re-Writes", w: 42, text: (g) => int(g.rewrites) },
    { label: "Reasons to add", w: 58, text: (g) => int(g.open), tone: (g) => (g.open ? "warn" : undefined) },
  ];
  const nameKey = (v: string) => v.toLowerCase().replace(/^(mr|mrs|ms|miss|mx|dr)\.?\s+/, "").replace(/[^a-z0-9]/g, "");
  return (
    <ReportPage title="Cancellations" input={input} note="Counted on the day cancelled · a Re-Write was ordered again and isn't counted">
      <View style={s.stack}>
        <View style={s.row}>
          <Kpi label="Cancellations" value={int(proper.length)} hero sub="cancelled and not re-ordered" />
          <Kpi label="Re-Writes" value={int(rewrites.length)} sub="cancelled and re-ordered — not counted" />
          <Kpi label="Reasons to add" value={int(unexplained)} tone={proper.length ? (unexplained ? "bad" : "good") : undefined} sub={proper.length ? `${int(proper.length - unexplained)} of ${int(proper.length)} explained` : undefined} />
          <Kpi label="Avg time to cancel" value={avgDays == null ? "—" : `${Math.round(avgDays)} days`} sub="from order to cancellation" />
        </View>
        {c.length === 0 ? <Text style={s.note}>No cancellations in {input.range.label}.</Text> : (
          <>
            <Panel title="Cancellations and their reasons" note="the manager's note from the tab" breakable>
              <Table cols={[
                { label: "Customer", w: 120, align: "left", text: (x) => x.customer },
                { label: "Vehicle", align: "left", text: (x) => x.vehicle },
                { label: "Exec", w: 70, align: "left", text: (x) => x.exec },
                { label: "Ordered", w: 38, text: (x) => shortDate(x.orderDay) },
                { label: "Cancelled", w: 46, text: (x) => shortDate(x.day) },
                { label: "Days", w: 26, text: (x) => int(daysToCancel(x)) },
                { label: "Profit", w: 40, text: (x) => money(x.orderProfit), tone: (x) => ((x.orderProfit ?? 0) < 0 ? "bad" : undefined) },
                { label: "Reason", w: 220, align: "left", wrap: true, text: (x) => x.note || "Reason needed", tone: (x) => (x.note ? undefined : "warn") },
              ]} rows={proper} keyOf={(x) => x.id} empty="None — everything cancelled in this period was ordered again." />
            </Panel>
            <View style={s.row}>
              <Panel title="Re-Writes" note="shown, not counted" flex={1.7} breakable>
                <Table cols={[
                  { label: "Customer", text: (x) => x.customer },
                  { label: "Exec", w: 70, align: "left", text: (x) => x.exec },
                  { label: "Ordered", w: 38, text: (x) => shortDate(x.orderDay) },
                  { label: "Cancelled", w: 46, text: (x) => shortDate(x.day) },
                  {
                    label: "Re-ordered", w: 160, align: "left", wrap: true,
                    text: (x) => (x.reorder
                      ? [shortDate(x.reorder.orderDay), nameKey(x.reorder.customer) !== nameKey(x.customer) ? `as ${x.reorder.customer}` : "", x.reorder.registration ?? ""].filter(Boolean).join(" · ")
                      : "Marked by a manager"),
                  },
                  { label: "Matched on", w: 62, align: "left", text: (x) => (x.reorder ? (x.reorder.on === "registration" ? "registration" : "customer + model") : "—") },
                ]} rows={rewrites} keyOf={(x) => x.id} empty="None in this period." />
              </Panel>
              <View style={[s.stack, { flex: 1 }]}>
                <Panel title="By exec"><Table cols={groupCols("Exec")} rows={group((x) => x.exec)} keyOf={(g) => g.label} /></Panel>
                <Panel title="By model"><Table cols={groupCols("Model")} rows={group((x) => x.model)} keyOf={(g) => g.label} /></Panel>
              </View>
            </View>
          </>
        )}
      </View>
    </ReportPage>
  );
}

// ─── 7 · Market Analysis ───────────────────────────────────────────────────

const gapTone = (gap: number | null): Tone => (gap == null ? undefined : gap <= 0 ? "good" : gap <= 20 ? "warn" : "bad");

function MarketColumn({ sg }: { sg: MarketSegmentView }) {
  const meta = MARKET_META[sg.segment] ?? { title: sg.segment, colour: C.muted };
  const o = sg.overall;
  const RANGES = 10;
  return (
    <View style={[s.stack, { flex: 1 }]}>
      <View style={[s.box, { borderTopWidth: 2.5, borderTopColor: meta.colour }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}>{meta.title}</Text>
          <Text style={s.note}>{int(o.compared)} deals compared</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 3, alignItems: "flex-end" }}>
          <View>
            <Text style={s.kpiLabel}>WE&apos;RE CHEAPEST ON</Text>
            <Text style={[s.kpiValue, { fontSize: 16 }]}>{pct(share(o.cheapest, o.compared), 0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: toneColour(gapTone(o.gap)) ?? C.ink }}>{gapText(o.gap)}</Text>
            <Text style={[s.kpiSub, { fontSize: 6.8 }]}>Lowest headline on {pct(share(o.headline.lowest, o.headline.compared), 0)} · our avg {money(o.tfAvg)} vs cheapest rival {money(o.mktAvg)}</Text>
          </View>
        </View>
      </View>
      <Panel title={`${meta.title} by range`} note="most-compared first · gap + is dearer">
        <Table cols={[
          { label: "Range", text: (r) => r.name },
          { label: "Deals", w: 34, text: (r) => int(r.stats.compared) },
          { label: "Cheapest", w: 62, strong: true, text: (r) => pct(share(r.stats.cheapest, r.stats.compared), 0), bar: (r) => ({ value: r.stats.cheapest, of: r.stats.compared, colour: meta.colour }) },
          { label: "Avg gap", w: 40, strong: true, text: (r) => signedMoney(r.stats.gap), tone: (r) => gapTone(r.stats.gap) },
          { label: "Headline", w: 40, text: (r) => pct(share(r.stats.headline.lowest, r.stats.headline.compared), 0) },
        ]} rows={sg.ranges.slice(0, RANGES)} keyOf={(r) => r.name} more={moreNote(RANGES, sg.ranges.length, "ranges")} />
      </Panel>
      <Panel title={`Who undercuts us · ${meta.title.toLowerCase()}`} note="deals where both of us are priced">
        <Table cols={[
          { label: "Broker", text: (r) => r.broker },
          { label: "Head to head", w: 50, text: (r) => int(r.headToHead) },
          { label: "Cheaper", w: 62, strong: true, text: (r) => `${int(r.undercuts)} (${pct(share(r.undercuts, r.headToHead), 0)})`, tone: () => "bad" },
          { label: "By, avg", w: 42, text: (r) => (r.avgUndercut == null ? "—" : `£${Math.round(r.avgUndercut)}/mo`) },
        ]} rows={sg.competitors} keyOf={(r) => r.broker} empty="Nobody undercuts us on these deals." />
      </Panel>
    </View>
  );
}

function MarketPage({ input }: { input: PdfReportInput }) {
  const m = input.market;
  if (!m || m.segments.length === 0) {
    return (
      <ReportPage title="Market Analysis" input={input} period="No scrape yet">
        <Text style={s.note}>No market data yet. Each scrape from the RateX app appears here as soon as it finishes.</Text>
      </ReportPage>
    );
  }
  const all = marketTotals(m.segments);
  return (
    <ReportPage title="Market Analysis" input={input} period={`Latest scrape · ${scrapeWhen(m.run.startedAt)}`}
      note={`${m.run.label ? `${m.run.label} · ` : ""}${int(m.run.totalResults)} leasing.com prices · not tied to the period`}>
      <View style={s.stack}>
        <View style={s.row}>
          <Kpi label="We're cheapest" value={pct(share(all.cheapest, all.compared), 0)} hero sub={`on ${int(all.cheapest)} of ${int(all.compared)} like-for-like deals`} />
          <Kpi label="Lowest headline price" value={pct(share(all.headlineLowest, all.headlineCompared), 0)} sub={`on ${int(all.headlineLowest)} of ${int(all.headlineCompared)} — our best at any term vs theirs`} />
          <Kpi label="Avg gap to cheapest" value={signedMoney(all.gap)} tone={all.gap == null ? undefined : all.gap <= 0 ? "good" : "bad"} sub="per month, like-for-like · + is dearer" />
        </View>
        <View style={s.row}>
          {m.segments.map((sg) => <MarketColumn key={sg.segment} sg={sg} />)}
        </View>
      </View>
    </ReportPage>
  );
}

// ─── The document ──────────────────────────────────────────────────────────

export function TenAtTenPdf(input: PdfReportInput) {
  return (
    <Document title={`10 at 10 — ${input.range.label}`} author="TrustFord Leasing" subject="10 at 10" creator="TF Leasing">
      <SummaryPage input={input} />
      <EnquiriesPage input={input} />
      <ResponsePage input={input} />
      <OrdersPage input={input} />
      <DeliveriesPage input={input} />
      <CancellationsPage input={input} />
      <MarketPage input={input} />
    </Document>
  );
}
