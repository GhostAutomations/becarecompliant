import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";
import { noticeForCaller } from "@/lib/briefings/memo";
import { noticeFilePath, noticeMimeType } from "@/lib/briefings/notice-rules";

/**
 * One file sent with a memo, message or attachment (0435). The caller's RLS decides who may have
 * it (see the memo route); the file is streamed from our origin through a 5 minute signed URL,
 * so the bucket link never reaches the browser, and every download is audit-logged.
 *
 * ?download=1 asks the browser to save it rather than show it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return NextResponse.json({ error: "No company context." }, { status: 400 });
  const { id, n } = await ctx.params;
  const index = Number(n);
  const notice = await noticeForCaller(id);
  if (!notice || notice.company_id !== profile.company_id || !Number.isInteger(index) || index < 1) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const files = Array.isArray(notice.files) ? (notice.files as Array<{ path?: string; name?: string }>) : [];
  const file = files[index - 1];
  const name = String(file?.name ?? "");
  // The stored path must be the one this notice would have written, never anything else.
  if (!file || file.path !== noticeFilePath(notice.company_id, notice.id, index, name)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const admin = createServiceClient();
  const { data: signed, error } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(file.path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "The file could not be opened." }, { status: 500 });
  }
  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "The file could not be read." }, { status: 502 });
  }

  await writeAudit({
    companyId: notice.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.file_downloaded",
    entityType: "briefing_notice",
    entityId: notice.id,
    summary: `Opened "${name}" from "${notice.title}"`,
    metadata: { file: index },
  });

  const ascii = name.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": noticeMimeType(name),
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
