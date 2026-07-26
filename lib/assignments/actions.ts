"use server";

/**
 * Be Care Compliant — assigning work, and completing it.
 *
 *   uploadPolicy / archivePolicy : the Admin keeps the policy library.
 *   assignItems                  : give a form or a policy to one person or many.
 *   cancelAssignment             : take it back.
 *   acknowledgePolicy            : a Team Member confirms they have read one. The
 *                                  tick is stored as Evidence through the normal
 *                                  pipeline, then the assignment closes.
 *   completeAssignedForm         : a Team Member completes an assigned form.
 *
 * The two completion paths both go through submitEvidence, so an assigned form is
 * Evidence exactly like a check completion: same validation, same immutability,
 * same branded PDF at export time. Nothing bespoke.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany, requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { getCompanyFormByKey } from "@/lib/people/data";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { storePolicyBytes, uploadPolicyDocument } from "@/lib/assignments/storage";
import { parsePolicyText, policyPlainText } from "@/lib/policies/text";
import { renderPolicyPdf } from "@/lib/policies/pdf";
import { POLICY_ACK_FORM_KEY, type BriefingScope } from "@/lib/assignments/types";
import { getEffectivePolicyRules } from "@/lib/assignments/data";
import { notifyBriefingSent } from "@/lib/notifications/briefings";
import {
  DRAWN_KEY,
  TYPED_KEY,
  signatureGiven,
  type ReassignMode,
  type SignatureMode,
} from "@/lib/assignments/signing";
import { dataUrlToPngBuffer } from "@/lib/evidence/storage";

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function collectFiles(formData: FormData): Promise<EvidenceFileInput[]> {
  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }
  return files;
}

/**
 * The two signing rules, read off an Add/Edit policy form (0137).
 *
 * Phil, 2026-07-26: these belong to the policy, not the company, because a
 * safeguarding policy and a dress code do not deserve the same ceremony. The
 * company row is still written, but only as the REMEMBERED DEFAULT for the next
 * policy somebody adds.
 */
function signingRulesFrom(formData: FormData): {
  signature_mode: SignatureMode;
  reassign_on_new_version: ReassignMode;
} {
  const sig = String(formData.get("signature_mode") ?? "");
  const re = String(formData.get("reassign_on_new_version") ?? "");
  return {
    signature_mode: (["draw", "type", "either"].includes(sig) ? sig : "either") as SignatureMode,
    reassign_on_new_version: (["always", "ask", "never"].includes(re)
      ? re
      : "always") as ReassignMode,
  };
}

/** Remember what they chose, so the next policy starts from it. */
async function rememberSigningDefaults(
  companyId: string,
  rules: { signature_mode: SignatureMode; reassign_on_new_version: ReassignMode },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("policy_config").upsert(
    {
      company_id: companyId,
      signature_mode: rules.signature_mode,
      reassign_on_new_version: rules.reassign_on_new_version,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) console.error("[policy] could not remember the signing defaults:", error.message);
}

/** Change how one policy is signed, after it was added. */
export async function updatePolicySigning(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const policyId = String(formData.get("policy_id") ?? "");
  if (!policyId) return { error: "Missing policy." };
  const rules = signingRulesFrom(formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_policies")
    .update({ ...rules, updated_at: new Date().toISOString() })
    .eq("id", policyId)
    .eq("company_id", profile.company_id)
    .select("id, title");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That policy could not be found." };

  await rememberSigningDefaults(profile.company_id, rules);
  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.signing_changed",
    entityType: "policy",
    entityId: policyId,
    summary: `Changed how "${data[0].title}" is signed`,
    metadata: rules,
  });

  revalidatePath("/settings/policies");
  return { ok: "Saved." };
}

