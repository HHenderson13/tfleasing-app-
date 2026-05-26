import { NextResponse } from "next/server";
import { sendTestMail, verifyTransport } from "@/lib/email";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only — sends real Gmail and exposes SMTP transport state. Don't leak
// the actual GMAIL_USER address in the response; report presence only.
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const verifyOnly = url.searchParams.get("verify") === "1";

  const env = {
    GMAIL_USER_set: Boolean(process.env.GMAIL_USER),
    GMAIL_APP_PASSWORD_set: Boolean(process.env.GMAIL_APP_PASSWORD),
  };

  const verify = await verifyTransport();

  if (verifyOnly || !to) {
    return NextResponse.json({ env, verify });
  }

  const send = await sendTestMail(to);
  return NextResponse.json({ env, verify, send, to });
}
