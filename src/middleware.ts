import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/blob")
  ) {
    return NextResponse.next();
  }
  // API-key authenticated endpoints bypass cookie auth. We validate the key
  // value here so any random x-api-key header doesn't reach the route handler.
  // (The handler validates again — defence in depth.)
  if (
    pathname === "/api/scraper/upload" &&
    process.env.SCRAPER_API_KEY &&
    req.headers.get("x-api-key") === process.env.SCRAPER_API_KEY
  ) {
    return NextResponse.next();
  }
  const sid = req.cookies.get("tf_session")?.value;
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
