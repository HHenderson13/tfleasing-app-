// Day / week / month period selection for the Enquiry Tracker.
//
// Everything here works in plain "YYYY-MM-DD" day keys and UTC-encoded
// dates, matching how enquiry timestamps are stored (see business-hours.ts
// — local wall clock re-encoded as UTC). No timezone conversion happens,
// so a period boundary means the same thing year-round.

export type Granularity = "day" | "week" | "month";

export interface Period {
  granularity: Granularity;
  /** Any day inside the period — the period is derived from it. */
  anchor: string;
  startDay: string;
  endDay: string;
  /** Human label, e.g. "Thu 13 Aug 2026", "10–16 Aug 2026", "August 2026". */
  label: string;
  /** Short label for tight spaces, e.g. "13 Aug", "10–16 Aug", "Aug 2026". */
  shortLabel: string;
}

const MS_PER_DAY = 86_400_000;

export function toDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** True for a well-formed "YYYY-MM-DD" that is a real calendar date. */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return toDayKey(fromDayKey(v)) === v;
}

// en-GB renders a weekday as "Thu, 13 Aug"; the comma reads awkwardly in
// a compact period label, so it is stripped. Month abbreviations are left
// as the locale gives them ("Sept", not "Sep") — that is correct en-GB.
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("en-GB", { timeZone: "UTC", ...opts }).replace(",", "");

/**
 * Build the period containing `anchor`.
 *
 * Weeks run Monday–Sunday, the UK working convention: a week label of
 * "10–16 Aug" then covers exactly one working week plus its weekend, so
 * weekend enquiries sit in the same bucket as the Friday they follow.
 */
export function buildPeriod(granularity: Granularity, anchor: string): Period {
  const a = fromDayKey(anchor);

  let start: Date;
  let end: Date;
  if (granularity === "day") {
    start = a;
    end = a;
  } else if (granularity === "week") {
    // getUTCDay: 0=Sun … 6=Sat. Shift so Monday is 0.
    const offset = (a.getUTCDay() + 6) % 7;
    start = new Date(a.getTime() - offset * MS_PER_DAY);
    end = new Date(start.getTime() + 6 * MS_PER_DAY);
  } else {
    start = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    end = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
  }

  let label: string;
  let shortLabel: string;
  if (granularity === "day") {
    label = fmt(start, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    shortLabel = fmt(start, { day: "numeric", month: "short" });
  } else if (granularity === "week") {
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const left = sameMonth
      ? fmt(start, { day: "numeric" })
      : fmt(start, { day: "numeric", month: "short" });
    const right = fmt(end, { day: "numeric", month: "short", year: "numeric" });
    label = `${left} – ${right}`;
    shortLabel = `${left} – ${fmt(end, { day: "numeric", month: "short" })}`;
  } else {
    label = fmt(start, { month: "long", year: "numeric" });
    shortLabel = fmt(start, { month: "short", year: "numeric" });
  }

  return {
    granularity,
    anchor,
    startDay: toDayKey(start),
    endDay: toDayKey(end),
    label,
    shortLabel,
  };
}

/** Move one period forward (+1) or back (-1), returning the new anchor. */
export function shiftAnchor(granularity: Granularity, anchor: string, direction: 1 | -1): string {
  const a = fromDayKey(anchor);
  if (granularity === "day") {
    return toDayKey(new Date(a.getTime() + direction * MS_PER_DAY));
  }
  if (granularity === "week") {
    return toDayKey(new Date(a.getTime() + direction * 7 * MS_PER_DAY));
  }
  // Month: anchor to the 1st so month-length differences can't skid (e.g.
  // stepping back from 31 Mar must land in February, not 3 March).
  return toDayKey(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + direction, 1)));
}

/**
 * Keep an anchor inside the range of days we actually hold, so the arrows
 * cannot wander off into empty periods forever. Returns null when there is
 * no data at all.
 */
export function clampAnchor(
  anchor: string,
  min: string | null,
  max: string | null,
): string | null {
  if (!min || !max) return null;
  if (anchor < min) return min;
  if (anchor > max) return max;
  return anchor;
}

/** Whether stepping in this direction would leave the data entirely. */
export function canStep(
  granularity: Granularity,
  anchor: string,
  direction: 1 | -1,
  min: string | null,
  max: string | null,
): boolean {
  if (!min || !max) return false;
  const next = buildPeriod(granularity, shiftAnchor(granularity, anchor, direction));
  // Allow the step if the resulting period still overlaps the held data.
  return next.endDay >= min && next.startDay <= max;
}

/** Rows whose enquiry day falls inside the period. */
export function inPeriod<T extends { enquiryDay: string }>(rows: readonly T[], p: Period): T[] {
  return rows.filter((r) => r.enquiryDay >= p.startDay && r.enquiryDay <= p.endDay);
}