/** Add a policy document to the company library. */
export async function uploadPolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the policy a title." };
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose the policy document to upload." };
  }
  // Server Actions accept a 4MB body in this app (next.config.ts), and the whole
  // request has to fit, so the document itself is capped below that. A bigger
  // policy needs a direct-to-storage upload, logged as a follow-on.
  if (file.size > 3 * 1024 * 1024) {
    return {
      error:
        "That document is over 3MB. Please upload a smaller file, or ask us to raise the limit.",
    };
  }

  const rules = signingRulesFrom(formData);
  const supabase = await createClient();

  // Insert first so the row id names the storage path, then attach the file.
  const { data: policy, error } = await supabase
    .from("company_policies")
    .insert({
      company_id: companyId,
      title,
      summary,
      signature_mode: rules.signature_mode,
      reassign_on_new_version: rules.reassign_on_new_version,
      storage_path: "pending",
      file_name: file.name,
      mime_type: file.type || null,
      bytes: file.size,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !policy) return { error: error?.message ?? "The policy could not be saved." };

  const up = await uploadPolicyDocument(companyId, policy.id as string, file);
  if (!up.ok) {
    await supabase.from("company_policies").delete().eq("id", policy.id);
    return { error: `The document could not be stored: ${up.error}` };
  }
  await supabase
    .from("company_policies")
    .update({ storage_path: up.path, updated_at: new Date().toISOString() })
    .eq("id", policy.id);

  // Version 1 of the document, kept for good so a signature against it can always
  // be evidenced with the exact wording (migration 0135).
  await supabase.from("company_policy_versions").insert({
    policy_id: policy.id,
    version: 1,
    storage_path: up.path,
    file_name: file.name,
    mime_type: file.type || null,
    bytes: file.size,
    created_by: user.id,
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.uploaded",
    entityType: "policy",
    entityId: policy.id as string,
    summary: `Added the policy "${title}"`,
    metadata: { file_name: file.name, bytes: file.size },
  });

  await rememberSigningDefaults(companyId, rules);
  revalidatePath("/settings/policies");
  return { ok: "Policy added." };
}

/** Retire a policy. Assignments already acknowledged keep their Evidence. */
export async function archivePolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const policyId = String(formData.get("policy_id") ?? "");
  if (!policyId) return { error: "Missing policy." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_policies")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", policyId)
    .eq("company_id", profile.company_id)
    .select("id, title");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That policy no longer exists." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.archived",
    entityType: "policy",
    entityId: policyId,
    summary: `Archived the policy "${data[0].title}"`,
  });

  revalidatePath("/settings/policies");
  return { ok: "Archived." };
}

