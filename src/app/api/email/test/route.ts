import { NextResponse } from "next/server";
import { sendTestMail, verifyTransport } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const verifyOnly = url.searchParams.get("verify") === "1";

  const env = {
    GMAIL_USER_set: Boolean(process.env.GMAIL_USER),
    GMAIL_APP_PASSWORD_set: Boolean(process.env.GMAIL_APP_PASSWORD),
    GMAIL_USER: process.env.GMAIL_USER ?? null,
  };

  const verify = await verifyTransport();

  if (verifyOnly || !to) {
    return NextResponse.json({ env, verify });
  }

  const send = await sendTestMail(to);
  return NextResponse.json({ env, verify, send, to });
}
