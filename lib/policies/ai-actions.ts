"use server";

/**
 * Be Care Compliant: the AI policy writer and improver (Phil, 2026-10-06).
 *
 *   generatePolicyDraft  pick a standard policy, answer a few questions, get a draft written ONLY
 *                        from the approved guidance library, every requirement cited.
 *   reviewPolicyWithAi   check an existing policy (written, uploaded PDF, or pasted) against the
 *                        same library: what is missing or out of date, and a redraft section by
 *                        section.
 *   approvePolicyDraft   the edited draft, or the chosen sections, become a policy or the next
 *                        version of one, through the same create and version paths as a written
 *                        policy, so signing, reassigning and the review date all behave the same.
 *
 * Only people who may write the company's policies (requirePolicyWriter, 0399). Each AI call
 * spends AI credits (lib/policies/credits) and is metered (runAi). Nothing here is silent: every failure is a sentence.
 */

import { revalidatePath } from "next/cache";
import { requirePolicyWriter } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { runAi } from "@/lib/ai/anthropic";
import { POLICY_IMPROVE_CREDITS, POLICY_WRITE_CREDITS } from "@/lib/policies/credits";
import { fillPlaceholders, findPlaceholders } from "@/lib/policies/placeholders";
import { coverFromForm } from "@/lib/policies/cover";
import { docxToText } from "@/lib/policies/docx";
import { signPolicyDocument } from "@/lib/assignments/storage";
import { createWrittenPolicy, updateWrittenPolicy } from "@/lib/assignments/actions";
import type { ActionState } from "@/lib/forms";
import { listPolicyOwners, companySystemSettings, companyFacts, getDraft, getTopic, promptSources } from "./data";
import {
  improvePrompt,
  improveSystemPrompt,
  joinSections,
  nationOf,
  parseImproveReview,
  sourcesSection,
  writePrompt,
  writeSystemPrompt,
  type ImproveReview,
} from "./ai-prompt";

/* England and Wales are different law (Phil, 2026-10-06): a policy is only ever written for the
   nation the company's regulator says, so with no regulator there is nothing safe to write. */
const NO_REGULATOR =
  "Your company's regulator is not set, so we cannot tell whether to write for Wales (CIW) or England (CQC). Ask Be Care Compliant support to set it.";

const NO_LIBRARY =
  "The guidance library for this policy has not been loaded yet, so the AI has nothing checked to write from. Ask Be Care Compliant support.";

export async function generatePolicyDraft(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requirePolicyWriter();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  const topic = await getTopic(String(fd.get("topic_key") ?? ""));
  if (!topic) return { error: "Choose which policy to write." };

  const facts = await companyFacts(companyId);
  if (!facts.regulator) return { error: NO_REGULATOR };
  const sources = await promptSources(topic, facts.regulator);
  if (sources.length === 0) return { error: NO_LIBRARY };

  const settings = await companySystemSettings(companyId, topic.key);
  /* The owner (Phil, 2026-10-06): asked here, named in the policy, set on it when approved. */
  const ownerId = String(fd.get("owner_id") ?? "").trim();
  if (!ownerId) return { error: "Choose who owns this policy." };
  const owners = await listPolicyOwners(companyId);
  const owner = owners.find((o) => o.id === ownerId);
  if (!owner) return { error: "That person cannot own a policy in your company." };
  const answers = topic.questions.map((q) => ({ question: q.label, answer: String(fd.get(`q_${q.key}`) ?? "").trim() }));
  answers.push({ question: "Who owns this policy and keeps it up to date?", answer: owner.full_name ?? "" });
  const notes = String(fd.get("notes") ?? "").slice(0, 3000);
  const title = String(fd.get("title") ?? "").trim() || topic.title;

  const r = await runAi({
    companyId,
    feature: "policy_write",
    maxTokens: 9000,
    credits: POLICY_WRITE_CREDITS,
    system: writeSystemPrompt(nationOf(facts.regulator).label),
    prompt: writePrompt({ topicTitle: title, topicSummary: topic.summary, facts, answers, notes, sources, settings }),
  });
  if ("error" in r) return { error: r.error };

  const meta = sources.map(({ n, title: t, publisher, url, checkedOn }) => ({ n, title: t, publisher, url, checkedOn }));
  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("policy_drafts")
    .insert({
      company_id: companyId,
      topic_key: topic.key,
      kind: "write",
      title,
      nation: facts.regulator,
      answers: Object.fromEntries(topic.questions.map((q, i) => [q.key, answers[i].answer])),
      owner_id: ownerId,
      cover: coverFromForm((k) => fd.get(k)),
      draft_text: r.ok.trim(),
      sources: meta,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !draft) return { error: error?.message ?? "The draft could not be saved." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.ai_drafted",
    entityType: "policy_draft",
    entityId: draft.id as string,
    summary: `AI drafted the "${title}" policy from ${sources.length} sources`,
    metadata: { topic: topic.key, sources: sources.length },
  });
  revalidatePath("/policies");
  return { ok: "Drafted.", redirectTo: `/policies/drafts/${draft.id}` };
}

