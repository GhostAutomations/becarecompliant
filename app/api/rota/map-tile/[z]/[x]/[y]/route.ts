import { NextRequest, NextResponse } from "next/server";
import { mapArchive } from "@/lib/rota/map";

/**
 * One square of the office map (Rota and Visits Stage 3), from our own UK map file. Signed in
 * users only (this path is not public, so the middleware sends anyone else to sign in). The
 * squares are OpenStreetMap map data with no personal data, and never change for a given map file,
 * so the browser and Vercel's cache keep them; each is read from the file once.
 */
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const p = await params;
  const z = Number(p.z);
  const x = Number(p.x);
  const y = Number(p.y.replace(/\.mvt$/, ""));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 15 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return NextResponse.json({ error: "Not a map square." }, { status: 400 });
  }
  try {
    const tile = await mapArchive().getZxy(z, x, y);
    const cache = "public, max-age=604800, s-maxage=31536000, immutable";
    if (!tile) return new NextResponse(null, { status: 204, headers: { "Cache-Control": cache } });
    return new NextResponse(tile.data, { headers: { "Content-Type": "application/vnd.mapbox-vector-tile", "Cache-Control": cache } });
  } catch (e) {
    console.error("[map-tile]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The map could not be read." }, { status: 502 });
  }
}
