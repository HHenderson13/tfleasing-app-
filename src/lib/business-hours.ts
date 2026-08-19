// Business-hours elapsed-time maths for the Enquiry Tracker.
//
// The working day is Mon–Fri, 09:00–17:30 (UK local wall-clock). Time
// outside those windows does not count towards any target — the clock
// pauses overnight, at weekends, and before the day opens.
//
// ── Timezone handling ───────────────────────────────────────────────
// Every timestamp is stored and compared as *local wall clock*, encoded
// as a UTC epoch (i.e. "1 Aug 2026 09:00" → Date.UTC(2026, 7, 1, 9, 0)).
// This is deliberate: the targets are expressed in local office time, so
// 09:00 means 09:00 whether or not BST is in effect. Doing the maths in
// wall-clock space makes the whole thing DST-proof — there is no
// conversion that could shift a 09:00 open to 08:00 or 10:00 twice a
// year. The only rule is that parse and compare must both go through
// this module's helpers so the encoding stays consistent.

/** Working day opens (minutes from midnight). 09:00. */
export const DAY_OPEN_MIN = 9 * 60;
/** Working day closes (minutes from midnight). 17:30. */
export const DAY_CLOSE_MIN = 17 * 60 + 30;
/** Length of one working day in minutes (8h30 = 510). */
export const WORKING_DAY_MINS = DAY_CLOSE_MIN - DAY_OPEN_MIN;

/** Targets, in business minutes. */
export const ALLOCATION_TARGET_MINS = 5;   // sales support: enquiry → transfer
export const CONTACT_TARGET_MINS = 15;     // sales exec: transfer → first contact

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
const REPORT_TIME_ZONE = "Europe/London";

/**
 * True when the given wall-clock epoch falls on a working weekday.
 * Uses UTC getters because wall-clock is encoded as UTC (see header).
 */
export function isWorkingDay(wallMs: number): boolean {
  const dow = new Date(wallMs).getUTCDay(); // 0=Sun … 6=Sat
  return dow >= 1 && dow <= 5;
}

/** Midnight (00:00) of the day containing `wallMs`, as a wall-clock epoch. */
function startOfDay(wallMs: number): number {
  return Math.floor(wallMs / MS_PER_DAY) * MS_PER_DAY;
}

/** Minutes past midnight for `wallMs`. */
function minutesIntoDay(wallMs: number): number {
  return (wallMs - startOfDay(wallMs)) / MS_PER_MIN;
}

/**
 * Business minutes elapsed between two wall-clock epochs, counting only
 * Mon–Fri 09:00–17:30.
 *
 * Walks day by day and sums the overlap of [start, end] with each day's
 * open window. Day-by-day (rather than a closed-form weeks×510 formula)
 * keeps it obviously correct at the cost of one iteration per calendar
 * day spanned — irrelevant for enquiry turnarounds, which are hours.
 *
 * Returns 0 when `end` is at or before `start`, and when the whole
 * interval sits outside working hours (e.g. an enquiry at 03:00 that is
 * transferred at 08:00 the same morning — nothing counts because the
 * office had not opened).
 */
export function businessMinutesBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  if (endMs <= startMs) return 0;

  let total = 0;
  let cursor = startOfDay(startMs);
  const lastDay = startOfDay(endMs);

  // Guard against pathological inputs (bad parse producing a decade-long
  // span) so a single malformed row can't spin the loop.
  const maxDays = 400;
  let guard = 0;

  while (cursor <= lastDay && guard++ < maxDays) {
    if (isWorkingDay(cursor)) {
      const open = cursor + DAY_OPEN_MIN * MS_PER_MIN;
      const close = cursor + DAY_CLOSE_MIN * MS_PER_MIN;
      const from = Math.max(startMs, open);
      const to = Math.min(endMs, close);
      if (to > from) total += (to - from) / MS_PER_MIN;
    }
    cursor += MS_PER_DAY;
  }
  return Math.round(total);
}

/**
 * Start of the UK-local calendar day on which a report was uploaded,
 * encoded in the same wall-clock epoch format as enquiry timestamps.
 *
 * The MotorComplete export is one day behind. Treating its upload day as
 * an exclusive data horizon means a Monday upload contains completed
 * activity only up to Monday 00:00. Weekend enquiries have accrued no
 * working time by then, so their blank transfer/contact fields are still
 * pending until a later upload. Deriving this from the upload instant (not
 * the page-view time) also prevents a stale dashboard ageing overnight.
 */
