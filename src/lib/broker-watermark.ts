import "server-only";
import { createHash } from "node:crypto";
import type { CurrentBrokerUser } from "./broker-auth";
import { watermarkStamp, type WatermarkLines } from "./broker-watermark-tile";

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
// client-side enforcer in screen-guard.tsx watches it, refreshes its
// timestamp, and blanks the page if it is removed.
//
// This file is the SERVER-ONLY half: minting the session tag needs
// node:crypto. The tile builders live in broker-watermark-tile.ts so the
// browser can rebuild them too.

// Short, stable, non-reversible tag for the session. Enough to tie a
// screenshot to one sign-in without printing a usable session id on screen
// (a full one in a shared screenshot would be a live credential).
export function sessionTag(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 6).toUpperCase();
}

// Two lines: who, then where-and-when. Kept short so the tile stays legible
// at low opacity — a watermark nobody can read identifies nobody.
export function watermarkLines(me: CurrentBrokerUser, sessionId: string, now = new Date()): WatermarkLines {
  return {
    primary: `${me.name} · ${me.email}`,
    secondary: `${me.brokerName} · ${watermarkStamp(now)} · ${sessionTag(sessionId)}`,
    dense: me.email,
  };
}

export { WATERMARK_LOUD, WATERMARK_REST, watermarkBackground, watermarkDataUri, watermarkDenseDataUri, watermarkStamp } from "./broker-watermark-tile";
export type { WatermarkLines } from "./broker-watermark-tile";
