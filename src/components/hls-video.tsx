"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type Hls from "hls.js";

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
/**
 * iPhones choose their own first quality for HLS and often start high, which is slow on 4G.
 * Cloudflare Stream takes a bandwidth hint (Mbps) for the first rendition; quality then rises
 * as the connection allows.
 */
function withStartHint(src: string) {
  if (!/\.cloudflarestream\.com\//.test(src) || /[?&]clientBandwidthHint=/.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}clientBandwidthHint=1.8`;
}

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
      v.src = isHls ? withStartHint(src) : src;
      return () => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      };
    }
    let cancelled = false;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    import("hls.js").then(({ default: HlsLib }) => {
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
        const cap = weakConnection() || saveData ? 360 : 540;
        const light = d.levels.map((l, i) => ({ h: l.height || 0, i })).filter((l) => l.h && l.h <= cap).sort((a, b) => b.h - a.h)[0];
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
