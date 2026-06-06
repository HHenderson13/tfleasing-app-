import { NextResponse, type NextRequest } from "next/server";

// Public, unauthenticated paths for the TF leasing app.
const TF_PUBLIC_PATHS = ["/login", "/setup"];

// Public, unauthenticated paths inside the broker portal.
const BROKER_PUBLIC_PATHS = ["/broker/login", "/broker/setup"];

const TF_COOKIE = "tf_session";
const BROKER_COOKIE = "tf_broker_session";

// Two-portal middleware. Maintains strict separation between the TF
// leasing-app sessions and the broker-portal sessions:
//
//   • /broker/* — only the broker cookie satisfies. A TF cookie is
//     irrelevant (admins who want to administer brokers go through the
//     /admin/brokers UI, not /broker/*).
//   • everything else — only the TF cookie satisfies. A broker cookie
//     never grants access to anything outside /broker.
//
// The broker cookie is also Path-scoped to /broker (see
// setBrokerSessionCookie) so a stray broker cookie physically cannot be
// sent to non-broker paths. The middleware below is defence in depth.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pre-empt the static/system paths first so they bypass both cookie
  // checks regardless of which portal they nominally belong to.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/blob")
  ) {
    return NextResponse.next();
  }

  // ── Broker portal ───────────────────────────────────────────────────
  if (pathname === "/broker" || pathname.startsWith("/broker/")) {
    if (BROKER_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next();
    }
    const sid = req.cookies.get(BROKER_COOKIE)?.value;
    if (!sid) {
      const url = req.nextUrl.clone();
      url.pathname = "/broker/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── TF leasing app ──────────────────────────────────────────────────
  if (
    TF_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }
  // API-key authenticated endpoints bypass cookie auth. We validate the
  // key value here so any random x-api-key header doesn't reach the
  // route handler (handler validates again — defence in depth).
  if (
    pathname === "/api/scraper/upload" &&
    process.env.SCRAPER_API_KEY &&
    req.headers.get("x-api-key") === process.env.SCRAPER_API_KEY
  ) {
    return NextResponse.next();
  }
  const sid = req.cookies.get(TF_COOKIE)?.value;
  if (!sid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
