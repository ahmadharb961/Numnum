import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Titles and meta tags go in the page's <head> from the first byte, for every visitor. Next's
  // default streams them later, into the body, for browsers; React then sometimes finds the title
  // somewhere it didn't expect while taking over the page and throws away part of it (error #418).
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["sharp", "@prisma/client"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
    // Shared hosting (Hostinger) caps threads per account: build with one worker.
    cpus: 1,
    workerThreads: false,
    // Keep visited screens in the browser for a minute, so going back to a tab is instant (like a
    // native app) instead of waiting for the server again. Pages still refresh after that.
    staleTimes: { dynamic: 60, static: 300 },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
