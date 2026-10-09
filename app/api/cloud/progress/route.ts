import { NextResponse } from "next/server";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { cloudProgress } from "@/lib/cloud/progress";

/** Live progress of the cloud drive copies, for an Admin's Settings page (polled every few seconds). */
export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return NextResponse.json({ error: "company" }, { status: 400 });
  const p = await cloudProgress(profile.company_id);
  return NextResponse.json(p, { headers: { "Cache-Control": "no-store" } });
}
