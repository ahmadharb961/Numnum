"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type Hls from "hls.js";

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & { src: string; onFatal?: () => void };

/**
 * <video> that plays both MP4 and Cloudflare Stream HLS (.m3u8).
 * Safari/iOS play HLS natively; other browsers load hls.js on demand.
 * Buffering follows `preload`: "auto" buffers ahead, anything else stays light.
 */
export const HlsVideo = forwardRef<HTMLVideoElement, Props>(function HlsVideo({ src, onFatal, preload, ...rest }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fatalRef = useRef(onFatal);
  fatalRef.current = onFatal;
  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);
  const eager = preload === "auto";

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const isHls = /\.m3u8(\?|$)/.test(src);
    if (!isHls || v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
      return () => {
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
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // the next reel starts buffering once it becomes the preload target
  useEffect(() => {
    if (eager) hlsRef.current?.startLoad();
  }, [eager]);

  return <video ref={videoRef} preload={preload} {...rest} />;
});
