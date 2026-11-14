import { preconnect, preload } from "react-dom";
import { playableSrc } from "./video-src";

type FirstReel = { videoUrl?: string | null; posterUrl?: string | null } | undefined;

/**
 * Server-side, while the page is still streaming: open the connection to the video host
 * (Cloudflare), fetch the first reel's cover with top priority and request its playlist, so the
 * first reel shows and starts without waiting on extra round trips.
 */
export function warmUpFirstReel(first: FirstReel) {
  const videoOrigin = first?.videoUrl?.match(/^https:\/\/[^/]+/)?.[0];
  if (videoOrigin) preconnect(videoOrigin, { crossOrigin: "anonymous" });
  if (first?.posterUrl) preload(first.posterUrl, { as: "image", fetchPriority: "high" });
  // hls.js (Android/Chrome) reuses this response; iPhones use the early <video> below instead.
  if (first?.videoUrl && /\.m3u8(\?|$)/.test(first.videoUrl)) preload(first.videoUrl, { as: "fetch", crossOrigin: "anonymous", fetchPriority: "high" });
}

/**
 * Inline script for the page HTML: starts loading the first reel in a <video> before the app has
 * even started (TikTok/Instagram web do the same). It plays muted until the first frame arrives,
 * then waits at 0:00; the feed adopts this very element (see video-pool), so nothing is fetched
 * twice. Only where the browser plays the format itself (iPhone HLS, MP4); hls.js browsers get
 * the playlist preload above.
 */
export function firstReelBootScript(first: FirstReel, index: number): string | null {
  if (!first?.videoUrl) return null;
  // Same URL the player will compute (playableSrc + startHint), using this phone's reported speed.
  const base = first.videoUrl;
  const hinted = playableSrc(base) !== base;
  const hint = hinted ? `var d=navigator.connection&&navigator.connection.downlink;var h=d>0?Math.max(0.3,Math.min(1.8,Math.round(d*0.6*10)/10)):1.8;s=s+(s.indexOf("?")>=0?"&":"?")+"clientBandwidthHint="+h;` : "";
  return `(function(){try{var s=${JSON.stringify(base)};${hint}var v=document.createElement("video");if(/\\.m3u8(\\?|$)/.test(s)&&!v.canPlayType("application/vnd.apple.mpegurl"))return;v.muted=true;v.defaultMuted=true;v.playsInline=true;v.setAttribute("playsinline","");v.setAttribute("webkit-playsinline","");v.setAttribute("muted","");v.loop=true;v.preload="auto";v.style.cssText="position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";v.src=s;document.body.appendChild(v);var w=window.__nnFirst={src:s,v:v,i:${index},taken:false};var b=function(){v.removeEventListener("timeupdate",b);if(!w.taken){v.pause();try{v.currentTime=0}catch(e){}}};v.addEventListener("timeupdate",b);var p=v.play();if(p&&p.catch)p.catch(function(){});}catch(e){}})();`;
}
