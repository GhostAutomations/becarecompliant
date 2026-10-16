MapLibre's own files for the Clock in map pin (Rota and Visits Stage 3, Phil 2026-10-16).

  maplibre/  maplibre-gl.mjs, maplibre-gl-worker.mjs and maplibre-gl-shared.mjs, copied from
             node_modules/maplibre-gl/dist (BSD 3-Clause). Loaded from here, not through the app
             bundle, so the main code and its worker are the same files. VERSION must match the
             installed maplibre-gl (lib/rota/map-worker.test.ts checks it).

The map itself is Mapbox's street map (raster tiles from api.mapbox.com, Mapbox and OpenStreetMap
credited on the map), with the public token in NEXT_PUBLIC_MAPBOX_TOKEN.
