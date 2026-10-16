import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Be Care Compliant: the office map's link to our own UK map file (Rota and Visits Stage 3, Phil
 * 2026-10-16: our own map file, no map supplier). The file is private (bucket "maps", no storage
 * policies); the office gets a link that works for one hour. It holds map data only (OpenStreetMap,
 * Protomaps basemap), no personal data, and the browser reads it in small pieces as the map moves.
 */
export const MAP_FILE = "uk.pmtiles";

export async function mapLink(): Promise<{ url: string } | { error: string }> {
  const { data, error } = await createServiceClient().storage.from("maps").createSignedUrl(MAP_FILE, 3600);
  if (error || !data?.signedUrl) {
    return { error: "The map is not uploaded yet, so the pin cannot be shown. Set the point from where you are standing instead." };
  }
  return { url: data.signedUrl };
}
