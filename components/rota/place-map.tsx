"use client";

/**
 * Be Care Compliant: the office map pin for a clock in place (Rota and Visits Stage 3, Phil
 * 2026-10-16: "i think we need both", map in the office as well as at the home).
 *
 * Apple Maps (MapKit JS), Phil's choice, knowing Apple handles map data under its own privacy
 * policy rather than as our processor (docs/decisions/rota-visits.md, Stage 3 decision 15). Our
 * server hands out a one hour map pass (app/api/rota/mapkit-token); MapKit JS loads from Apple's
 * CDN with this page's nonce, as Apple documents for a Content Security Policy. Drag the pin, or
 * tap the map where the front door is; the radius is drawn around it; Save sets the point (office
 * roles only, recorded). Any problem is shown, never a silent hang.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlaceMapAction } from "@/lib/rota/clock-actions";
import type { Point } from "@/lib/rota/clock";

// MapKit JS has no types in this project; the few calls used here are listed in Apple's docs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapKit = any;

const MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/5.81.60/mapkit.core.js";
const UK_CENTRE: Point = { lat: 54.0, lng: -2.5 };

/** Loads MapKit JS once per page, with the pass from our server; resolves with the mapkit object. */
export function loadMapKit(token: string): Promise<MapKit> {
  const w = window as unknown as { mapkit?: MapKit; __bccMapKit?: Promise<MapKit> };
  if (w.__bccMapKit) return w.__bccMapKit;
  w.__bccMapKit = new Promise((resolve, reject) => {
    const cb = `bccMapKitReady${Date.now()}`;
    (window as unknown as Record<string, unknown>)[cb] = () => (w.mapkit ? resolve(w.mapkit) : reject(new Error("Apple Maps did not start.")));
    const el = document.createElement("script");
    el.src = MAPKIT_SRC;
    el.crossOrigin = "anonymous";
    el.async = true;
    el.dataset.callback = cb;
    el.dataset.libraries = "map,annotations,overlays";
    el.dataset.token = token;
    const nonce = (document.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce;
    if (nonce) el.nonce = nonce;
    el.onerror = () => reject(new Error("Apple Maps could not be reached."));
    document.head.appendChild(el);
  });
  w.__bccMapKit.catch(() => {
    delete w.__bccMapKit;
  });
  return w.__bccMapKit;
}

export default function PlaceMap({
  placeId,
  start,
  radius,
  onSaved,
}: {
  placeId: string;
  start: Point | null;
  radius: number;
  onSaved: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(start);
  const [status, setStatus] = useState<string | null>("Loading the map…");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const fail = (message: string) => {
      if (cancelled) return;
      setStatus(null);
      setError(message);
    };
    (async () => {
      // The page keeps the security policy it was first loaded with, and Apple's map is allowed
      // only on a page loaded as Clock in. Arrived here from another page without a reload: load
      // this page properly once, and reopen this map by itself (PlaceControls reads the note).
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const firstPath = new URL(nav?.name ?? location.href).pathname;
      if (!(firstPath === "/rota/clock" || firstPath.startsWith("/rota/clock/"))) {
        setStatus("Opening Apple Maps…");
        try {
          sessionStorage.setItem("bcc-open-map", placeId);
        } catch {
          /* without the note the office simply presses the button again */
        }
        location.reload();
        return;
      }
      const res = await fetch("/api/rota/mapkit-token", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return fail(body?.error ?? "The map could not be loaded. Set the point from where you are standing instead.");
      }
      const mapkit = await loadMapKit(await res.text());
      if (cancelled || !box.current) return;
      const onMapKitError = (e: { status?: string }) => fail(`Apple Maps refused the map (${e.status ?? "unknown"}). Check the Apple Maps key in Vercel.`);
      mapkit.addEventListener("error", onMapKitError);

      const centre = start ?? UK_CENTRE;
      const map = new mapkit.Map(box.current, {
        region: new mapkit.CoordinateRegion(
          new mapkit.Coordinate(centre.lat, centre.lng),
          // About 2 km across, so the main roads and the area show too (Phil, 2026-10-16); the
          // whole UK when there is no point yet.
          start ? new mapkit.CoordinateSpan(0.018, 0.029) : new mapkit.CoordinateSpan(10, 12),
        ),
        showsMapTypeControl: false,
        showsCompass: mapkit.FeatureVisibility.Hidden,
      });
      const style = new mapkit.Style({ strokeColor: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.15, lineWidth: 2 });
      let marker: MapKit = null;
      let circle: MapKit = null;
      const place = (p: Point) => {
        const coord = new mapkit.Coordinate(p.lat, p.lng);
        if (!marker) {
          marker = new mapkit.MarkerAnnotation(coord, { draggable: true, color: "#f59e0b" });
          marker.addEventListener("drag-end", () => place({ lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }));
          map.addAnnotation(marker);
          circle = new mapkit.CircleOverlay(coord, radius, { style });
          map.addOverlay(circle);
        } else {
          marker.coordinate = coord;
          circle.coordinate = coord;
        }
        setPos(p);
      };
      if (start) place(start);
      map.addEventListener("single-tap", (e: { pointOnPage: unknown }) => {
        const c = map.convertPointOnPageToCoordinate(e.pointOnPage);
        place({ lat: c.latitude, lng: c.longitude });
      });
      setStatus(null);
      cleanup = () => {
        mapkit.removeEventListener("error", onMapKitError);
        map.destroy();
      };
    })().catch((e: unknown) => fail(e instanceof Error ? `${e.message} Set the point from where you are standing instead.` : "The map could not be loaded."));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [start, radius, placeId]);

  async function save() {
    if (!pos) return;
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("place_id", placeId);
    fd.set("lat", String(pos.lat));
    fd.set("lng", String(pos.lng));
    const res = await setPlaceMapAction({}, fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    startTransition(() => router.refresh());
    onSaved();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/70">Drag the pin, or tap the map, to put it on the front door. The circle is the clock in radius ({radius} m).</p>
      <div className="relative h-[60vh] min-h-72 w-full overflow-hidden rounded-xl border border-white/10">
        <div ref={box} className="h-full w-full" />
        {status ? <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-white/60" role="status">{status}</p> : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={!pos || saving} onClick={save}>
        {saving ? "Saving…" : "Save pin"}
      </button>
    </div>
  );
}
