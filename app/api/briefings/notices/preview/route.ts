import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { renderMemoPreview } from "@/lib/briefings/memo";
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from "@/lib/briefings/notice-rules";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";

/**
 * Preview a memo before it is sent (Phil, 2026-10-08). POST { title, body, fileNames }, get the
 * PDF back exactly as it will look on the company letterhead. Nothing is stored or sent, so
 * there is nothing to audit; only managers who can send briefings can use it.
 */
export const dynamic = "force-dynamic";

const SENDERS = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export async function POST(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return NextResponse.json({ error: "No company context." }, { status: 400 });
  if (!SENDERS.includes(profile.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let input: { title?: unknown; body?: unknown; fileNames?: unknown };
  try {
    input = (await req.json()) as typeof input;
  } catch {
    return NextResponse.json({ error: "Could not read the memo." }, { status: 400 });
  }
  const title = String(input.title ?? "").trim().slice(0, NOTICE_TITLE_MAX) || "Untitled memo";
  const body = String(input.body ?? "").slice(0, NOTICE_BODY_MAX.memo);
  const fileNames = (Array.isArray(input.fileNames) ? input.fileNames : [])
    .slice(0, 3)
    .map((n) => String(n ?? "").slice(0, 120))
    .filter(Boolean);

  let pdf: Buffer;
  try {
    pdf = await renderMemoPreview({
      companyId: profile.company_id,
      senderId: profile.id,
      title,
      body,
      fileNames,
      todayIso: formatCivilDate(todayInLondon()),
    });
  } catch (e) {
    console.error("[briefings] memo preview failed:", (e as Error).message);
    return NextResponse.json({ error: "The preview could not be drawn. Try again." }, { status: 500 });
  }
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Memo preview.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
