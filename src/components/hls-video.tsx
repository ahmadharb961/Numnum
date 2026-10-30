"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type Hls from "hls.js";

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string;
  onFatal?: () => void;
  /** Reuse this element (see customer/video-pool) instead of rendering a new <video>. */
  element?: HTMLVideoElement;
};

// React event props forwarded to a pooled element as DOM listeners.
const EVENTS = { onTimeUpdate: "timeupdate", onWaiting: "waiting", onPlaying: "playing", onPause: "pause", onError: "error" } as const;
type EventProp = keyof typeof EVENTS;

/**
 * <video> that plays both MP4 and Cloudflare Stream HLS (.m3u8).
 * Safari/iOS play HLS natively; other browsers load hls.js on demand.
 * Buffering follows `preload`: "auto" buffers ahead, anything else stays light.
 */
export const HlsVideo = forwardRef<HTMLVideoElement, Props>(function HlsVideo({ src, onFatal, preload, element, ...rest }, ref) {
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
      v.src = src;
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
      const hls = new HlsLib({ maxBufferLength: saveData ? 6 : 12, maxMaxBufferLength: 30, capLevelToPlayerSize: true, startLevel: -1, autoStartLoad: eager });
      hls.on(HlsLib.Events.ERROR, (_e, d) => d.fatal && fatalRef.current?.());
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

  // the next reel starts buffering once it becomes the preload target
  useEffect(() => {
    if (eager) hlsRef.current?.startLoad();
  }, [eager]);

  if (element) return <div ref={hostRef} className="absolute inset-0" />;
  return <video ref={ownRef} preload={preload} {...rest} />;
});
