"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// A small time-series line chart for the Trends tab. One y-axis, always:
// two measures on different scales get two charts, never a second axis.
//
// Marks follow the house chart spec: 2px lines, r=4 markers with a 2px
// surface ring, hairline solid gridlines, values in text colours (never the
// series colour), a legend only when there are two or more series, and a
// crosshair that snaps to the nearest run with every series in one tooltip.

export interface ChartSeries {
  name: string;
  color: string;
  values: Array<number | null>;
}

export interface ChartPoint {
  x: number;      // epoch ms
  label: string;  // what the tooltip calls this point
}

const PAD = { top: 14, right: 58, bottom: 26, left: 52 };
const SURFACE = "#ffffff";
const GRID = "#e2e8f0";
const AXIS_TEXT = "#94a3b8";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function LineChart({
  title,
  subtitle,
  points,
  series,
  format,
  domain,
  zero = false,
  height = 200,
}: {
  title: string;
  subtitle?: string;
  points: ChartPoint[];
  series: ChartSeries[];
  format: (v: number) => string;
  domain?: [number, number];
  zero?: boolean; // draw the 0 line a step darker — the "level with the market" line
  height?: number;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (width <= 0 || points.length === 0) return null;
    const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (all.length === 0) return null;
    let lo = domain ? domain[0] : Math.min(...all, zero ? 0 : Infinity);
    let hi = domain ? domain[1] : Math.max(...all, zero ? 0 : -Infinity);
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep(hi - lo, 4);
    if (!domain) {
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
    }
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);

    const x0 = points[0].x;
    const x1 = points[points.length - 1].x;
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const sx = (x: number) => PAD.left + (x1 === x0 ? innerW / 2 : ((x - x0) / (x1 - x0)) * innerW);
    const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

    // Month ticks, thinned to fit.
    const monthTicks: { x: number; label: string }[] = [];
    const d = new Date(x0);
    const cursor = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 1 ? 1 : 0), 1);
    const spansYears = new Date(x0).getFullYear() !== new Date(x1).getFullYear();
    while (cursor.getTime() <= x1) {
      monthTicks.push({
        x: sx(cursor.getTime()),
        label: MONTHS[cursor.getMonth()] + (spansYears && cursor.getMonth() === 0 ? ` ${cursor.getFullYear()}` : ""),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const every = Math.max(1, Math.ceil((monthTicks.length * 44) / innerW));
    const xTicks = monthTicks.filter((_, i) => i % every === 0);

    return { ticks, sx, sy, innerW, xTicks };
  }, [width, height, points, series, domain, zero]);

  // End labels sit at the right of each line. If two would collide they are
  // dropped rather than nudged apart — the legend and tooltip carry them.
  const endLabels = useMemo(() => {
    if (!geo) return [];
    const last = series
      .map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] === null) i--;
        return i >= 0 ? { s, i, y: geo.sy(s.values[i]!) } : null;
      })
      .filter((x): x is { s: ChartSeries; i: number; y: number } => x !== null);
    const collide = last.some((a, i) => last.some((b, j) => i < j && Math.abs(a.y - b.y) < 13));
    return collide ? [] : last;
  }, [geo, series]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + PAD.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(geo.sx(points[i].x) - px) < Math.abs(geo.sx(points[best].x) - px)) best = i;
    }
    setHover(best);
  };

  const hx = geo && hover !== null ? geo.sx(points[hover].x) : 0;

  return (
    <div className="lc">
      <div className="lc-head">
        <div className="lc-title">{title}</div>
        {subtitle && <div className="lc-sub">{subtitle}</div>}
        {series.length > 1 && (
          <div className="lc-legend">
            {series.map((s) => (
              <span key={s.name}>
                <i style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div ref={wrapRef} className="lc-plot" style={{ height }}>
        {geo && (
          <svg width={width} height={height} role="img" aria-label={title}>
            {geo.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + geo.innerW}
                  y1={geo.sy(t)}
                  y2={geo.sy(t)}
                  stroke={zero && t === 0 ? "#94a3b8" : GRID}
                  strokeWidth={1}
                />
                <text x={PAD.left - 8} y={geo.sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(t)}
                </text>
              </g>
            ))}
            {geo.xTicks.map((t) => (
              <text key={t.label + t.x} x={t.x} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                {t.label}
              </text>
            ))}

            {series.map((s) => {
              // Gaps in the data stay gaps: a run that didn't cover the
              // segment breaks the line instead of being bridged.
              let d = "";
              let pen = false;
              s.values.forEach((v, i) => {
                if (v === null) { pen = false; return; }
                d += `${pen ? "L" : "M"}${geo.sx(points[i].x)},${geo.sy(v)}`;
                pen = true;
              });
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {s.values.map((v, i) =>
                    v === null ? null : (
                      <circle key={i} cx={geo.sx(points[i].x)} cy={geo.sy(v)} r={hover === i ? 5 : 4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                    )
                  )}
                </g>
              );
            })}

            {endLabels.map(({ s, i, y }) => (
              <text key={s.name} x={geo.sx(points[i].x) + 10} y={y} dy="0.32em" fontSize={11} fontWeight={600} fill="#0f172a">
                {format(s.values[i]!)}
              </text>
            ))}

            {hover !== null && (
              <line x1={hx} x2={hx} y1={PAD.top} y2={height - PAD.bottom} stroke="#94a3b8" strokeWidth={1} />
            )}
            <rect
              x={PAD.left}
              y={0}
              width={geo.innerW}
              height={height}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {geo && hover !== null && (
          <div
            className="lc-tip"
            style={{
              left: Math.min(Math.max(hx, 90), width - 90),
              top: 4,
            }}
          >
            <div className="lc-tip-label">{points[hover].label}</div>
            {series.map((s) => (
              <div key={s.name} className="lc-tip-row">
                <i style={{ background: s.color }} />
                <strong>{s.values[hover] === null ? "—" : format(s.values[hover]!)}</strong>
                {series.length > 1 && <span>{s.name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
