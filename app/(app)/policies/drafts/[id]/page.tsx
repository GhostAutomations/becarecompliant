import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePolicyWriter } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import DraftEditor from "@/components/policies/draft-editor";
import { getDraft, listPolicyOwners } from "@/lib/policies/data";
import { createClient } from "@/lib/supabase/server";
import type { ImproveReview } from "@/lib/policies/ai-prompt";

export const metadata: Metadata = { title: "Policy draft" };

export default async function PolicyDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requirePolicyWriter();
  const { id } = await params;
  const draft = await getDraft(id, profile.company_id as string);
  if (!draft) notFound();
  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("company_policies")
    .select("id, title, topic_key")
    .eq("company_id", profile.company_id as string)
    .eq("status", "active")
    .order("title");
  const existing = (mine as Array<{ id: string; title: string; topic_key: string | null }> | null) ?? [];
  const owners = await listPolicyOwners(profile.company_id as string);
  const sameTopic = existing.find((p) => p.topic_key === draft.topic_key) ?? null;

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/policies" label="Back to Policies" />
      <div>
        <h1 className="page-title">{draft.kind === "write" ? "Your AI draft" : "Your policy, reviewed"}: {draft.title}</h1>
        <p className="page-subtitle">
          {draft.status !== "draft"
            ? `This ${draft.kind === "write" ? "draft" : "review"} has already been ${draft.status}.`
            : draft.kind === "write"
              ? "Read it through, answer anything listed under To be completed, then approve it. Nobody sees it until you do."
              : "Here is what is missing or out of date, and suggested wording for each section. Choose what to keep, then approve."}
        </p>
        {draft.nation ? (
          <p className="mt-2">
            <span className="pill pill-neutral">
              Written for {draft.nation === "ciw" ? "Wales (Care Inspectorate Wales)" : "England (CQC)"}
            </span>
          </p>
        ) : null}
        <p className="form-hint">
          AI drafts are a starting point written from official guidance, not legal advice. The registered manager or
          responsible individual should check it fits how your service really works before approving.
        </p>
      </div>
      {draft.status === "draft" ? (
        <DraftEditor
          draft={{
            id: draft.id,
            kind: draft.kind,
            title: draft.title,
            draft_text: draft.draft_text,
            review: (draft.review as ImproveReview | null) ?? null,
            policy_id: draft.policy_id,
            sources: draft.sources,
            owner_id: draft.owner_id,
            cover: draft.cover,
          }}
          existing={existing.map(({ id: pid, title }) => ({ id: pid, title }))}
          sameTopic={sameTopic ? { id: sameTopic.id, title: sameTopic.title } : null}
          owners={owners}
        />
      ) : null}
    </div>
  );
}
