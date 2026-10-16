import { NextResponse } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { rotaModuleOn } from "@/lib/rota/access";
import { isRotaOfficeRole } from "@/lib/rota/roles";
import { mapkitToken } from "@/lib/rota/mapkit-token";

/**
 * A one hour Apple Maps pass for the office map pin (Rota and Visits Stage 3, Phil 2026-10-16).
 * Office roles in a company with the module on only. The key stays on the server (Vercel
 * settings APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID, APPLE_MAPKIT_PRIVATE_KEY); without them the
 * map says it is not set up yet, never fails silently.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await requireCompany();
  if (!profile.company_id || !(await rotaModuleOn(profile.company_id)) || !isRotaOfficeRole(profile.role)) {
    return NextResponse.json({ error: "The rota is not available." }, { status: 403 });
  }
  const teamId = process.env.APPLE_MAPKIT_TEAM_ID;
  const keyId = process.env.APPLE_MAPKIT_KEY_ID;
  const privateKeyPem = process.env.APPLE_MAPKIT_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyPem) {
    return NextResponse.json(
      { error: "Apple Maps is not set up yet: the Founder adds the Apple Maps key in Vercel. Set the point from where you are standing instead." },
      { status: 503 },
    );
  }
  try {
    const token = mapkitToken({ teamId, keyId, privateKeyPem, nowSeconds: Math.floor(Date.now() / 1000) });
    return new NextResponse(token, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[mapkit-token]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The Apple Maps key in Vercel could not be read. Check APPLE_MAPKIT_PRIVATE_KEY." }, { status: 500 });
  }
}
