import { NextResponse, type NextRequest } from "next/server";
import { getCurrentBrokerUser } from "@/lib/broker-auth";
import { isSecurityEventKind, recordBrokerSecurityEvent } from "@/lib/broker-security";

// Where screen-guard.tsx reports what it saw. Broker session required, so
// an event can always be attributed to a person — an unattributable event
// is not worth storing.
//
// Deliberately quiet: always 204, never says whether the write happened or
// why it didn't. The caller is a script running on the reporter's own
// machine, and it gets nothing back it could use to probe for a way past.
export async function POST(req: NextRequest) {
  const me = await getCurrentBrokerUser();
  if (!me) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const { kind, path, detail } = (body ?? {}) as { kind?: unknown; path?: unknown; detail?: unknown };
  if (!isSecurityEventKind(kind)) return new NextResponse(null, { status: 204 });

  await recordBrokerSecurityEvent({
    me,
    kind,
    path: typeof path === "string" ? path : null,
    detail,
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
