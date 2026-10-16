-- Rota and Visits Stage 3 (Phil, 2026-10-16): a private bucket for our own UK map file
-- (uk.pmtiles, OpenStreetMap data, Protomaps basemap, about 3 GB), used by the office map pin.
-- Private: no storage policies at all, so no signed in user can list or read it directly. The
-- server hands the office a short lived signed link (service role, lib/rota/map.ts). The map holds
-- no personal data, but it follows the private bucket rule like every other file.
-- Additive only: a new bucket; no existing bucket or storage policy is touched.

insert into storage.buckets (id, name, public, file_size_limit)
values ('maps', 'maps', false, 4294967296)
on conflict (id) do nothing;