/** Assign one form or policy to one or more people. */
export async function assignItems(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const target = String(formData.get("target") ?? "");
  const [kind, id] = target.split(":");
  if ((kind !== "form" && kind !== "policy") || !id) {
    return { error: "Choose what you are sending." };
  }
  const dueDate = isoOrNull(formData.get("due_date"));

  const supabase = await createClient();

  // The audience. "Everyone" and "a whole branch" are resolved HERE, not in the
  // browser, so the list cannot be tampered with and RLS still decides who is
  // reachable: a Branch Manager's "everyone" is their own branch, by definition.
  const scopeRaw = String(formData.get("scope") ?? "people");
  const scope: BriefingScope =
    scopeRaw === "company" || scopeRaw === "branch" ? scopeRaw : "people";
  const branchId = String(formData.get("branch_id") ?? "");
  let personIds: string[];

  if (scope === "company" || scope === "branch") {
    if (scope === "branch" && !branchId) return { error: "Choose a branch." };
    let q = supabase
      .from("people")
      .select("id")
      .eq("company_id", companyId)
      .neq("employment_status", "leaver")
      .is("archived_at", null);
    if (scope === "branch") q = q.eq("branch_id", branchId);
    const { data: audience, error: audienceError } = await q;
    if (audienceError) return { error: audienceError.message };
    personIds = ((audience ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (personIds.length === 0) {
      return {
        error:
          scope === "branch"
            ? "Nobody on the register is in that branch."
            : "There is nobody on your register to send this to.",
      };
    }
  } else {
    personIds = formData.getAll("person_ids").map(String).filter(Boolean);
    if (personIds.length === 0) return { error: "Choose at least one person." };
  }

  // A policy assignment names the version being signed.
  let policyVersion: number | null = null;
  if (kind === "policy") {
    const { data: pol } = await supabase
      .from("company_policies")
      .select("version")
      .eq("id", id)
      .maybeSingle();
    policyVersion = (pol?.version as number | null) ?? 1;
  }

  // Skip anyone who already has this open. The unique index that guarantees it is
  // PARTIAL (only where status = 'assigned'), which ON CONFLICT cannot infer, so
  // the duplicates are filtered here and the index stays as the backstop.
  const column = kind === "form" ? "form_id" : "policy_id";
  const { data: existing } = await supabase
    .from("assignments")
    .select("person_id")
    .eq("company_id", companyId)
    .eq("status", "assigned")
    .eq(column, id)
    .in("person_id", personIds);
  const alreadyHave = new Set(
    ((existing ?? []) as Array<{ person_id: string }>).map((r) => r.person_id),
  );
  const fresh = personIds.filter((personId) => !alreadyHave.has(personId));

  if (fresh.length === 0) {
    return { ok: "Everyone chosen had this already, so nothing was sent again." };
  }

  const { data, error } = await supabase
    .from("assignments")
    .insert(
      fresh.map((personId) => ({
        company_id: companyId,
        person_id: personId,
        kind,
        form_id: kind === "form" ? id : null,
        policy_id: kind === "policy" ? id : null,
        policy_version: policyVersion,
        due_date: dueDate,
        assigned_by: user.id,
      })),
    )
    .select("id, person_id");
  if (error) return { error: error.message };

  const created = data?.length ?? 0;

  // Tell them. Phil, 2026-07-26: a briefing used to appear silently, which meant
  // it was only ever seen by somebody who happened to log in. Best effort: a
  // failed email never undoes the briefing, it is reported back instead.
  const title =
    kind === "policy"
      ? ((
          await supabase.from("company_policies").select("title").eq("id", id).maybeSingle()
        ).data?.title as string | undefined) ?? "a policy"
      : ((await supabase.from("forms").select("name").eq("id", id).maybeSingle()).data?.name as
          | string
          | undefined) ?? "a form";
  const emailOutcome = await notifyBriefingSent({
    companyId,
    kind,
    title,
    dueDate: dueDate,
    assignments: ((data ?? []) as Array<{ id: string; person_id: string }>).map((r) => ({
      id: r.id,
      personId: r.person_id,
    })),
  });
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "assignment.created",
    entityType: "assignment",
    entityId: null,
    summary: `Sent a briefing (${kind}) to ${personIds.length} ${personIds.length === 1 ? "person" : "people"}`,
    metadata: {
      kind,
      target_id: id,
      scope,
      branch_id: scope === "branch" ? branchId : null,
      people: personIds.length,
      created,
      due_date: dueDate,
      emailed: emailOutcome.emailed,
      no_email: emailOutcome.noEmail,
      email_failed: emailOutcome.failed,
    },
  });

  revalidatePath("/briefings");

  const parts = [
    created === personIds.length
      ? `Sent to ${created} ${created === 1 ? "person" : "people"}.`
      : `Sent to ${created}. ${personIds.length - created} had it already.`,
  ];
  if (emailOutcome.emailed > 0) parts.push(`${emailOutcome.emailed} emailed.`);
  if (emailOutcome.noEmail > 0) {
    parts.push(
      `${emailOutcome.noEmail} ${emailOutcome.noEmail === 1 ? "has" : "have"} no email address, so ${emailOutcome.noEmail === 1 ? "they" : "they"} will only see it when they log in.`,
    );
  }
  if (emailOutcome.failed > 0) parts.push(`${emailOutcome.failed} could not be emailed.`);
  return { ok: parts.join(" ") };
}

