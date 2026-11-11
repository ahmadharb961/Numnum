import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "@prisma/client"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
    // Shared hosting (Hostinger) caps threads per account: build with one worker.
    cpus: 1,
    workerThreads: false,
    // Keep pages the visitor just saw for 30 s in the browser, so going back (or returning
    // through the bottom nav) is instant instead of a new server round trip every time.
    // Saving anything (server actions, router.refresh) still clears it.
    staleTimes: { dynamic: 30 },
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
