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
// Response hardening for the broker portal.
//
//   • no-store        — the stock list must not sit in a disk cache where a
//                       later viewer, or a shared machine, can retrieve it.
//   • frame-ancestors — stops the portal being embedded in someone else's
//                       page, which is a capture route that needs no
//                       screenshot at all: iframe it, render it server-side,
//                       keep the picture.
//   • no referrer     — the URL should not travel to anything a broker
//                       clicks through to.
function harden(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pre-empt the static/system paths first so they bypass both cookie
  // checks regardless of which portal they nominally belong to.
  //
  // The manifest and the generated icon routes belong here for the same
  // reason /favicon does: they carry nothing private, and the browser asks
  // for them on pages a signed-out person is allowed to see. Gated, they
  // answered a redirect to /login, so the login page rendered without its
  // icon and the PWA install prompt had no manifest to read.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/blob")
  ) {
    return NextResponse.next();
  }

  // ── Broker portal ───────────────────────────────────────────────────
  // /api/broker/* belongs to this portal too. Without it those routes fall
  // through to the TF branch below, which demands a TF cookie a broker will
  // never have, and the request is redirected to the TF login — so the
  // endpoint silently stops working for exactly the people meant to use it.
  if (pathname === "/broker" || pathname.startsWith("/broker/") || pathname.startsWith("/api/broker/")) {
    if (BROKER_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next();
    }
    const sid = req.cookies.get(BROKER_COOKIE)?.value;
    if (!sid) {
      // An API caller wants a status code, not a login page. Redirecting a
      // fetch() to HTML turns a clean 401 into a confusing parse error.
      if (pathname.startsWith("/api/")) return harden(new NextResponse(null, { status: 401 }));
      const url = req.nextUrl.clone();
      url.pathname = "/broker/login";
      url.searchParams.set("next", pathname);
      return harden(NextResponse.redirect(url));
    }
    // Stock is the whole portal, so /broker is just a door onto it. Done
    // here rather than with redirect() in the page: a redirect() from a
    // prerendered page answers 200 with a shell that hops on the client,
    // which costs a round trip and flashes an empty page. The page still
    // redirects too, as a backstop if this branch ever moves.
    if (pathname === "/broker") {
      const url = req.nextUrl.clone();
      url.pathname = "/broker/stock";
      return harden(NextResponse.redirect(url));
    }
    return harden(NextResponse.next());
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
