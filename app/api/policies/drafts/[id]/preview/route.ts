import { NextResponse, type NextRequest } from "next/server";
import { requirePolicyWriter } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getDraft } from "@/lib/policies/data";
import { composeDraftWording } from "@/lib/policies/compose";
import { sourcesSection } from "@/lib/policies/ai-prompt";
import { parsePolicyText } from "@/lib/policies/text";
import { renderPolicyPdf } from "@/lib/policies/pdf";
import { previewCoverPage } from "@/lib/policies/cover-data";

/**
 * Preview as PDF: an AI draft or review, drawn exactly as Approve would save it, before it is
 * approved (Phil, 2026-10-07: "during the creation process, there's no preview option").
 *
 * The draft editor posts its own form here, so the preview is of what is on the screen now,
 * unsaved edits included. The wording comes from the same function Approve uses
 * (composeDraftWording) and the cover from the same choices, so the two cannot drift.
 *
 * NOTHING IS STORED: no policy, no version, no file, no reference number, no audit entry, no AI
 * credit. Only someone who may write the company's policies can preview its drafts, and the draft
 * is read through their own RLS client.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requirePolicyWriter();
  const companyId = profile.company_id;
  if (!companyId) return NextResponse.json({ error: "No company context." }, { status: 400 });
  const { id } = await ctx.params;

  const draft = await getDraft(id, companyId);
  if (!draft) return NextResponse.json({ error: "That draft could not be found." }, { status: 404 });
  if (draft.status !== "draft") {
    return NextResponse.json({ error: "That draft has already been approved or discarded." }, { status: 409 });
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "The form could not be read. Please try again." }, { status: 400 });
  }

  const { title, wording } = composeDraftWording(draft, fd);
  if (!wording.trim()) {
    return NextResponse.json({ error: "There is no wording to preview yet." }, { status: 400 });
  }
  const body = `${wording}\n\n${sourcesSection(draft.sources, wording)}`;

  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle<{ name: string }>();
  const companyName = co?.name ?? "Your company";

  /* "Save it as" the next version of one of this company's policies, or a new one. */
  const target = String(fd.get("target") ?? draft.policy_id ?? "new");
  let targetPolicyId: string | null = null;
  /* A new version keeps the policy's own title on its cover and pages (updateWrittenPolicy), so
     the preview does too; the draft's title only appears in the wording, as on approval. */
  let shownTitle = title;
  if (target && target !== "new") {
    const { data: tp } = await supabase
      .from("company_policies")
      .select("id, title")
      .eq("id", target)
      .eq("company_id", companyId)
      .maybeSingle<{ id: string; title: string }>();
    if (!tp) {
      return NextResponse.json({ error: "The policy chosen under Save it as could not be found." }, { status: 404 });
    }
    targetPolicyId = target;
    shownTitle = tp.title;
  }

  try {
    const { cover, version } = await previewCoverPage({
      companyId,
      companyName,
      title: shownTitle,
      fd,
      actorId: user.id,
      targetPolicyId,
    });
    const pdf = await renderPolicyPdf({
      companyName,
      title: shownTitle,
      version,
      blocks: parsePolicyText(body),
      savedAt: new Date(),
      cover,
      preview: true,
    });
    const fileName = `${shownTitle.replace(/[^a-zA-Z0-9 _-]+/g, "").trim() || "policy"} (preview).pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[policies] preview could not be drawn", { draftId: id, error: (e as Error).message });
    return NextResponse.json({ error: "The preview could not be drawn. Nothing was saved." }, { status: 500 });
  }
}
