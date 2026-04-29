import nodemailer from "nodemailer";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { STATUS_LABELS, type ProposalStatus } from "./proposal-constants";

const FROM = process.env.GMAIL_USER ?? "trustfordleasing@gmail.com";
const FROM_NAME = "TrustFord Leasing";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tfleasing-app.vercel.app";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ---------- Brand + shared HTML shell ----------

const BRAND = {
  name: "TrustFord Leasing",
  primary: "#003478", // Ford blue
  accent: "#0066B2",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
};

const STATUS_HEX: Record<ProposalStatus, { bg: string; fg: string }> = {
  proposal_received:       { bg: "#f1f5f9", fg: "#334155" },
  accepted:                { bg: "#d1fae5", fg: "#047857" },
  declined:                { bg: "#fee2e2", fg: "#b91c1c" },
  referred_to_dealer:      { bg: "#fef3c7", fg: "#92400e" },
  referred_to_underwriter: { bg: "#e0e7ff", fg: "#3730a3" },
  not_eligible:            { bg: "#ffedd5", fg: "#9a3412" },
  lost_sale:               { bg: "#e2e8f0", fg: "#475569" },
  cancelled:               { bg: "#ffe4e6", fg: "#be123c" },
  in_order:                { bg: "#dbeafe", fg: "#1d4ed8" },
  awaiting_delivery:       { bg: "#ede9fe", fg: "#6d28d9" },
  delivered:               { bg: "#ccfbf1", fg: "#0f766e" },
};

export function statusBadgeHtml(status: ProposalStatus): string {
  const c = STATUS_HEX[status] ?? { bg: "#f1f5f9", fg: "#334155" };
  const label = STATUS_LABELS[status] ?? status;
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};font-weight:600;font-size:12px;letter-spacing:0.02em;text-transform:uppercase;padding:3px 10px;border-radius:999px">${escapeHtml(label)}</span>`;
}

export function renderEmailShell(opts: {
  preheader: string;
  heading: string;
  body: string; // raw inner HTML
}): string {
  // Preheader is hidden but shows in inbox previews.
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;font-size:1px;line-height:1px;color:${BRAND.bg};overflow:hidden">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden">
        <tr>
          <td style="background:${BRAND.primary};padding:18px 24px;color:#ffffff">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-size:16px;font-weight:700;letter-spacing:0.02em">${BRAND.name}</td>
                <td align="right" style="font-size:11px;color:#cfe1ff;letter-spacing:0.06em;text-transform:uppercase">Orderbank notification</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px 28px">
            <h1 style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:${BRAND.text}">${escapeHtml(opts.heading)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 24px 28px;font-size:14px;line-height:1.55;color:${BRAND.text}">
            ${opts.body}
          </td>
        </tr>
        <tr>
          <td style="background:${BRAND.bg};border-top:1px solid ${BRAND.border};padding:16px 28px;font-size:11px;color:${BRAND.muted};line-height:1.5">
            You're receiving this because you're the assigned sales exec on this deal.<br/>
            ${BRAND.name} · Orderbank automation · <a href="${APP_URL}" style="color:${BRAND.accent};text-decoration:none">tfleasing-app.vercel.app</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(label)}</a>`;
}

export const EMAIL_BRAND = BRAND;

let _transporter: nodemailer.Transporter | null = null;
function transporter(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return _transporter;
}

export async function verifyTransport(): Promise<{ ok: true } | { ok: false; reason: string; error?: string }> {
  const t = transporter();
  if (!t) return { ok: false, reason: "GMAIL_USER or GMAIL_APP_PASSWORD env var is not set" };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "SMTP verify failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendTestMail(to: string): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const t = transporter();
  if (!t) return { ok: false, error: "GMAIL_USER or GMAIL_APP_PASSWORD env var is not set" };
  try {
    const info = await t.sendMail({
      from: `"${FROM_NAME}" <${FROM}>`,
      to,
      subject: "TrustFord Leasing — email test",
      text: "If you can read this, SMTP is working.",
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const t = transporter();
  if (!t) {
    console.warn(`[email] GMAIL_USER/PASSWORD not set — skipping mail to ${input.to}: ${input.subject}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"${FROM_NAME}" <${FROM}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (e) {
    // Never break the app on a mail failure — just log.
    console.error(`[email] send failed to ${input.to}:`, e);
  }
}

async function execEmail(salesExecId: string | null): Promise<{ email: string; name: string } | null> {
  if (!salesExecId) return null;
  const [e] = await db.select().from(salesExecs).where(eq(salesExecs.id, salesExecId)).limit(1);
  if (!e?.email) return null;
  return { email: e.email, name: e.name };
}

export async function sendStatusChangeEmail(p: {
  id: string;
  customerId: string;
  salesExecId: string | null;
  model: string;
  derivative: string;
  funderName: string;
  monthlyRental: number;
  fromStatus: ProposalStatus | null;
  toStatus: ProposalStatus;
  note?: string | null;
}): Promise<void> {
  const exec = await execEmail(p.salesExecId);
  if (!exec) return;

  const fromLbl = p.fromStatus ? STATUS_LABELS[p.fromStatus] ?? p.fromStatus : "—";
  const toLbl = STATUS_LABELS[p.toStatus] ?? p.toStatus;
  const link = `${APP_URL}/customers/${p.customerId}`;
  const monthly = `£${p.monthlyRental.toFixed(2)}`;
  const firstName = exec.name.split(" ")[0];
  const vehicle = `${p.model} ${p.derivative}`;
  const subject = `[${toLbl}] ${vehicle} · ${p.funderName}`;
  const preheader = `${vehicle} · ${p.funderName} · ${monthly}/mo — moved to ${toLbl}`;

  const text =
`Hi ${firstName},

A proposal has moved to "${toLbl}".

Vehicle:  ${vehicle}
Funder:   ${p.funderName}
Monthly:  ${monthly}
Status:   ${fromLbl} → ${toLbl}
${p.note ? `Note:     ${p.note}\n` : ""}
Open: ${link}

— ${EMAIL_BRAND.name}`;

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 16px 8px 0;color:${EMAIL_BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:8px 0;font-size:14px;color:${EMAIL_BRAND.text}">${value}</td>
    </tr>`;

  const body = `
    <p style="margin:0 0 14px 0">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 18px 0;color:${EMAIL_BRAND.muted}">A proposal has moved to ${statusBadgeHtml(p.toStatus)}.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;border:1px solid ${EMAIL_BRAND.border};border-radius:10px;overflow:hidden">
      ${row("Vehicle", `<strong>${escapeHtml(vehicle)}</strong>`)}
      ${row("Funder", escapeHtml(p.funderName))}
      ${row("Monthly", `<strong>${monthly}</strong>`)}
      ${row("Status change", `${escapeHtml(fromLbl)} &nbsp;→&nbsp; ${statusBadgeHtml(p.toStatus)}`)}
      ${p.note ? row("Note", escapeHtml(p.note)) : ""}
    </table>
    <p style="margin:22px 0 0 0">${ctaButton(link, "Open in app")}</p>
  `;

  const html = renderEmailShell({ preheader, heading: `${vehicle} · ${toLbl}`, body });

  await sendMail({ to: exec.email, subject, text, html });
}