/** Take an assignment back. */
export async function cancelAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) return { error: "Missing assignment." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "cancelled" })
    .eq("id", assignmentId)
    .eq("status", "assigned")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That assignment is already closed." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "assignment.cancelled",
    entityType: "assignment",
    entityId: assignmentId,
    summary: "Cancelled an assignment",
  });

  revalidatePath("/briefings");
  return { ok: "Cancelled." };
}

/**
 * A Team Member SIGNS a policy (Phil, 2026-07-26: "think docusign / adobe").
 *
 * The signature is drawn or typed, whichever the company allows, and it is stored
 * through the normal Evidence pipeline: a drawn signature becomes a PNG in the
 * private bucket with kind 'signature', so the frozen answers hold a reference
 * rather than a base64 blob. The policy TITLE and VERSION are stamped by the
 * server, never asked of the signer, so a signature can never name the wrong
 * wording. A certificate PDF is rendered on demand from this Evidence.
 */
export async function acknowledgePolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) return { error: "Missing assignment." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read your signature. Please try again." };
  }

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, company_id, person_id, policy_id, policy_version, status, company_policies:policy_id(title, version, file_name), people:person_id(full_name, branch_id)",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "That assignment could not be found." };
  if (assignment.status !== "assigned") return { error: "That is already signed." };

  const policy = (Array.isArray(assignment.company_policies)
    ? assignment.company_policies[0]
    : assignment.company_policies) as
    | { title: string; version: number; file_name: string }
    | null;
  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { full_name: string; branch_id: string | null } | null;

  // The rule that applies is THIS policy's, not the company's (0137).
  const rules = await getEffectivePolicyRules(
    assignment.company_id as string,
    assignment.policy_id as string,
  );
  const signed = signatureGiven(answers, rules.signature_mode as SignatureMode);
  if (!signed.ok) return { error: signed.error };
  if (answers["confirmed"] !== true) {
    return { error: "Tick the box to confirm you have read it." };
  }

  const form = await getCompanyFormByKey(assignment.company_id as string, POLICY_ACK_FORM_KEY);
  if (!form) {
    return { error: "The Policy Acknowledgement form is not available for your company yet." };
  }

  const signerName = person?.full_name ?? profile.full_name;
  const drawn = typeof answers[DRAWN_KEY] === "string" ? (answers[DRAWN_KEY] as string) : "";
  const typed = typeof answers[TYPED_KEY] === "string" ? (answers[TYPED_KEY] as string).trim() : "";

  // A drawn signature is a PNG, not a string in the record. Keep the answer as a
  // reference (same convention as a file upload) and hand the image to the
  // evidence pipeline, so it is stored, served signed and never inlined.
  const files: EvidenceFileInput[] = [];
  const png = drawn ? dataUrlToPngBuffer(drawn) : null;
  if (png) {
    files.push({
      fieldKey: DRAWN_KEY,
      kind: "signature",
      fileName: "signature.png",
      contentType: "image/png",
      bytes: png,
    });
  }

  const stamped: Answers = {
    ...answers,
    policy: policy?.title ?? "Policy",
    policy_version: String(assignment.policy_version ?? policy?.version ?? 1),
    name: signerName,
    read_date: new Date().toISOString().slice(0, 10),
    [DRAWN_KEY]: png ? "signature.png" : "",
    [TYPED_KEY]: typed,
  };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: person?.branch_id ?? null,
    answers: stamped,
    files,
    recordType: "person",
    recordId: assignment.person_id as string,
    evidenceId: randomUUID(),
  });
  if (!result.ok) return { error: result.error };

  const { error: rpcErr } = await supabase.rpc("complete_assignment", {
    p_assignment_id: assignmentId,
    p_evidence_id: result.evidenceId,
  });
  if (rpcErr) {
    return { error: `Your signature was saved, but the task did not close: ${rpcErr.message}` };
  }

  await writeAudit({
    companyId: assignment.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.signed",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Signed "${policy?.title ?? "a policy"}" version ${assignment.policy_version ?? policy?.version ?? 1}`,
    metadata: {
      evidence_id: result.evidenceId,
      policy_id: assignment.policy_id,
      policy_version: assignment.policy_version ?? policy?.version ?? 1,
      signature: png ? "drawn" : "typed",
    },
  });

  revalidatePath("/my");
  return { ok: "Signed, thank you. Your certificate is on your record." };
}