export async function reviewPolicyWithAi(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requirePolicyWriter();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  const topic = await getTopic(String(fd.get("topic_key") ?? ""));
  if (!topic) return { error: "Choose which standard policy this is, so it can be checked against the right guidance." };

  const policyId = String(fd.get("policy_id") ?? "").trim() || null;
  const pasted = String(fd.get("pasted") ?? "").trim();
  const supabase = await createClient();
  let policyText: string | null = null;
  let attachments: unknown[] | undefined;
  let title = topic.title;

  if (policyId) {
    const { data: p } = await supabase
      .from("company_policies")
      .select("id, title, source, body, storage_path")
      .eq("id", policyId)
      .eq("company_id", companyId)
      .maybeSingle<{ id: string; title: string; source: string; body: string | null; storage_path: string | null }>();
    if (!p) return { error: "That policy could not be found." };
    title = p.title;
    if (p.source === "text" && p.body) {
      policyText = p.body;
    } else if (p.storage_path) {
      const signed = await signPolicyDocument({
        companyId,
        policyId: p.id,
        path: p.storage_path,
        actor: { id: profile.id, email: profile.email, role: profile.role },
      });
      if (!signed.ok) return { error: signed.error };
      const res = await fetch(signed.url);
      if (!res.ok) return { error: "The policy document could not be read." };
      const bytes = Buffer.from(await res.arrayBuffer());
      attachments = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }];
    } else {
      return { error: "That policy has no wording or document to check." };
    }
  } else if (fd.get("document") instanceof File && (fd.get("document") as File).size > 0) {
    /* A policy that is not in Be Care Compliant yet, uploaded just to be checked: a PDF, or a
       Word document (Phil, 2026-10-06) read as text. Capped like every other upload (Server
       Actions take 4MB). */
    const file = fd.get("document") as File;
    const name = file.name.toLowerCase();
    if (file.size > 3 * 1024 * 1024) return { error: "That file is over 3MB. Paste the wording in instead." };
    if (name.endsWith(".docx")) {
      const text = docxToText(new Uint8Array(await file.arrayBuffer()));
      if (!text || text.length < 200) {
        return { error: "We could not read the wording in that Word document. Save it as a PDF, or paste the wording in instead." };
      }
      policyText = text.slice(0, 120_000);
      title = file.name.replace(/\.docx$/i, "") || topic.title;
    } else if (name.endsWith(".doc")) {
      return { error: "That is an older Word file (.doc). Open it in Word and save it as .docx or PDF, or paste the wording in." };
    } else if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      title = file.name.replace(/\.pdf$/i, "") || topic.title;
      const bytes = Buffer.from(await file.arrayBuffer());
      attachments = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }];
    } else {
      return { error: "Upload the policy as a PDF or a Word document (.docx), or paste the wording in instead." };
    }
  } else if (pasted.length >= 200) {
    policyText = pasted.slice(0, 120_000);
  } else {
    return { error: "Choose one of your policies, upload one, or paste the policy wording in." };
  }

  const facts = await companyFacts(companyId);
  if (!facts.regulator) return { error: NO_REGULATOR };
  const sources = await promptSources(topic, facts.regulator);
  if (sources.length === 0) return { error: NO_LIBRARY };

  const r = await runAi({
    companyId,
    feature: "policy_improve",
    maxTokens: 12000,
    credits: POLICY_IMPROVE_CREDITS,
    attachments,
    system: improveSystemPrompt(nationOf(facts.regulator).label),
    prompt: improvePrompt({ topicTitle: title, facts, policyText, sources, settings: await companySystemSettings(companyId, topic.key) }),
  });
  if ("error" in r) return { error: r.error };
  const review = parseImproveReview(r.ok);
  if (!review) return { error: "The AI's review could not be read. Your credit was used; please try again." };

  const meta = sources.map(({ n, title: t, publisher, url, checkedOn }) => ({ n, title: t, publisher, url, checkedOn }));
  const { data: draft, error } = await supabase
    .from("policy_drafts")
    .insert({
      company_id: companyId,
      topic_key: topic.key,
      kind: "improve",
      policy_id: policyId,
      nation: facts.regulator,
      title,
      input_text: policyText,
      review,
      sources: meta,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !draft) return { error: error?.message ?? "The review could not be saved." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.ai_reviewed",
    entityType: "policy_draft",
    entityId: draft.id as string,
    summary: `AI reviewed "${title}": ${review.gaps.length} gaps found`,
    metadata: { topic: topic.key, policy_id: policyId, gaps: review.gaps.length },
  });
  revalidatePath("/policies");
  return { ok: "Reviewed.", redirectTo: `/policies/drafts/${draft.id}` };
}

