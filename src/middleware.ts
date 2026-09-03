import { NextResponse, type NextRequest } from "next/server";

// Public, unauthenticated paths for the TF leasing app.
// /forgot-password and /reset-password are public so locked-out users can
// recover their own accounts. The reset page only acts on a valid token
// short-lived enough that brute-force guesses aren't feasible.
const TF_PUBLIC_PATHS = ["/login", "/setup", "/forgot-password", "/reset-password"];

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
    // Stock is the whole portal, so /broker is just a door onto it. Done
    // here rather than with redirect() in the page: a redirect() from a
    // prerendered page answers 200 with a shell that hops on the client,
    // which costs a round trip and flashes an empty page. The page still
    // redirects too, as a backstop if this branch ever moves.
    if (pathname === "/broker") {
      const url = req.nextUrl.clone();
      url.pathname = "/broker/stock";
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