/** Change how this company signs policies. */
/**
 * Upload a NEW VERSION of an existing policy.
 *
 * The old document is kept, because a signature against version 1 has to remain
 * evidenced by the version 1 wording. What happens to the people who signed the
 * old one is the company's choice (policy_config.reassign_on_new_version).
 */
/**
 * A policy WRITTEN OR PASTED into Be Care Compliant rather than uploaded.
 *
 * Phil, 2026-07-26: "what about if people want to copy and paste their policy".
 * Most care policies live in Word, and making a registered manager export a PDF
 * before they can issue anything is a tax on the busiest person in the building.
 *
 * The text is kept AND frozen into a real PDF here and now, so a signature still
 * names a reproducible document. The reader gets the text as a proper web page,
 * which is far kinder on a phone than a PDF; the PDF is the record.
 */
export async function createWrittenPolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the policy a title." };
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 40) {
    return { error: "Paste the policy wording in, or upload it as a document instead." };
  }
  if (body.length > 400_000) {
    return { error: "That is longer than we can store as text. Please upload it as a document." };
  }

  const writtenRules = signingRulesFrom(formData);
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const { data: policy, error } = await supabase
    .from("company_policies")
    .insert({
      company_id: companyId,
      title,
      summary,
      source: "text",
      body,
      signature_mode: writtenRules.signature_mode,
      reassign_on_new_version: writtenRules.reassign_on_new_version,
      storage_path: "pending",
      file_name: `${title.replace(/[^a-zA-Z0-9 _-]+/g, "").trim() || "policy"}.pdf`,
      mime_type: "application/pdf",
      bytes: 0,
      created_by: user.id,
    })
    .select("id, file_name")
    .single();
  if (error || !policy) return { error: error?.message ?? "The policy could not be saved." };

  const stored = await freezeWrittenVersion({
    companyId,
    companyName: (company?.name as string | null) ?? "Your company",
    policyId: policy.id as string,
    policyKey: policy.id as string,
    fileName: policy.file_name as string,
    title,
    version: 1,
    body,
    actorId: user.id,
  });
  if (!stored.ok) {
    await supabase.from("company_policies").delete().eq("id", policy.id);
    return { error: stored.error };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.written",
    entityType: "policy",
    entityId: policy.id as string,
    summary: `Wrote the policy "${title}"`,
    metadata: { characters: body.length },
  });

  await rememberSigningDefaults(companyId, writtenRules);
  revalidatePath("/settings/policies");
  return { ok: "Policy saved." };
}

/** Edit the wording of a written policy. Every edit is a NEW VERSION, never an
 *  overwrite: the wording somebody already signed can never change under them. */
