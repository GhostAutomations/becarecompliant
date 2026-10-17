import { NextResponse } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { loadDmd } from "@/lib/dmd/import";

/**
 * The Founder loads the NHS medicines list now (Rota and Visits Stage 6), rather than waiting for
 * Monday's job: the first load, or after a failure. Founder only.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const { user, profile } = await requireCompany();
  // The Founder, signed in as themself or managing a company (which shows them as its Admin).
  if (profile.role !== "platform_admin" && !profile.actingAsCompanyId) return NextResponse.json({ error: "Only the Founder can load the NHS medicines list." }, { status: 403 });
  const result = await loadDmd({ force: false, by: user.id });
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "dmd.load",
    entityType: "dmd_release",
    entityId: result.ok ? result.release : "failed",
    summary: result.ok ? `Loaded the NHS medicines list, release ${result.release} (${result.products} products)${result.skipped ? ", already loaded" : ""}` : `Loading the NHS medicines list failed: ${result.error}`,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
