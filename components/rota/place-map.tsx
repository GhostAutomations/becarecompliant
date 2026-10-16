"use client";

/**
 * Be Care Compliant: the office map pin for a clock in place (Rota and Visits Stage 3, Phil
 * 2026-10-16: "i think we need both", map in the office as well as at the home).
 *
 * Our own UK map file (OpenStreetMap data, Protomaps basemap) read through a one hour signed link,
 * with the map fonts and icons served from this app (public/map), so the map loads nothing from
 * another site and no map supplier sees who is looking where. MapLibre draws it. Drag the pin, or
 * tap the map where the front door is; the radius is drawn around it; Save sets the point (office
 * roles only, recorded).
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mapLinkAction, setPlaceMapAction } from "@/lib/rota/clock-actions";
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
      const link = await mapLinkAction();
      if (cancelled) return;
      if (!link.url) {
        setStatus(null);
        setError(link.error ?? "The map could not be loaded.");
        return;
      }
      const [maplibregl, pmtiles, basemaps] = await Promise.all([import("maplibre-gl"), import("pmtiles"), import("@protomaps/basemaps")]);
      if (cancelled || !box.current) return;
      // MapLibre 6's worker is a separate file the app bundle does not carry: served from
      // public/map/maplibre (lib/rota/map-worker.test.ts keeps it in step with the installed one).
      maplibregl.setWorkerUrl(`${location.origin}/map/maplibre/maplibre-gl-worker.mjs`);
      const protocol = new pmtiles.Protocol();
      const archive = new pmtiles.PMTiles(link.url);
      protocol.add(archive);
      maplibregl.addProtocol("pmtiles", protocol.tile);
      const centre = start ?? UK_CENTRE;
      const map = new maplibregl.Map({
        container: box.current,
        style: {
          version: 8,
          glyphs: `${location.origin}/map/fonts/{fontstack}/{range}.pbf`,
          sprite: `${location.origin}/map/sprites/dark`,
          sources: {
            protomaps: {
              type: "vector",
              url: `pmtiles://${link.url}`,
              attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap</a>',
            },
          },
          layers: basemaps.layers("protomaps", basemaps.namedFlavor("dark"), { lang: "en" }),
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
      map.on("load", () => {
        setStatus(null);
        if (start) place(start);
      });
      map.on("error", () => setStatus(null));
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        place({ lat: ll.lat, lng: ll.lng });
      });
      map.on("click", (e: { lngLat: { lat: number; lng: number } }) => place({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      cleanup = () => {
        map.remove();
        maplibregl.removeProtocol("pmtiles");
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
        {status ? <p className="absolute inset-x-0 top-1/2 text-center text-sm text-white/60" role="status">{status}</p> : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={!pos || saving} onClick={save}>
        {saving ? "Saving…" : "Save pin"}
      </button>
    </div>
  );
}
