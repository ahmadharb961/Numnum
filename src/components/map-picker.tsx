"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import type { Map as LMap, Marker, Circle } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";

export type Pin = { lat: number; lng: number };

const BEIRUT: Pin = { lat: 33.8938, lng: 35.5018 };

/**
 * Drag-the-pin map (OpenStreetMap tiles, no API key). Starts at `value`, else the
 * device location when the user taps "Use my location", else Beirut.
 * Optional `radiusKm` draws a delivery circle around the pin (restaurant setup); `rings` adds
 * fainter inner circles (km) for delivery fee zones.
 */
export function MapPicker({ value, onChange, radiusKm, rings = [], height = 260, autoLocate }: { value: Pin | null; onChange: (p: Pin) => void; radiusKm?: number; rings?: number[]; height?: number; autoLocate?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const circle = useRef<Circle | null>(null);
  const ringRefs = useRef<Circle[]>([]);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const start = value ?? BEIRUT;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 16 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const icon = L.divIcon({ className: "", html: '<div style="width:34px;height:34px;transform:translate(-50%,-100%);position:absolute;left:0;top:0"><svg viewBox="0 0 24 24" width="34" height="34"><path fill="#ff5412" stroke="#fff" stroke-width="1.5" d="M12 2C7.6 2 4 5.5 4 9.9 4 15.5 12 22 12 22s8-6.5 8-12.1C20 5.5 16.4 2 12 2z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg></div>', iconSize: [0, 0] });
      const mk = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        changeRef.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      });
      m.on("click", (e) => {
        mk.setLatLng(e.latlng);
        changeRef.current({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
      });
      map.current = m;
      marker.current = mk;
      if (!value && autoLocate) locate();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep marker/circle in sync with props
  useEffect(() => {
    (async () => {
      const L = (await import("leaflet")).default;
      if (!map.current || !marker.current) return;
      if (value) {
        const cur = marker.current.getLatLng();
        if (Math.abs(cur.lat - value.lat) > 1e-6 || Math.abs(cur.lng - value.lng) > 1e-6) {
          marker.current.setLatLng([value.lat, value.lng]);
          map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 15));
        }
      }
      circle.current?.remove();
      circle.current = null;
      ringRefs.current.forEach((c) => c.remove());
      ringRefs.current = [];
      if (radiusKm && value) {
        circle.current = L.circle([value.lat, value.lng], { radius: radiusKm * 1000, color: "#ff5412", weight: 2, fillOpacity: 0.08 }).addTo(map.current);
        for (const km of rings) if (km > 0 && km < radiusKm) ringRefs.current.push(L.circle([value.lat, value.lng], { radius: km * 1000, color: "#ff5412", weight: 1, dashArray: "4 6", fill: false }).addTo(map.current));
        map.current.fitBounds(circle.current.getBounds(), { padding: [12, 12], animate: false });
      }
    })();
  }, [value?.lat, value?.lng, radiusKm, rings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available on this device — drag the pin instead.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) };
        changeRef.current(p);
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Drag the pin to your door instead.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-black/10" style={{ height }}>
        <div ref={el} className="h-full w-full" aria-label="Map — drag the pin to the exact location" />
        <Button type="button" size="sm" variant="outline" onClick={locate} className="absolute bottom-3 right-3 z-[500] shadow-md">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my location
        </Button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{error ?? "Drag the pin or tap the map to set the exact spot."}</p>
    </div>
  );
}
