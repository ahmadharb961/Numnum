import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/my", "/pay", "/profile", "/api", "/t/*/contact"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
