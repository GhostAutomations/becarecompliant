import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { noticeForCaller, renderNoticeMemo } from "@/lib/briefings/memo";

/**
 * A memo sent as a Briefing, as a PDF on the company letterhead (0435). The caller's RLS decides
 * who may have it: the company-wide roles, the sender, a branch lead for their branch, and the
 * people it was sent to. Every opening is audit-logged.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return NextResponse.json({ error: "No company context." }, { status: 400 });
  const { id } = await ctx.params;
  const notice = await noticeForCaller(id);
  if (!notice || notice.company_id !== profile.company_id || notice.kind !== "memo") {
    return NextResponse.json({ error: "Memo not found." }, { status: 404 });
  }
  let pdf: Buffer;
  try {
    pdf = await renderNoticeMemo(notice, profile.id);
  } catch (e) {
    console.error("[briefings] memo PDF failed:", (e as Error).message);
    return NextResponse.json({ error: "The memo could not be drawn. Try again." }, { status: 500 });
  }
  await writeAudit({
    companyId: notice.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.memo_opened",
    entityType: "briefing_notice",
    entityId: notice.id,
    summary: `Opened the memo "${notice.title}" as a PDF`,
  });
  const safe = notice.title.replace(/[^a-zA-Z0-9 _-]+/g, "").trim().slice(0, 60) || "memo";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