export function reportingHorizonFromInstant(instant: Date | number): number {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return Number.NaN;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * The moment an enquiry becomes reportable: the close (17:30) of the
 * working day in which its clock starts.
 *
 * An enquiry's clock starts at the first working minute at or after it was
 * raised — same rule the elapsed-time maths uses. So:
 *
 *   raised Fri 10:00  → clock starts Fri 10:00 → reportable after Fri 17:30
 *   raised Fri 19:00  → clock starts Mon 09:00 → reportable after Mon 17:30
 *   raised Sat 14:00  → clock starts Mon 09:00 → reportable after Mon 17:30
 *   raised Mon 07:00  → clock starts Mon 09:00 → reportable after Mon 17:30
 *
 * The effect is that the team always gets a complete working day to action
 * an enquiry before it is judged, and the report sits one working day
 * behind the current day. A weekend enquiry looked at on Monday morning is
 * not yet due — nobody has had a day to work it.
 */
export function reportableAfter(enquiryWallMs: number): number {
  if (!Number.isFinite(enquiryWallMs)) return Number.NaN;

  let day = startOfDay(enquiryWallMs);
  const mins = minutesIntoDay(enquiryWallMs);

  // If it landed outside a working window, roll to the next working day.
  const landedInsideOpenDay = isWorkingDay(enquiryWallMs) && mins < DAY_CLOSE_MIN;
  if (!landedInsideOpenDay) {
    day += MS_PER_DAY;
    let guard = 0;
    while (!isWorkingDay(day) && guard++ < 14) day += MS_PER_DAY;
  }
  return day + DAY_CLOSE_MIN * MS_PER_MIN;
}

/**
 * Has this enquiry had a full working day to be actioned, as at the report
 * horizon? Only reportable enquiries appear in any metric — the rest are
 * held back until the next upload, so today's half-worked leads never land
 * in the numbers as failures.
 *
 * A null/invalid horizon means "no lag information", in which case
 * everything is reportable rather than nothing.
 */
export function isEnquiryReportable(
  enquiryWallMs: number,
  reportHorizonWallMs: number | null,
): boolean {
  if (reportHorizonWallMs == null || !Number.isFinite(reportHorizonWallMs)) return true;
  const due = reportableAfter(enquiryWallMs);
  if (!Number.isFinite(due)) return false;
  return due <= reportHorizonWallMs;
}

/**
 * Whether an enquiry raised at `wallMs` is in scope for the "contacted
 * same day" measure: it must land on a working weekday, at a wall-clock
 * time before the 17:30 close.
 *
 * Enquiries that arrive at the weekend, or after close on a weekday, are
 * excluded — there is no remaining working time in which to contact them,
 * so counting them as a same-day miss would be measuring the calendar,
 * not the team. They still appear in the allocation / contact timing
 * measures, which correctly resume at 09:00 the next working day.
 */
export function isSameDayContactExpected(enquiryWallMs: number): boolean {
  if (!Number.isFinite(enquiryWallMs)) return false;
  if (!isWorkingDay(enquiryWallMs)) return false;
  return minutesIntoDay(enquiryWallMs) < DAY_CLOSE_MIN;
}

/**
 * Did first contact happen on the same calendar day the enquiry was
 * raised? `contactWallMs` of null (never contacted) is always a miss.
 * Only meaningful when isSameDayContactExpected() is true.
 */
export function wasContactedSameDay(
  enquiryWallMs: number,
  contactWallMs: number | null | undefined,
): boolean {
  if (contactWallMs == null || !Number.isFinite(contactWallMs)) return false;
  return startOfDay(enquiryWallMs) === startOfDay(contactWallMs);
}

/** The date key ("YYYY-MM-DD") of a wall-clock epoch — used to group by day. */
export function dayKey(wallMs: number): string {
  const d = new Date(startOfDay(wallMs));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse the export's timestamp format into a wall-clock epoch.
 *
 * The MotorComplete export writes dates as "1 August 2026 01:17" — day,
 * full month name, year, 24h time. Some cells also arrive as real Excel
 * dates (a JS Date once xlsx has parsed them), so both are handled.
 * Returns null for blanks and anything unrecognised, which the caller
 * treats as "no timestamp recorded" rather than failing the whole row.
 */
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export function parseExportTimestamp(raw: unknown): number | null {
  if (raw == null || raw === "") return null;

  // Already a Date (xlsx parsed a real date cell). Its getters are local,
  // but we want the wall-clock components re-encoded as UTC.
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return Date.UTC(
      raw.getFullYear(), raw.getMonth(), raw.getDate(),
      raw.getHours(), raw.getMinutes(), 0, 0,
    );
  }

  const s = String(raw).trim();
  if (!s) return null;

  // "1 August 2026 01:17" / "14 Aug 2026" (time optional)
  const m = s.match(
    /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].toLowerCase()];
    const year = parseInt(m[3], 10);
    if (month === undefined) return null;
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    if (day < 1 || day > 31 || hh > 23 || mm > 59) return null;
    return Date.UTC(year, month, day, hh, mm, 0, 0);
  }

  // ISO-ish fallback: "2026-08-01 09:15" / "2026-08-01T09:15:00"
  const iso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/,
  );
  if (iso) {
    return Date.UTC(
      parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10),
      iso[4] ? parseInt(iso[4], 10) : 0, iso[5] ? parseInt(iso[5], 10) : 0, 0, 0,
    );
  }
  return null;
}

/** Format a wall-clock epoch back to "DD/MM/YYYY HH:MM" for display. */
export function formatWall(wallMs: number | null | undefined): string {
  if (wallMs == null || !Number.isFinite(wallMs)) return "—";
  const d = new Date(wallMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Human-friendly duration: 0 → "0m", 95 → "1h 35m", 620 → "10h 20m". */
export function formatMins(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
