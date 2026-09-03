import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { brokerSecurityEvents } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { logWarn } from "./logger";
import { escapeHtml, renderEmailShell, sendMail } from "./email";
import type { CurrentBrokerUser } from "./broker-auth";

// The kinds we accept. An allow-list, not free text: the reporter is a
// client-side script on a page the user controls, so treat everything it
// sends as untrusted input.
export const SECURITY_EVENT_KINDS = [
  "print-screen-key",   // PrintScreen pressed (Windows-ish; not always visible to us)
  "print",              // Ctrl/Cmd+P, or the browser's print dialog opening
  "capture-shortcut",   // OS screenshot chords we can see (Cmd+Shift+3/4/5)
  "watermark-tamper",   // the watermark layer was removed or altered
  "devtools",           // developer tools appear to be open
  "copy",               // copy / cut attempted on protected content
  "context-menu",       // right-click / long-press
  "screen-share",       // getDisplayMedia invoked from this page
] as const;
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

export function isSecurityEventKind(v: unknown): v is SecurityEventKind {
  return typeof v === "string" && (SECURITY_EVENT_KINDS as readonly string[]).includes(v);
}

// Which kinds are worth an email. A right-click or a copy is noise — worth
// recording, not worth interrupting anyone. These four mean someone was
// deliberately trying to take the screen away with them.
const ALERT_KINDS = new Set<SecurityEventKind>([
  "capture-shortcut", "print-screen-key", "print", "watermark-tamper",
]);

// One email per user per this window, however many events arrive. A held
// PrintScreen key or a tamper loop fires continuously; without this the
// first leak attempt would bury the inbox it was supposed to alert.
const ALERT_THROTTLE_MINUTES = 30;

const HUMAN_KIND: Record<SecurityEventKind, string> = {
  "capture-shortcut": "Screenshot shortcut used (macOS Cmd+Shift)",
  "print-screen-key": "Print Screen / snipping shortcut used",
  "print": "Tried to print or save as PDF",
  "watermark-tamper": "Tried to remove the on-screen watermark",
  "devtools": "Opened developer tools",
  "copy": "Tried to copy content",
  "context-menu": "Right-clicked / long-pressed",
  "screen-share": "Started sharing this tab",
};

// Fire-and-forget from the caller's point of view, but awaited here so a
// failure is logged rather than swallowed into an unhandled rejection.
// Never throws: a broken audit write must not break the page the broker is
// looking at, and must not become a way to probe our error handling.
export async function recordBrokerSecurityEvent(input: {
  me: CurrentBrokerUser;
  kind: SecurityEventKind;
  path?: string | null;
  detail?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(brokerSecurityEvents).values({
      id: randomUUID(),
      brokerUserId: input.me.id,
      brokerId: input.me.brokerId,
      kind: input.kind,
      path: input.path?.slice(0, 200) ?? null,
      detail: input.detail === undefined ? null : JSON.stringify(input.detail).slice(0, 2000),
      ip: input.ip?.slice(0, 60) ?? null,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
      createdAt: new Date(),
    });
    // Also to the log stream, so it shows up in Vercel without a query.
    logWarn("broker.security", input.kind, {
      brokerUserId: input.me.id,
      brokerId: input.me.brokerId,
      email: input.me.email,
      path: input.path ?? undefined,
    });
    if (ALERT_KINDS.has(input.kind)) await maybeAlert(input);
  } catch (err) {
    logWarn("broker.security.write-failed", String(err), { brokerUserId: input.me.id });
  }
}

// Who gets told. Set BROKER_SECURITY_ALERT_TO to a comma-separated list;
// without it we log and move on rather than guessing at an address.
function alertRecipients(): string[] {
  return (process.env.BROKER_SECURITY_ALERT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function maybeAlert(input: {
  me: CurrentBrokerUser;
  kind: SecurityEventKind;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const to = alertRecipients();
  if (to.length === 0) return;

  // Throttle on what's already stored rather than in memory: serverless
  // instances come and go, and an in-process counter would reset with them.
  //
  // Counts only the kinds that would themselves have sent an email. A
  // broker who right-clicked ten minutes ago must not suppress the alert
  // for the screenshot they are taking now.
  const since = new Date(Date.now() - ALERT_THROTTLE_MINUTES * 60_000);
  const recent = await db
    .select({ kind: brokerSecurityEvents.kind })
    .from(brokerSecurityEvents)
    .where(and(
      eq(brokerSecurityEvents.brokerUserId, input.me.id),
      gt(brokerSecurityEvents.createdAt, since),
    ))
    .orderBy(desc(brokerSecurityEvents.createdAt));

  // The row for this event is already written, so it is in `recent` too.
  // More than one alertable row means we emailed inside the window already.
  const alertableInWindow = recent.filter((r) => ALERT_KINDS.has(r.kind as SecurityEventKind)).length;
  if (alertableInWindow > 1) return;

  const when = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
  const rows: [string, string][] = [
    ["What happened", HUMAN_KIND[input.kind]],
    ["Who", `${input.me.name} (${input.me.email})`],
    ["Broker", input.me.brokerName],
    ["When", when],
    ["Page", input.path ?? "—"],
    ["IP", input.ip ?? "—"],
    ["Device", input.userAgent ?? "—"],
  ];

  const text = [
    `${HUMAN_KIND[input.kind]} on the broker portal.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Any image they captured carries their name, email and broker as a watermark.",
    `Further alerts for this user are held for ${ALERT_THROTTLE_MINUTES} minutes.`,
  ].join("\n");

  const html = renderEmailShell({
    preheader: `${input.me.name} (${input.me.brokerName}) — ${HUMAN_KIND[input.kind]}`,
    heading: "Broker portal — capture attempt",
    body: `
      <p style="margin:0 0 18px 0;color:#475569">
        <strong>${escapeHtml(input.me.name)}</strong> at <strong>${escapeHtml(input.me.brokerName)}</strong>
        did something on the broker stock list that looks like an attempt to capture the screen.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="padding:8px 16px 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>
            <td style="padding:8px 0;font-size:14px;color:#0f172a;word-break:break-word">${escapeHtml(v)}</td>
          </tr>`).join("")}
      </table>
      <p style="margin:18px 0 0 0;color:#475569;font-size:13px">
        Anything they captured carries their name, email and broker across it as a watermark.
        A browser cannot block an OS screenshot, so treat this as "we saw it and it is traceable",
        not "we stopped it". Phone photographs and phone screenshots are not detectable at all.
      </p>
      <p style="margin:14px 0 0 0;color:#94a3b8;font-size:12px">
        Further alerts for this user are held for ${ALERT_THROTTLE_MINUTES} minutes.
      </p>`,
  });

  for (const addr of to) {
    await sendMail({
      to: addr,
      subject: `Broker portal: ${input.me.name} (${input.me.brokerName}) — ${HUMAN_KIND[input.kind]}`,
      text,
      html,
    });
  }
}