export async function updateWrittenPolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  const policyId = String(formData.get("policy_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!policyId) return { error: "Missing policy." };
  if (body.length < 40) return { error: "The wording looks too short to save." };

  const supabase = await createClient();
  const [{ data: policy }, { data: company }] = await Promise.all([
    supabase
      .from("company_policies")
      .select("id, title, version, source, body, file_name")
      .eq("id", policyId)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
  ]);
  if (!policy) return { error: "That policy could not be found." };
  if (policy.source !== "text") {
    return { error: "That policy is an uploaded document. Upload a new version instead." };
  }
  if ((policy.body as string | null)?.trim() === body) {
    return { ok: "Nothing had changed, so no new version was created." };
  }

  const nextVersion = ((policy.version as number | null) ?? 1) + 1;
  const stored = await freezeWrittenVersion({
    companyId,
    companyName: (company?.name as string | null) ?? "Your company",
    policyId,
    policyKey: `${policyId}/v${nextVersion}`,
    fileName: policy.file_name as string,
    title: policy.title as string,
    version: nextVersion,
    body,
    actorId: user.id,
  });
  if (!stored.ok) return { error: stored.error };

  // Who has to sign it again is THIS policy's rule (0137). Same for an uploaded
  // version, so a written policy behaves identically.
  const rules = await getEffectivePolicyRules(companyId, policyId);
  let reassigned = 0;
  if ((rules.reassign_on_new_version as ReassignMode) === "always") {
    reassigned = await reassignPolicy(policyId, companyId, nextVersion, user.id);
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.version_added",
    entityType: "policy",
    entityId: policyId,
    summary: `Edited "${policy.title}" to version ${nextVersion}`,
    metadata: { version: nextVersion, source: "text", reassigned },
  });

  revalidatePath("/settings/policies");
  revalidatePath("/briefings");
  return {
    ok:
      reassigned > 0
        ? `Version ${nextVersion} saved. ${reassigned} ${reassigned === 1 ? "person needs" : "people need"} to sign it.`
        : `Version ${nextVersion} saved.`,
  };
}

/**
 * Freeze one version of a written policy: render the PDF, store it, record the
 * version row (text AND file), and point the policy at it. Shared by create and
 * edit so the two can never drift.
 */
