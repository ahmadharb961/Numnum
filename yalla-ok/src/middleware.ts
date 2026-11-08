import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files, images, the service worker and the WhatsApp redirect.
    "/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|favicon.ico|robots.txt|sitemap.xml|t/[^/]+/contact|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
