"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Film, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { uploadFile } from "@/components/dashboard/upload";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type Cover = { id: string; url: string };

const STRIP = 10; // frames in the film strip
const LONG_SIDE = 1280; // the saved cover's size (long side, pixels)

/**
 * The reel's cover: a frame picked from the video (film strip + slider), or a photo from the
 * gallery. Without one, a frame is taken from the video automatically after upload.
 * Frames are read from the video on the phone itself, so this works while the video uploads.
 */
export function CoverPicker({ videoUrl, value, onChange, uploadParams }: { videoUrl: string; value: Cover | null; onChange: (c: Cover | null) => void; uploadParams?: Record<string, string> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function save(file: Blob & { name?: string }) {
    setBusy(true);
    setError(null);
    try {
      const r = await uploadFile(file, "image", { params: uploadParams, retries: 2 });
      onChange({ id: r.id, url: r.thumbUrl ?? r.url ?? "" });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="cover-picker">
      <div className="label">{t("Cover")}</div>
      <div className="flex items-center gap-4">
        <div className="relative h-32 w-[72px] shrink-0 overflow-hidden rounded-xl bg-black">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt={t("Cover")} className="h-full w-full object-cover" data-testid="cover-preview" />
          ) : (
            <>
              <video src={videoUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/60 py-0.5 text-center text-[10px] font-bold text-white">{t("Automatic")}</span>
            </>
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Button type="button" variant="outline" size="sm" block onClick={() => setOpen(true)} disabled={busy} data-testid="cover-from-video">
            <Film className="h-4 w-4" /> {t("Choose a frame")}
          </Button>
          <Button type="button" variant="outline" size="sm" block onClick={() => gallery.current?.click()} disabled={busy} data-testid="cover-from-gallery">
            <ImagePlus className="h-4 w-4" /> {t("Upload a photo")}
          </Button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted" data-testid="cover-reset">
              <RotateCcw className="h-3.5 w-3.5" /> {t("Use the automatic cover")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{t(error)}</p>}
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        data-testid="cover-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void save(f);
        }}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose a frame">
        {open && (
          <FramePicker
            videoUrl={videoUrl}
            onPick={async (blob) => {
              if (await save(Object.assign(blob, { name: "cover.jpg" }))) setOpen(false);
            }}
            saving={busy}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Wait for the video to show the frame at `time`. */
function seek(v: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      // Some browsers fire "seeked" a moment before the frame is drawn.
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      if (rvfc) {
        let settled = false;
        const finish = () => !settled && ((settled = true), resolve());
        rvfc.call(v, finish);
        setTimeout(finish, 120);
      } else resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("seek"));
    };
    const timer = setTimeout(fail, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      v.removeEventListener("seeked", done);
      v.removeEventListener("error", fail);
    };
    v.addEventListener("seeked", done);
    v.addEventListener("error", fail);
    v.currentTime = Math.max(0, Math.min(time, (v.duration || time) - 0.05));
  });
}

/** Resolves once the video knows its size and length (and has a frame to draw). */
function ready(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (v.readyState >= 2 && v.duration) return resolve();
    const ok = () => v.readyState >= 2 && v.duration && (cleanup(), resolve());
    const fail = () => (cleanup(), reject(new Error("load")));
    const timer = setTimeout(fail, 10000);
    const cleanup = () => {
      clearTimeout(timer);
      v.removeEventListener("loadeddata", ok);
      v.removeEventListener("loadedmetadata", ok);
      v.removeEventListener("error", fail);
    };
    v.addEventListener("loadeddata", ok);
    v.addEventListener("loadedmetadata", ok);
    v.addEventListener("error", fail);
    v.load();
    // iPhones only decode frames of a video that has started playing: start it silently, then pause.
    v.play()
      .then(() => v.pause())
      .catch(() => {});
  });
}

function draw(v: HTMLVideoElement, longSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longSide / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(v.videoWidth * scale));
  c.height = Math.max(1, Math.round(v.videoHeight * scale));
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

function FramePicker({ videoUrl, onPick, saving }: { videoUrl: string; onPick: (b: Blob) => void; saving: boolean }) {
  const t = useT();
  const view = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [strip, setStrip] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const seeking = useRef<Promise<void>>(Promise.resolve());

  // The big preview: the video itself, paused on the chosen moment.
  useEffect(() => {
    const v = view.current!;
    let live = true;
    ready(v)
      .then(() => {
        if (!live) return;
        setDuration(v.duration);
        return seek(v, 0);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [videoUrl]);

  // The film strip, read from a second hidden copy so the preview stays where it is.
  useEffect(() => {
    let live = true;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = videoUrl;
    (async () => {
      await ready(v);
      const frames: string[] = [];
      for (let i = 0; i < STRIP && live; i++) {
        await seek(v, (v.duration * (i + 0.5)) / STRIP);
        frames.push(draw(v, 160).toDataURL("image/jpeg", 0.7));
        if (live) setStrip([...frames]);
      }
    })().catch(() => {});
    return () => {
      live = false;
      v.removeAttribute("src");
      v.load();
    };
  }, [videoUrl]);

  const go = (s: number) => {
    setTime(s);
    const v = view.current;
    if (v) seeking.current = seeking.current.then(() => seek(v, s)).catch(() => {});
  };

  const use = async () => {
    const v = view.current;
    if (!v) return;
    await seeking.current;
    const canvas = draw(v, LONG_SIDE);
    canvas.toBlob((b) => b && onPick(b), "image/jpeg", 0.88);
  };

  if (failed)
    return <p className="p-2 text-sm text-ink-muted">{t("This device can't show the frames of this video. Upload a photo instead.")}</p>;
  return (
    <div className="space-y-4" data-testid="frame-picker">
      <div className="mx-auto aspect-[9/16] max-h-[48vh] overflow-hidden rounded-2xl bg-black">
        <video ref={view} src={videoUrl} className="h-full w-full object-cover" muted playsInline preload="auto" />
      </div>
      <div className="relative">
        <div className="flex h-16 overflow-hidden rounded-xl bg-black/10">
          {Array.from({ length: STRIP }, (_, i) => (
            <button key={i} type="button" onClick={() => duration && go((duration * (i + 0.5)) / STRIP)} className="h-full flex-1" aria-label={t("Frame {n}", { n: i + 1 })} data-testid="cover-frame">
              {strip[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={strip[i]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full animate-pulse bg-black/10" />
              )}
            </button>
          ))}
        </div>
        {duration > 0 && (
          <span className="pointer-events-none absolute -top-1 bottom-[-4px] w-1.5 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-brand-500" style={{ insetInlineStart: `${(time / duration) * 100}%` }} />
        )}
      </div>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={time}
        disabled={!duration}
        onChange={(e) => go(Number(e.target.value))}
        className="w-full accent-brand-500"
        aria-label={t("Choose the moment")}
        data-testid="cover-slider"
      />
      <Button type="button" size="lg" block onClick={use} loading={saving} disabled={!duration} data-testid="cover-use">
        <Check className="h-5 w-5" /> {t("Use this frame")}
      </Button>
    </div>
  );
}
