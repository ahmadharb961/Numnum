"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

const MAX_ZOOM = 4;

/**
 * Place a photo in its frame, like Instagram: drag to move it, pinch (or the slider) to zoom. Only
 * what's inside the frame is kept. A profile photo is a circle (saved 640 × 640); a banner is a
 * wide 2:1 frame (saved 1500 × 750), so the creator chooses exactly what shows.
 */
export function AvatarCropper({ file, onCancel, onDone, busy, aspect = 1, out = 640, round = true }: { file: File; onCancel: () => void; onDone: (photo: File) => void; busy?: boolean; aspect?: number; out?: number; round?: boolean }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  const [size, setSize] = useState(300); // the frame's width, in screen px
  const fh = size / aspect; // and height
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // photo centre, from the frame centre (screen px)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setError(true);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const measure = () => setSize(Math.min(aspect > 1 ? 480 : 320, (box.current?.parentElement?.clientWidth ?? 320) - 8));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // At zoom 1 the photo just covers the frame; it can never leave a gap inside it.
  const base = img ? Math.max(size / img.naturalWidth, fh / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : size;
  const h = img ? img.naturalHeight * base * zoom : fh;
  const clamp = (p: { x: number; y: number }, z = zoom) => {
    const ww = img ? img.naturalWidth * base * z : size;
    const hh = img ? img.naturalHeight * base * z : fh;
    const mx = Math.max(0, (ww - size) / 2);
    const my = Math.max(0, (hh - fh) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const zoomTo = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setPos((p) => clamp(p, next));
  };

  const down = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
    } else {
      setPos((p) => clamp({ x: p.x + now.x - prev.x, y: p.y + now.y - prev.y }));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = () => {
    if (!img) return;
    // The part of the photo inside the frame, in the photo's own pixels.
    const scale = base * zoom;
    const sw = size / scale;
    const sh = fh / scale;
    const cx = img.naturalWidth / 2 - pos.x / scale;
    const cy = img.naturalHeight / 2 - pos.y / scale;
    const c = document.createElement("canvas");
    c.width = out;
    c.height = Math.round(out / aspect);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onDone(new File([b], round ? "profile.jpg" : "banner.jpg", { type: "image/jpeg" })), "image/jpeg", 0.88);
  };

  if (error) return <p className="p-2 text-sm text-red-600">{t("This photo can't be opened. Try another one (JPG or PNG).")}</p>;
  return (
    <div className="space-y-4" data-testid="avatar-cropper">
      <p className="text-center text-sm text-ink-muted">{t("Drag to move, pinch or use the slider to zoom.")}</p>
      <div className="flex justify-center">
        <div
          ref={box}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
          style={{ width: size, height: fh }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          data-testid="crop-area"
          data-ready={img ? "" : undefined}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: w, height: h, left: size / 2 - w / 2 + pos.x, top: fh / 2 - h / 2 + pos.y }}
            />
          )}
          {/* The circle that will be the photo (outside it is dimmed); a banner keeps the whole frame. */}
          {round ? <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" /> : <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/80" />}
        </div>
      </div>
      <div className="flex items-center gap-3 px-2">
        <ZoomOut className="h-5 w-5 shrink-0 text-ink-muted" />
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!img} onChange={(e) => zoomTo(Number(e.target.value))} className="w-full accent-brand-500" aria-label={t("Zoom")} data-testid="crop-zoom" />
        <ZoomIn className="h-5 w-5 shrink-0 text-ink-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button type="button" onClick={save} loading={busy} disabled={!img} data-testid="crop-save">
          {t("Use photo")}
        </Button>
      </div>
    </div>
  );
}