export async function approvePolicyDraft(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requirePolicyWriter();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  const draft = await getDraft(String(fd.get("draft_id") ?? ""), companyId);
  if (!draft) return { error: "That draft could not be found." };
  if (draft.status !== "draft") return { error: "That draft has already been dealt with." };

  const title = String(fd.get("title") ?? "").trim() || draft.title;
  /* The "To be completed" fields under the policy (Phil, 2026-10-06), put into the wording. */
  const fills: Record<string, string> = {};
  for (let i = 0; fd.has(`fill_prompt_${i}`); i++) {
    fills[String(fd.get(`fill_prompt_${i}`))] = String(fd.get(`fill_${i}`) ?? "");
  }
  let wording: string;
  if (draft.kind === "write") {
    wording = fillPlaceholders(String(fd.get("body") ?? "").trim(), fills);
  } else {
    const review = draft.review as ImproveReview;
    const chosen = review.sections.map((s, i) => {
      const use = String(fd.get(`use_${i}`) ?? "proposed");
      const text = use === "original" ? s.original : String(fd.get(`text_${i}`) ?? s.proposed);
      return { heading: s.heading, text: fillPlaceholders(text, fills) };
    });
    wording = joinSections(title, chosen);
  }
  if (wording.length < 200) return { error: "The policy wording is too short to save." };
  const left = findPlaceholders(wording);
  if (left.length > 0) {
    return {
      error: `${left.length === 1 ? "One thing is" : `${left.length} things are`} still to be completed: ${left.join("; ")}. Fill ${left.length === 1 ? "it" : "them"} in under the policy, then save.`,
    };
  }
  const body = `${wording}\n\n${sourcesSection(draft.sources, wording)}`;

  /* Where it goes: the policy it was improved from, a chosen existing policy, or a new one. */
  const target = String(fd.get("target") ?? (draft.policy_id ? draft.policy_id : "new"));
  const form = new FormData();
  form.set("body", body);
  /* The cover page and owner go with the policy, so the very first PDF prints them (0404). */
  for (const k of ["cover_present", "approver_id", "applies_to", "read_by", "retention", "classification", "owner_id", "reference", "change_summary"]) {
    const v = fd.get(k);
    if (typeof v === "string") form.set(k, v);
  }
  let result: ActionState;
  let policyId: string | null = null;
  if (target && target !== "new") {
    form.set("policy_id", target);
    form.set("convert_to_text", "1");
    result = await updateWrittenPolicy({}, form);
    policyId = target;
  } else {
    form.set("title", title);
    form.set("topic_key", draft.topic_key);
    result = await createWrittenPolicy({}, form);
  }
  if (result.error) return { error: result.error };

  const supabase = await createClient();
  if (!policyId) {
    const { data: made } = await supabase
      .from("company_policies")
      .select("id")
      .eq("company_id", companyId)
      .eq("topic_key", draft.topic_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    policyId = made?.id ?? null;
  } else {
    await supabase.from("company_policies").update({ topic_key: draft.topic_key }).eq("id", policyId).is("topic_key", null);
  }
  /* The owner chosen on the draft goes onto the policy. */
  const ownerId = String(fd.get("owner_id") ?? "").trim();
  if (policyId && ownerId && (await listPolicyOwners(companyId)).some((o) => o.id === ownerId)) {
    await supabase.from("company_policies").update({ owner_id: ownerId }).eq("id", policyId).eq("company_id", companyId);
  }
  await supabase
    .from("policy_drafts")
    .update({ status: "approved", approved_policy_id: policyId, updated_at: new Date().toISOString() })
    .eq("id", draft.id);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.ai_approved",
    entityType: "policy_draft",
    entityId: draft.id,
    summary: `Approved the AI ${draft.kind === "write" ? "draft" : "review"} of "${title}"`,
    metadata: { policy_id: policyId, kind: draft.kind },
  });
  revalidatePath("/policies");
  return { ok: result.ok ?? "Saved.", redirectTo: "/policies" };
}

