"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type Props = {
  file: File | null;
  title: string;
  /** width / height of the result, e.g. 16 / 9 */
  aspect: number;
  outputWidth: number;
  /** Optional centered band (width / height) to outline, e.g. what wide screens show. */
  guide?: { aspect: number; label: string };
  onCancel: () => void;
  onDone: (blob: Blob) => void;
};

const MAX_ZOOM = 4;

/** Fixed-shape crop for logos and covers: drag to position, zoom with the slider or wheel; exports the framed area as JPEG. */
export function FramedCropper({ file, title, aspect, outputWidth, guide, onCancel, onDone }: Props) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
    };
    el.src = url;
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Measure the frame once the sheet has laid out.
  useEffect(() => {
    if (!file) return;
    const measure = () => setFrameW(frameRef.current?.clientWidth ?? 0);
    const t = setTimeout(measure, 50);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [file, img]);

  const frameH = frameW / aspect;
  const base = img && frameW ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = base * zoom;

  const clamp = useCallback(
    (p: { x: number; y: number }, s: number) => {
      if (!img) return p;
      const minX = frameW - img.naturalWidth * s;
      const minY = frameH - img.naturalHeight * s;
      return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
    },
    [img, frameW, frameH],
  );

  // Center the image whenever a new one loads or the frame size changes.
  useEffect(() => {
    if (!img || !frameW) return;
    setPos(clamp({ x: (frameW - img.naturalWidth * base) / 2, y: (frameH - img.naturalHeight * base) / 2 }, base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, frameW]);

  // Zoom around the frame center.
  const zoomTo = (z: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const ns = base * nz;
    const cx = (frameW / 2 - pos.x) / scale;
    const cy = (frameH / 2 - pos.y) / scale;
    setZoom(nz);
    setPos(clamp({ x: frameW / 2 - cx * ns, y: frameH / 2 - cy * ns }, ns));
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, frameW / scale, frameH / scale, 0, 0, outputWidth, outH);
    canvas.toBlob((b) => {
      setSaving(false);
      if (b) onDone(b);
    }, "image/jpeg", 0.9);
  };

  const guideH = guide ? frameW / guide.aspect : 0;

  return (
    <Sheet open={!!file} onClose={onCancel} title={title}>
      <div className="space-y-4 p-5">
        <div
          ref={frameRef}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-black active:cursor-grabbing"
          style={{ height: frameH || undefined, aspectRatio: frameW ? undefined : String(aspect) }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }, scale));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {src && img && frameW > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute start-0 top-0 max-w-none origin-top-left"
              style={{ width: img.naturalWidth * scale, height: img.naturalHeight * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          {guide && guideH > 0 && guideH < frameH && (
            <div className="pointer-events-none absolute inset-x-0 border-y-2 border-dashed border-white/80" style={{ top: (frameH - guideH) / 2, height: guideH }}>
              <span className="absolute start-2 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">{guide.label}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => zoomTo(zoom / 1.2)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5" aria-label={t("Zoom out")}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="flex-1 accent-brand-500" aria-label={t("Zoom")} />
          <button type="button" onClick={() => zoomTo(zoom * 1.2)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5" aria-label={t("Zoom in")}>
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <p className="text-center text-xs text-ink-muted">{guide ? t("Drag the photo to position it. Zoom with the slider; the dashed band is what wide screens show.") : t("Drag the photo to position it. Zoom with the slider.")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" block onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="button" block loading={saving} disabled={!img} onClick={save}>
            {t("Use this photo")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