async function freezeWrittenVersion(opts: {
  companyId: string;
  companyName: string;
  policyId: string;
  /** Path key: the policy id for v1, id/vN afterwards, so nothing is overwritten. */
  policyKey: string;
  fileName: string;
  title: string;
  version: number;
  body: string;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const blocks = parsePolicyText(opts.body);
  if (policyPlainText(blocks).length === 0) {
    return { ok: false, error: "There was no readable wording to save." };
  }

  let pdf: Buffer;
  try {
    pdf = await renderPolicyPdf({
      companyName: opts.companyName,
      title: opts.title,
      version: opts.version,
      blocks,
      savedAt: new Date(),
    });
  } catch (e) {
    return { ok: false, error: `The policy PDF could not be produced: ${(e as Error).message}` };
  }

  const stored = await storePolicyBytes(opts.companyId, opts.policyKey, opts.fileName, pdf);
  if (!stored.ok) return { ok: false, error: `The policy could not be stored: ${stored.error}` };

  const supabase = await createClient();
  const { error: verErr } = await supabase.from("company_policy_versions").insert({
    policy_id: opts.policyId,
    version: opts.version,
    storage_path: stored.path,
    file_name: opts.fileName,
    mime_type: "application/pdf",
    bytes: pdf.length,
    body: opts.body,
    created_by: opts.actorId,
  });
  if (verErr) return { ok: false, error: `The version could not be recorded: ${verErr.message}` };

  const { error: polErr } = await supabase
    .from("company_policies")
    .update({
      version: opts.version,
      body: opts.body,
      storage_path: stored.path,
      file_name: opts.fileName,
      mime_type: "application/pdf",
      bytes: pdf.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.policyId);
  if (polErr) return { ok: false, error: polErr.message };
  return { ok: true };
}

export async function uploadPolicyVersion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  const policyId = String(formData.get("policy_id") ?? "");
  if (!policyId) return { error: "Missing policy." };

  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose the new version of the document." };
  }
  if (file.size > 3 * 1024 * 1024) {
    return { error: "That document is over 3MB. Please upload a smaller file." };
  }

  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("company_policies")
    .select("id, title, version")
    .eq("id", policyId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!policy) return { error: "That policy could not be found." };

  const nextVersion = ((policy.version as number | null) ?? 1) + 1;
  const up = await uploadPolicyDocument(companyId, `${policyId}/v${nextVersion}`, file);
  if (!up.ok) return { error: `The document could not be stored: ${up.error}` };

  const { error: verErr } = await supabase.from("company_policy_versions").insert({
    policy_id: policyId,
    version: nextVersion,
    storage_path: up.path,
    file_name: file.name,
    mime_type: file.type || null,
    bytes: file.size,
    created_by: user.id,
  });
  if (verErr) return { error: `The version could not be recorded: ${verErr.message}` };

  await supabase
    .from("company_policies")
    .update({
      version: nextVersion,
      storage_path: up.path,
      file_name: file.name,
      mime_type: file.type || null,
      bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", policyId);

  // Who has to sign it again is THIS policy's rule (0137).
  const rules = await getEffectivePolicyRules(companyId, policyId);
  let reassigned = 0;
  if ((rules.reassign_on_new_version as ReassignMode) === "always") {
    reassigned = await reassignPolicy(policyId, companyId, nextVersion, user.id);
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.version_added",
    entityType: "policy",
    entityId: policyId,
    summary: `Uploaded version ${nextVersion} of "${policy.title}"`,
    metadata: { version: nextVersion, file_name: file.name, reassigned },
  });

  revalidatePath("/settings/policies");
  revalidatePath("/briefings");
  return {
    ok:
      reassigned > 0
        ? `Version ${nextVersion} saved. ${reassigned} ${reassigned === 1 ? "person needs" : "people need"} to sign it.`
        : `Version ${nextVersion} saved.`,
  };
}

/** Ask everyone who has ever been given this policy to sign the new version. */
async function reassignPolicy(
  policyId: string,
  companyId: string,
  version: number,
  actorId: string,
): Promise<number> {
  const supabase = await createClient();

  // Everyone who has held it before, plus anyone still holding an open one.
  const { data: previous } = await supabase
    .from("assignments")
    .select("person_id, status, due_date")
    .eq("policy_id", policyId)
    .neq("status", "cancelled");
  const people = [
    ...new Set(((previous ?? []) as Array<{ person_id: string }>).map((r) => r.person_id)),
  ];
  if (people.length === 0) return 0;

  // Close any still-open assignment for the old wording: signing the superseded
  // version would prove nothing, so it is replaced rather than left hanging.
  await supabase
    .from("assignments")
    .update({ status: "cancelled" })
    .eq("policy_id", policyId)
    .eq("status", "assigned");

  const { data: created } = await supabase
    .from("assignments")
    .insert(
      people.map((personId) => ({
        company_id: companyId,
        person_id: personId,
        kind: "policy",
        policy_id: policyId,
        policy_version: version,
        assigned_by: actorId,
      })),
    )
    .select("id");
  return created?.length ?? 0;
}

/** A Team Member completes a form that was assigned to them. */
export async function completeAssignedForm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) return { error: "Missing assignment." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read your answers." };
  }

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, company_id, person_id, form_id, status, people:person_id(branch_id)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "That assignment could not be found." };
  if (assignment.status !== "assigned") return { error: "That is already done." };

  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { branch_id: string | null } | null;

  // Pin the form's currently published version.
  const { data: version } = await supabase
    .from("form_versions")
    .select("id")
    .eq("form_id", assignment.form_id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { error: "That form is not published, so it cannot be completed." };

  const result = await submitEvidence({
    formVersionId: version.id as string,
    branchId: person?.branch_id ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: assignment.person_id as string,
  });
  if (!result.ok) return { error: result.error };

  const { error: rpcErr } = await supabase.rpc("complete_assignment", {
    p_assignment_id: assignmentId,
    p_evidence_id: result.evidenceId,
  });
  if (rpcErr) {
    return { error: `Your form was saved, but the task did not close: ${rpcErr.message}` };
  }

  await writeAudit({
    companyId: assignment.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "assignment.completed",
    entityType: "assignment",
    entityId: assignmentId,
    summary: "Completed an assigned form",
    metadata: { evidence_id: result.evidenceId },
  });

  revalidatePath("/my");
  return { ok: "Sent, thank you." };
}
