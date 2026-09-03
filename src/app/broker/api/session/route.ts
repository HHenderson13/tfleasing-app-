import { NextResponse, type NextRequest } from "next/server";
import { brokerSessionHeartbeat } from "@/lib/broker-auth";

// Session heartbeat for the broker portal. 204 while the session lives,
// 401 the moment it does not — which is how a device displaced by a sign-in
// elsewhere finds out, and how an idled-out tab stops showing stock.
//
// The `active` flag must reflect real input on the page; see
// brokerSessionHeartbeat for why a heartbeat that always bumped the clock
// would defeat the idle timeout entirely.
export async function POST(req: NextRequest) {
  let active = false;
  try {
    const body = (await req.json()) as { active?: unknown };
    active = body?.active === true;
  } catch {
    // A malformed body is a liveness check, not activity.
  }
  const status = await brokerSessionHeartbeat(active);
  return new NextResponse(null, { status: status === "ok" ? 204 : 401 });
}
