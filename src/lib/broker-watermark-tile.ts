// Client-safe half of the watermark. Split from broker-watermark.ts the same
// way stock-reference.ts is split from stock-reference-mint.ts: minting the
// session tag needs node:crypto and must stay on the server, but the browser
// needs to BUILD tiles so ScreenGuard can refresh the timestamp as the page
// stays open.
//
// Why the timestamp ticks: on iOS and Android a screenshot uses hardware
// buttons the browser never sees, so no event fires and no alert is sent.
// The watermark is the only forensic trace, and a stale render time would
// pin a leaked mobile screenshot only to when the tab was opened — which
// could be hours out. Refreshing it means the image names the minute.

export interface WatermarkLines {
  primary: string;
  secondary: string;
  // Short enough to fit the dense tile, and still unique to one person.
  dense: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Two strengths ─────────────────────────────────────────────────────────
//
// FAINT is what the portal wears all day. It has to be present always,
// because the captures we cannot detect — every phone screenshot, a photo
// of the screen, OBS — take whatever is on screen at that moment, and a
// watermark that is not already there cannot be added afterwards. At this
// opacity it reads as a faint texture in normal use and is perfectly
// legible when the image is opened and looked at, which is the only moment
// it has to be legible.
//
// LOUD is raised the instant we detect a capture chord. It is not decoration:
// a region snip (Cmd+Shift+4, Win+Shift+S) and a screen recording
// (Cmd+Shift+5) both work in two steps — press the chord, THEN drag the box
// or start recording — and that gap is long enough to repaint. So the snip
// and the recording capture the loud version, which is the whole point of
// having two strengths rather than one compromise.
//
// Cmd+Shift+3 takes the whole screen immediately and will usually catch the
// faint one. That is what the faint one is for.
export const WATERMARK_FAINT = { detail: 0.055, dense: 0.045 };
export const WATERMARK_LOUD = { detail: 0.32, dense: 0.24 };
export type WatermarkStrength = { detail: number; dense: number };

// Two tiles, layered, because one cannot do both jobs.
//
// A background tile repeats every WxH, so a crop is only GUARANTEED to
// contain a complete watermark if the tile is smaller than the crop in both
// axes. The detail tile below is 430x215 — big enough to carry name, email,
// broker, time and ref legibly, and therefore big enough that an area snip
// of a single vehicle card (roughly 1100x150) can land between rows and
// catch nothing usable. That is exactly the capture someone leaking one
// price would take.
//
// So the detail tile is paired with a dense tile carrying just the email,
// small enough (200x100) that any snip worth taking contains at least one
// complete copy. Both are painted as layers of one background-image, which
// keeps it a single node for the tamper check in screen-guard.tsx.

// The identifying string, on its own, repeated tightly. An email address is
// the single most useful thing to recover from a leaked crop: it names one
// person and one company at once.
export function watermarkDenseDataUri(lines: WatermarkLines, opacity = WATERMARK_FAINT.dense): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'>` +
    `<g transform='rotate(-26 100 50)' fill='rgb(15,23,42)' fill-opacity='${opacity}' ` +
    `font-family='ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='9' font-weight='600'>` +
    `<text x='6' y='54'>${xmlEscape(lines.dense)}</text>` +
    `</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// A repeating SVG tile, rotated so it crosses content at an angle. Angled
// text survives cropping better than horizontal (a crop that removes every
// full line is hard to make without also removing the data) and is harder
// to paint out.
//
// Opacity is passed in — see WATERMARK_FAINT / WATERMARK_LOUD above. The
// deterrent job that a permanently loud watermark used to do is now done by
// the banner (which says, in words, that the page is watermarked) and by the
// loud repaint landing in any snip or recording.
export function watermarkDataUri(lines: WatermarkLines, opacity = WATERMARK_FAINT.detail): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='430' height='215'>` +
    `<g transform='rotate(-26 215 107)' fill='rgb(15,23,42)' fill-opacity='${opacity}' ` +
    `font-family='ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='16' font-weight='700'>` +
    `<text x='10' y='96'>${xmlEscape(lines.primary)}</text>` +
    `<text x='10' y='118' font-size='12.5' font-weight='600'>${xmlEscape(lines.secondary)}</text>` +
    `<text x='10' y='138' font-size='11' font-weight='600' fill-opacity='${opacity * 0.85}'>Confidential · do not share</text>` +
    `</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Both layers, in paint order: dense email on top, full detail behind.
export function watermarkBackground(lines: WatermarkLines, strength: WatermarkStrength = WATERMARK_FAINT): string {
  return `${watermarkDenseDataUri(lines, strength.dense)}, ${watermarkDataUri(lines, strength.detail)}`;
}

// The wall-clock half of the detail line, kept here so the server render and
// the client refresh format it identically.
export function watermarkStamp(now: Date): string {
  return now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
