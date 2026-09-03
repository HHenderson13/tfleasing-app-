import "server-only";
import { createHash } from "node:crypto";
import type { CurrentBrokerUser } from "./broker-auth";

// ─── Forensic watermarking ─────────────────────────────────────────────────
//
// The honest position first: a web page CANNOT stop a screenshot. Print
// Screen, macOS Cmd+Shift+4, the Windows Snipping Tool and the button combo
// on every phone capture the OS framebuffer. The browser is not consulted
// and has no API to object. Any product claiming otherwise is selling
// deterrence.
//
// So we aim at the thing that actually changes behaviour: making every
// capture carry the identity of the person who took it. A broker who knows
// their name and email are painted across the stock list — and that we can
// tell whose screenshot it is from the picture alone — behaves differently
// from one looking at a clean page. That is the whole mechanism.
//
// The tile is built server-side and inlined as a background-image, so the
// text is present in the HTML that renders even if JS never runs. The
// client-side enforcer in screen-guard.tsx watches it and blanks the page
// if it is removed.

// Short, stable, non-reversible tag for the session. Enough to tie a
// screenshot to one sign-in without printing a usable session id on screen
// (a full one in a shared screenshot would be a live credential).
export function sessionTag(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 6).toUpperCase();
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface WatermarkLines {
  primary: string;
  secondary: string;
  // Short enough to fit the dense tile, and still unique to one person.
  dense: string;
}

// Two lines: who, then where-and-when. Kept short so the tile stays legible
// at low opacity — a watermark nobody can read identifies nobody.
export function watermarkLines(me: CurrentBrokerUser, sessionId: string, now = new Date()): WatermarkLines {
  const stamp = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return {
    primary: `${me.name} · ${me.email}`,
    secondary: `${me.brokerName} · ${stamp} · ${sessionTag(sessionId)}`,
    dense: me.email,
  };
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
