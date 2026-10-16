"use client";

/**
 * Be Care Compliant: the office map pin for a clock in place (Rota and Visits Stage 3, Phil
 * 2026-10-16: "i think we need both", map in the office as well as at the home).
 *
 * Mapbox's street map (Phil, 2026-10-16, as Nourish uses), shown through MapLibre in the way
 * Mapbox documents for MapLibre: raster map squares from Mapbox's Styles API with our public token
 * (restricted to our web addresses). Drag the pin, or tap the map where the front door is; the
 * radius is drawn around it; Save sets the point (office roles only, recorded). Mapbox is a
 * subprocessor: it sees which map squares are viewed (docs/decisions/rota-visits.md, Stage 3).
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlaceMapAction } from "@/lib/rota/clock-actions";
import { circleRing, type Point } from "@/lib/rota/clock";

const UK_CENTRE: Point = { lat: 54.0, lng: -2.5 };

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
    (async () => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        setStatus(null);
        setError("The map is not set up yet: the Mapbox token is missing (the Founder adds it in Vercel). Set the point from where you are standing instead.");
        return;
      }
      // MapLibre is loaded from its own files in public/map/maplibre (with its worker beside it),
      // not through the app bundle: bundled, its main code and its worker did not cooperate
      // (found in the screen test, 2026-10-16). lib/rota/map-worker.test.ts keeps these files in
      // step with the installed maplibre-gl.
      const libUrl = `${location.origin}/map/maplibre/maplibre-gl.mjs`;
      const maplibregl = (await import(/* webpackIgnore: true */ libUrl)) as typeof import("maplibre-gl");
      if (cancelled || !box.current) return;
      maplibregl.setWorkerUrl(`${location.origin}/map/maplibre/maplibre-gl-worker.mjs`);
      const centre = start ?? UK_CENTRE;
      const map = new maplibregl.Map({
        container: box.current,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: [`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`],
              tileSize: 512,
              maxzoom: 22,
              attribution:
                '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
        center: [centre.lng, centre.lat],
        zoom: start ? 17 : 5,
        maxZoom: 19,
        attributionControl: { compact: false },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const marker = new maplibregl.Marker({ draggable: true, color: "#f59e0b" });
      const draw = (p: Point) => {
        const src = map.getSource("radius") as { setData: (d: unknown) => void } | undefined;
        const data = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(p, radius)] } };
        if (src) src.setData(data);
        else if (map.isStyleLoaded()) {
          map.addSource("radius", { type: "geojson", data: data as never });
          map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.15 } });
          map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#f59e0b", "line-width": 2 } });
        }
      };
      const place = (p: Point) => {
        marker.setLngLat([p.lng, p.lat]).addTo(map);
        setPos(p);
        draw(p);
      };
      // Visible state, never a silent hang: what the map is doing is on the box (data-state),
      // any error is shown, and after 20 seconds without a map the office is told.
      const mark = (state: string) => {
        if (box.current) box.current.dataset.state = state;
      };
      mark("created");
      const slow = window.setTimeout(() => {
        if (!map.loaded()) setError("The map is taking too long to load. Check your connection, or set the point from where you are standing.");
      }, 20_000);
      map.on("styledata", () => mark("style"));
      map.on("sourcedata", (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
        if (e.sourceId === "basemap") mark(e.isSourceLoaded ? "tiles" : "source");
      });
      map.on("load", () => {
        mark("loaded");
        window.clearTimeout(slow);
        setStatus(null);
        setError(null);
        if (start) place(start);
      });
      map.on("error", (e: { error?: { message?: string } }) => {
        const message = e.error?.message ?? "unknown";
        mark(`error: ${message}`);
        setStatus(null);
        setError(`The map hit a problem: ${message}`);
      });
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        place({ lat: ll.lat, lng: ll.lng });
      });
      map.on("click", (e: { lngLat: { lat: number; lng: number } }) => place({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      cleanup = () => {
        window.clearTimeout(slow);
        map.remove();
      };
    })().catch(() => {
      if (!cancelled) {
        setStatus(null);
        setError("The map could not be loaded. Set the point from where you are standing instead.");
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [start, radius]);

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
        {/* MapLibre sets its own position on this box, so it is sized directly, not by inset. */}
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