export async function discardPolicyDraft(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requirePolicyWriter();
  if (!profile.company_id) return { error: "No company context." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("policy_drafts")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", String(fd.get("draft_id") ?? ""))
    .eq("company_id", profile.company_id);
  if (error) return { error: error.message };
  revalidatePath("/policies");
  return { ok: "Discarded.", redirectTo: "/policies" };
}

/** Say which standard policy an existing policy is, so the checklist counts it. */
export async function setPolicyTopic(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requirePolicyWriter();
  if (!profile.company_id) return { error: "No company context." };
  const topic = String(fd.get("topic_key") ?? "").trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_policies")
    .update({ topic_key: topic })
    .eq("id", String(fd.get("policy_id") ?? ""))
    .eq("company_id", profile.company_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That policy could not be changed." };
  revalidatePath("/policies");
  return { ok: "Saved." };
}

/** Reviewed and nothing needed changing: the review date moves on, the version does not. */
export async function markPolicyReviewed(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requirePolicyWriter();
  if (!profile.company_id) return { error: "No company context." };
  const supabase = await createClient();
  const id = String(fd.get("policy_id") ?? "");
  const { data: p } = await supabase
    .from("company_policies")
    .select("id, title, review_months")
    .eq("id", id)
    .eq("company_id", profile.company_id)
    .maybeSingle<{ id: string; title: string; review_months: number }>();
  if (!p) return { error: "That policy could not be found." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const due = new Date(Date.UTC(y, m - 1 + (p.review_months || 12), 1));
  const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
  due.setUTCDate(Math.min(d, lastDay));
  const { error } = await supabase
    .from("company_policies")
    .update({
      last_reviewed_on: today,
      review_due_on: due.toISOString().slice(0, 10),
      guidance_changed_at: null,
      guidance_change_note: null,
    })
    .eq("id", p.id);
  if (error) return { error: error.message };
  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.reviewed",
    entityType: "policy",
    entityId: p.id,
    summary: `Reviewed "${p.title}" with no changes`,
  });
  revalidatePath("/policies");
  return { ok: "Marked as reviewed." };
}

/** Who is responsible for a policy (2026-10-06). Empty clears it. */
export async function setPolicyOwner(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requirePolicyWriter();
  if (!profile.company_id) return { error: "No company context." };
  const owner = String(fd.get("owner_id") ?? "").trim() || null;
  const supabase = await createClient();
  if (owner) {
    const { data: who } = await supabase.from("profiles").select("id").eq("id", owner).eq("company_id", profile.company_id).maybeSingle();
    if (!who) return { error: "That person is not in your company." };
  }
  const { data, error } = await supabase
    .from("company_policies")
    .update({ owner_id: owner })
    .eq("id", String(fd.get("policy_id") ?? ""))
    .eq("company_id", profile.company_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That policy could not be changed." };
  revalidatePath("/policies");
  return { ok: "Saved." };
}
