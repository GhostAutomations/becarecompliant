Map fonts and icons for the Clock in map pin (Rota and Visits Stage 3, Phil 2026-10-16).

From github.com/protomaps/basemaps-assets (main), kept here so the map loads nothing from
another site:
  fonts/    Noto Sans Regular, Medium and Italic, Latin ranges only (0-255, 256-511 for Welsh
            letters, 8192-8447 punctuation). SIL Open Font License: fonts/OFL.txt.
  sprites/  dark icon sheets (v4). Derived from MIT licensed tangrams/icons.

The map itself (UK, OpenStreetMap data, Protomaps basemap, ODbL) is a private file in Supabase
Storage (bucket "maps", uk.pmtiles), read through a short lived signed link. OpenStreetMap is
credited on the map.
