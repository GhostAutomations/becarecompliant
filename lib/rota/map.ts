import "server-only";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";

/**
 * Be Care Compliant: the office map's tiles, served from our own UK map file (Rota and Visits
 * Stage 3, Phil 2026-10-16: our own map file, no map supplier).
 *
 * The file (uk.pmtiles, OpenStreetMap data, Protomaps basemap, about 3 GB) is private in Supabase
 * Storage (bucket "maps", no storage policies). Read straight from the browser it was too slow: a
 * piece of the file Supabase has not sent before can take 4 to 27 seconds to arrive (measured in
 * the screen test, 2026-10-16). So the server reads the pieces it needs (service role, the server
 * only) and answers with one map square at a time, which the browser and Vercel then keep, so
 * each square is read from the file once. The squares are map data only, no personal data.
 */
export const MAP_FILE = "uk.pmtiles";

class StorageSource implements Source {
  getKey() {
    return MAP_FILE;
  }
  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase service role not configured.");
    const res = await fetch(`${url}/storage/v1/object/authenticated/maps/${MAP_FILE}`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key, Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
      cache: "no-store",
    });
    if (res.status !== 206 && res.status !== 200) throw new Error(`The map file could not be read (${res.status}).`);
    return { data: await res.arrayBuffer(), etag: res.headers.get("etag") ?? undefined };
  }
}

// One archive per warm server instance, so the file's index is read once and reused.
let archive: PMTiles | null = null;
export function mapArchive(): PMTiles {
  archive ??= new PMTiles(new StorageSource());
  return archive;
}
