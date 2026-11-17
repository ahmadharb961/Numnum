/**
 * The exact URL a reel's <video> loads. iPhones choose their own first quality for HLS and often
 * start high, which is slow on 4G/3G; Cloudflare Stream takes a bandwidth hint (Mbps) for the first
 * rendition, and quality then rises as the connection allows. Shared by the server (to start the
 * first reel from the page itself) and the player, so both load the very same URL.
 */
export function playableSrc(src: string, downlinkMbps?: number | null): string {
  if (!/\.m3u8(\?|$)/.test(src) || !/\.cloudflarestream\.com\//.test(src) || /[?&]clientBandwidthHint=/.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}clientBandwidthHint=${startHint(downlinkMbps)}`;
}

/** Mbps hint for the first rendition: a share of the measured speed where the phone reports it
 *  (Android Chrome, up to 720p), else 1.5: iPhones start every reel with the first rendition
 *  listed and wait for a few seconds of it before playing, so they start at 480p (half the bytes
 *  of 720p) and step up by themselves a moment later. Kept in sync with firstReelBootScript. */
/** iPhones don't report their speed: 480p first (Cloudflare lists the closest rendition first). */
export const UNREPORTED_HINT = 1.5;

export function startHint(downlinkMbps?: number | null): number {
  if (!downlinkMbps || !(downlinkMbps > 0)) return UNREPORTED_HINT;
  return Math.max(0.3, Math.min(1.8, Math.round(downlinkMbps * 0.6 * 10) / 10));
}

/** The connection speed the browser reports, in Mbps (Android Chrome; iPhones don't report it). */
export function reportedDownlink(): number | null {
  if (typeof navigator === "undefined") return null;
  const d = (navigator as Navigator & { connection?: { downlink?: number } }).connection?.downlink;
  return typeof d === "number" && d > 0 ? d : null;
}
