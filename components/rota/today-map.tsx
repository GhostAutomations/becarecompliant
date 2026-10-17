"use client";

/**
 * Be Care Compliant: today's clock taps on a map, for the office (Rota and Visits Stage 7, decision 7).
 * Each home's point and radius, and each carer's last clock in or out today, from the taps already
 * stored; nothing new is kept. Apple Maps, as the Clock in page (Stage 3 decision 15). The page's
 * security policy allows Apple only when it was loaded as Today, so arriving from another tab shows
 * a button that loads the page properly.
 */

import { useEffect, useRef, useState } from "react";
import { loadMapKit } from "@/components/rota/place-map";

export type MapHome = { id: string; name: string; lat: number; lng: number; radius: number };
export type MapTap = { id: string; name: string; label: string; lat: number; lng: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapKit = any;

export default function TodayMap({ homes, taps }: { homes: MapHome[]; taps: MapTap[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>("Loading the map…");
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (new URL(nav?.name ?? location.href).pathname !== "/rota/today") {
        setStatus(null);
        setNeedsReload(true);
        return;
      }
      const res = await fetch("/api/rota/mapkit-token", { cache: "no-store" });
      if (!res.ok) throw new Error("The map could not be loaded.");
      const mapkit = await loadMapKit(await res.text());
      if (cancelled || !box.current) return;
      const map = new mapkit.Map(box.current, { showsMapTypeControl: false, showsCompass: mapkit.FeatureVisibility.Hidden });
      const style = new mapkit.Style({ strokeColor: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.12, lineWidth: 1 });
      const annotations: MapKit[] = [];
      for (const h of homes) {
        const c = new mapkit.Coordinate(h.lat, h.lng);
        annotations.push(new mapkit.MarkerAnnotation(c, { color: "#f59e0b", title: h.name, glyphText: "H" }));
        map.addOverlay(new mapkit.CircleOverlay(c, h.radius, { style }));
      }
      for (const t of taps) {
        annotations.push(new mapkit.MarkerAnnotation(new mapkit.Coordinate(t.lat, t.lng), { color: "#38bdf8", title: t.name, subtitle: t.label, glyphText: "C" }));
      }
      if (annotations.length) map.showItems(annotations, { animate: false, padding: new mapkit.Padding(40, 40, 40, 40) });
      setStatus(annotations.length ? null : "No homes with a map point and no clock taps today.");
      cleanup = () => map.destroy();
    })().catch((e: unknown) => {
      if (!cancelled) setStatus(e instanceof Error ? e.message : "The map could not be loaded.");
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [homes, taps]);

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-xl border border-white/10">
      <div ref={box} className="h-full w-full" />
      {needsReload ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => location.reload()}>
            Show the map
          </button>
        </div>
      ) : status ? (
        <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-white/60" role="status">{status}</p>
      ) : null}
    </div>
  );
}
