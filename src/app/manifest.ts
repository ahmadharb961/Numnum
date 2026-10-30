import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "numnum — food reels & delivery",
    short_name: "numnum",
    description: "Watch food reels from Lebanese restaurants and order with cash on delivery.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#ff5412",
    categories: ["food", "lifestyle", "shopping"],
    icons: [
      { src: "/icons/v2/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/v2/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/v2/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
