import nodemailer from "nodemailer";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { STATUS_LABELS, type ProposalStatus } from "./proposal-constants";

const FROM = process.env.GMAIL_USER ?? "trustfordleasing@gmail.com";
const FROM_NAME = "TrustFord Leasing";

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tfleasing-app.vercel.app";

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
  const subject = `[${toLbl}] ${p.model} ${p.derivative} · ${p.funderName}`;

  const text =
`Hi ${exec.name.split(" ")[0]},

A proposal has moved to "${toLbl}".

Vehicle:  ${p.model} ${p.derivative}
Funder:   ${p.funderName}
Monthly:  ${monthly}
Status:   ${fromLbl} → ${toLbl}
${p.note ? `Note:     ${p.note}\n` : ""}
Open: ${link}

— TrustFord Leasing`;

  const html =
`<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;color:#0f172a">
  <p>Hi ${exec.name.split(" ")[0]},</p>
  <p>A proposal has moved to <strong>${toLbl}</strong>.</p>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Vehicle</td><td>${p.model} ${p.derivative}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Funder</td><td>${p.funderName}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Monthly</td><td>${monthly}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Status</td><td>${fromLbl} → <strong>${toLbl}</strong></td></tr>
    ${p.note ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Note</td><td>${escapeHtml(p.note)}</td></tr>` : ""}
  </table>
  <p style="margin-top:16px"><a href="${link}" style="background:#0f172a;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:14px">Open in app</a></p>
</div>`;

  await sendMail({ to: exec.email, subject, text, html });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
