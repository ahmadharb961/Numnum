import { NextResponse, type NextRequest } from "next/server";

const DEVICE_COOKIE = "nn_did";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function randomId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function middleware(req: NextRequest) {
  // CSRF defence for JSON/upload API routes: same-origin requests only.
  if (req.nextUrl.pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (originHost !== host) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    } else if (req.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

  const res = NextResponse.next();
  if (!req.cookies.get(DEVICE_COOKIE)) {
    const id = randomId();
    // make the id visible to this request's server code too
    res.cookies.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    req.cookies.set(DEVICE_COOKIE, id);
    const headers = new Headers(req.headers);
    headers.set("cookie", req.cookies.toString());
    const forwarded = NextResponse.next({ request: { headers } });
    forwarded.cookies.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return forwarded;
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|media/|icons/|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml).*)"],
};
