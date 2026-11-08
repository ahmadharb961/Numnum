import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yalla Ok — Post it. Get it done.",
    short_name: "Yalla Ok",
    description: "A live list of small tasks people will pay to have done.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#8125e8",
    categories: ["lifestyle", "productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Post a Task", url: "/post", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My Tasks", url: "/my", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
