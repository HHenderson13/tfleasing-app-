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
export function watermarkDenseDataUri(lines: WatermarkLines, opacity = 0.16): string {
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
// On the opacity: this is deliberately set where you cannot miss it. A
// watermark works by being SEEN — the deterrent is the broker knowing,
// while they look at the page, that their name is on anything they capture.
// One tuned down until it stopped being distracting would still identify a
// leaker after the fact, but it would no longer stop the leak, which is the
// point. 0.2 is legible over white without stopping anyone reading the
// vehicle underneath; the banner in watermark-frame.tsx says the same thing
// in words for anyone who still hasn't noticed.
export function watermarkDataUri(lines: WatermarkLines, opacity = 0.2): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='430' height='215'>` +
    `<g transform='rotate(-26 215 107)' fill='rgb(15,23,42)' fill-opacity='${opacity}' ` +
    `font-family='ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='16' font-weight='700'>` +
    `<text x='10' y='96'>${xmlEscape(lines.primary)}</text>` +
    `<text x='10' y='118' font-size='12.5' font-weight='600'>${xmlEscape(lines.secondary)}</text>` +
    `<text x='10' y='138' font-size='11' font-weight='600' fill-opacity='${opacity * 0.85}'>TrustFord confidential · do not share</text>` +
    `</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Both layers, in paint order: dense email on top, full detail behind.
export function watermarkBackground(lines: WatermarkLines): string {
  return `${watermarkDenseDataUri(lines)}, ${watermarkDataUri(lines)}`;
}

// The wall-clock half of the detail line, kept here so the server render and
// the client refresh format it identically.
export function watermarkStamp(now: Date): string {
  return now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
