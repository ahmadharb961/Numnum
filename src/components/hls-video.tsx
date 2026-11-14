"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type Hls from "hls.js";
import { playableSrc, reportedDownlink } from "@/lib/video-src";
import { claimEarlyVideo } from "@/components/customer/video-pool";

// Browsers without built-in HLS (Android/Chrome) need hls.js: start downloading it as soon as this
// module loads (during app start-up) instead of when the first reel mounts.
let hlsModule: Promise<typeof import("hls.js")> | null = null;
function loadHls() {
  hlsModule ??= import("hls.js");
  return hlsModule;
}
if (typeof window !== "undefined" && !document.createElement("video").canPlayType("application/vnd.apple.mpegurl")) void loadHls();

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string;
  onFatal?: () => void;
  /** Reuse this element (see customer/video-pool) instead of rendering a new <video>. */
  element?: HTMLVideoElement;
  /** Buffer well ahead (the reel on screen once the next one is ready); otherwise only ~4 s. */
  deepBuffer?: boolean;
};

// React event props forwarded to a pooled element as DOM listeners.
const EVENTS = { onTimeUpdate: "timeupdate", onWaiting: "waiting", onPlaying: "playing", onPause: "pause", onError: "error" } as const;
type EventProp = keyof typeof EVENTS;

/**
 * <video> that plays both MP4 and Cloudflare Stream HLS (.m3u8).
 * Safari/iOS play HLS natively; other browsers load hls.js on demand.
 * Buffering follows `preload`: "auto" buffers ahead, anything else stays light.
 */
/** The browser reports a slow connection (Android Chrome/WebView do; iPhones don't report it). */
function weakConnection() {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
  return !!conn && ((conn.downlink != null && conn.downlink < 5) || (conn.effectiveType != null && conn.effectiveType !== "4g"));
}

export const HlsVideo = forwardRef<HTMLVideoElement, Props>(function HlsVideo({ src, onFatal, preload, element, deepBuffer, ...rest }, ref) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fatalRef = useRef(onFatal);
  fatalRef.current = onFatal;
  const handlers = useRef(rest);
  handlers.current = rest;
  const video = () => element ?? ownRef.current;
  useImperativeHandle(ref, () => video() as HTMLVideoElement, [element]); // eslint-disable-line react-hooks/exhaustive-deps
  const eager = preload === "auto";

  // Pooled element: move it into this slot and wire up attributes + listeners.
  useLayoutEffect(() => {
    if (!element || !hostRef.current) return;
    const v = element;
    claimEarlyVideo(v);
    v.className = rest.className ?? "";
    if (rest.poster) v.poster = rest.poster;
    else v.removeAttribute("poster");
    v.loop = !!rest.loop;
    v.preload = (preload ?? "metadata") as HTMLVideoElement["preload"];
    hostRef.current.appendChild(v);
    const bound = (Object.keys(EVENTS) as EventProp[]).map((k) => {
      const fn = (e: Event) => (handlers.current[k] as ((e: unknown) => void) | undefined)?.(e);
      v.addEventListener(EVENTS[k], fn);
      return () => v.removeEventListener(EVENTS[k], fn);
    });
    return () => {
      bound.forEach((off) => off());
      if (v.parentNode === hostRef.current) v.remove();
    };
  }, [element]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (element) element.muted = !!rest.muted;
  }, [element, rest.muted]);

  useEffect(() => {
    if (element) element.preload = (preload ?? "metadata") as HTMLVideoElement["preload"];
  }, [element, preload]);

  useEffect(() => {
    const v = video();
    if (!v) return;
    const isHls = /\.m3u8(\?|$)/.test(src);
    if (!isHls || v.canPlayType("application/vnd.apple.mpegurl")) {
      // The page's early <video> may already be loading this exact URL: don't restart it.
      const want = playableSrc(src, reportedDownlink());
      if (v.src !== new URL(want, location.href).href) v.src = want;
      return () => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      };
    }
    let cancelled = false;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    loadHls().then(({ default: HlsLib }) => {
      if (cancelled) return;
      if (!HlsLib.isSupported()) {
        fatalRef.current?.();
        return;
      }
      // Reels waiting their turn fetch just their first seconds; the one on screen buffers further.
      const ahead = saveData || weakConnection() ? 6 : 12;
      const hls = new HlsLib({ maxBufferLength: 4, maxMaxBufferLength: 30, capLevelToPlayerSize: true, startLevel: -1, autoStartLoad: eager, startFragPrefetch: true });
      aheadRef.current = ahead;
      if (deepRef.current) hls.config.maxBufferLength = ahead;
      hls.on(HlsLib.Events.ERROR, (_e, d) => d.fatal && fatalRef.current?.());
      // Start at about 540p so the first frame comes quickly; hls.js then raises the quality as the
      // connection allows (what TikTok/Instagram do). iPhones choose their own start level.
      hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, d) => {
        // On a weak connection (the phone reports it) start lower still, so the first frame comes fast.
        const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
        const levels = d.levels.map((l, i) => ({ h: l.height || 0, i })).filter((l) => l.h);
        // 3G-class connections start at the lightest rendition; quality rises from there.
        const cap = conn?.downlink != null && conn.downlink < 2 ? Math.min(...levels.map((l) => l.h)) : weakConnection() || saveData ? 360 : 540;
        const light = levels.filter((l) => l.h <= cap).sort((a, b) => b.h - a.h)[0];
        if (light) hls.startLevel = light.i;
      });
      hls.loadSource(src);
      hls.attachMedia(v);
      hlsRef.current = hls;
    });
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (element) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    };
  }, [src, element]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deeper buffer only when allowed (see deepBuffer); hls.js picks the new limit up on its next load.
  const deepRef = useRef(!!deepBuffer);
  const aheadRef = useRef(12);
  deepRef.current = !!deepBuffer;
  useEffect(() => {
    const hls = hlsRef.current;
    if (hls) hls.config.maxBufferLength = deepBuffer ? aheadRef.current : 4;
  }, [deepBuffer]);

  // the next reel starts buffering once it becomes the preload target
  useEffect(() => {
    if (eager) hlsRef.current?.startLoad();
  }, [eager]);

  if (element) return <div ref={hostRef} className="absolute inset-0" />;
  return <video ref={ownRef} preload={preload} {...rest} />;
});
