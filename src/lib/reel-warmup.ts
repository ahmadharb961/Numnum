import { preconnect, preload } from "react-dom";

/**
 * Server-side, while the page is still streaming: open the connection to the video host
 * (Cloudflare) and fetch the first reel's cover with top priority, so the first reel shows and
 * starts without waiting on extra round trips.
 */
export function warmUpFirstReel(first: { videoUrl?: string | null; posterUrl?: string | null } | undefined) {
  const videoOrigin = first?.videoUrl?.match(/^https:\/\/[^/]+/)?.[0];
  if (videoOrigin) preconnect(videoOrigin, { crossOrigin: "anonymous" });
  if (first?.posterUrl) preload(first.posterUrl, { as: "image", fetchPriority: "high" });
}
