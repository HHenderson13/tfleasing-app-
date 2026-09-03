// The three-month selling window on a pre-registered vehicle.
//
// A pre-reg has to be sold within three months of its registration date, so
// the useful number on the card is not "delivered N days ago" — it is how
// long is left. Past the window the vehicle can still be sold, but not
// without checking first, so it says so rather than disappearing.

export const PRE_REG_WINDOW_MONTHS = 3;

export interface PreRegWindow {
  daysSince: number;      // days since registration, 0 on the day itself
  daysRemaining: number;  // days left to sell; negative once past the window
  expired: boolean;
}

// Whole days between two dates, counted on the calendar rather than in
// elapsed milliseconds — a vehicle registered yesterday is one day old even
// if that was 23 hours ago, and the clocks changing must not make it two.
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

// Three months after a date, clamped to the end of the target month.
// 30 November + 3 months is 28 February, not 2 March: the deadline must land
// inside the month a person would name, and adding 90 days would drift.
export function sellByDate(registeredAt: Date, months = PRE_REG_WINDOW_MONTHS): Date {
  const y = registeredAt.getFullYear();
  const m = registeredAt.getMonth() + months;
  const d = registeredAt.getDate();
  const lastDayOfTarget = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, lastDayOfTarget));
}

export function preRegWindow(registeredAt: Date, now: Date = new Date()): PreRegWindow {
  const daysSince = calendarDaysBetween(registeredAt, now);
  const daysRemaining = calendarDaysBetween(now, sellByDate(registeredAt));
  return { daysSince, daysRemaining, expired: daysRemaining < 0 };
}
