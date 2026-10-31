"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin, Home as HomeIcon } from "lucide-react";
import { MapPicker, type Pin } from "@/components/map-picker";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const COOKIE = "nn_loc";
type Loc = Pin & { label: string; place?: string | null; name?: string | null };
type Saved = { id: string; label: string; area: string | null; address: string; latitude: number | null; longitude: number | null };

export function readLocation(): Loc | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )nn_loc=([^;]+)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

/** "Hamra, Beirut, Lebanon" for a point, via /api/geo/reverse (null if unknown). */
export async function placeName(p: Pin): Promise<string | null> {
  try {
    const r = await fetch(`/api/geo/reverse?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}`);
    return ((await r.json()) as { name: string | null }).name;
  } catch {
    return null;
  }
}

export function writeLocation(l: Loc) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(l))}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
}

/** "Deliver to …" chip: GPS, a saved address, or a pin on the map. Drives distance checks everywhere. */
export function LocationChip({ label, dark, className }: { label: string | null; dark?: boolean; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn("inline-flex max-w-[62vw] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold", dark ? "bg-black/40 text-white backdrop-blur" : "bg-white text-ink shadow-sm", className)} aria-label={t("Change delivery location")}>
        <MapPin className={cn("h-4 w-4 shrink-0", dark ? "text-brand-300" : "text-brand-500")} />
        <span className="truncate">{label ?? t("Set your delivery location")}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>
      <LocationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LocationSheet({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked?: (l: Loc) => void }) {
  const t = useT();
  const router = useRouter();
  const [pin, setPin] = useState<Pin | null>(null);
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [place, setPlace] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const cur = readLocation();
    setPin(cur ? { lat: cur.lat, lng: cur.lng } : null);
    setLabel(cur?.name ?? "");
    setPlace(cur?.place ?? null);
    fetch("/api/account/checkout-profile")
      .then((r) => r.json())
      .then((p) => setSaved((p.addresses ?? []).filter((a: Saved) => a.latitude != null)))
      .catch(() => {});
  }, [open]);

  // Name the pinned spot as it moves ("Hamra, Beirut, Lebanon").
  useEffect(() => {
    if (!open || !pin) return;
    let cancelled = false;
    setPlacing(true);
    const t = setTimeout(async () => {
      const name = await placeName(pin);
      if (!cancelled) {
        setPlace(name);
        setPlacing(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, pin]);

  const pick = (l: Loc) => {
    writeLocation(l);
    onPicked?.(l);
    onClose();
    router.refresh();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Where should we deliver?">
      <div className="space-y-4 p-5">
        {saved.length > 0 && (
          <div className="space-y-2">
            {saved.map((a) => (
              <button key={a.id} onClick={async () => {
                  const p = { lat: a.latitude!, lng: a.longitude! };
                  const name = await placeName(p);
                  pick({ ...p, label: name ?? a.label, place: name });
                }} className="flex w-full items-center gap-3 rounded-2xl bg-cream p-3 text-start text-sm">
                <HomeIcon className="h-5 w-5 text-brand-500" />
                <span className="min-w-0">
                  <span className="block font-bold">{a.label}</span>
                  <span className="block truncate text-ink-muted">{[a.area, a.address].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {open && <MapPicker value={pin} onChange={setPin} autoLocate={!pin} height={280} />}
        {pin && (
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
            <span className="truncate">{placing && !place ? t("Finding the area…") : place ?? t("Pinned location")}</span>
          </p>
        )}
        <input className="input" placeholder={t("Label (optional, e.g. Home, Work)")} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        <Button block size="lg" disabled={!pin} onClick={() => pin && pick({ ...pin, label: place ?? (label.trim() || "Pinned location"), place, name: label.trim() || null })}>
          {t("Use this location")}
        </Button>
        <p className="text-center text-xs text-ink-muted">{t("We use it to show restaurants that deliver to you and calculate delivery fees.")}</p>
      </div>
    </Sheet>
  );
}
