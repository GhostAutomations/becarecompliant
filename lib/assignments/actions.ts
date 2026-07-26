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
import { uploadPolicyDocument } from "@/lib/assignments/storage";
import { POLICY_ACK_FORM_KEY } from "@/lib/assignments/types";

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

  const supabase = await createClient();

  // Insert first so the row id names the storage path, then attach the file.
  const { data: policy, error } = await supabase
    .from("company_policies")
    .insert({
      company_id: companyId,
      title,
      summary,
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
    return { error: "Choose what to assign." };
  }
  const personIds = formData.getAll("person_ids").map(String).filter(Boolean);
  if (personIds.length === 0) return { error: "Choose at least one person." };
  const dueDate = isoOrNull(formData.get("due_date"));

  const supabase = await createClient();

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
    return { ok: "They all had this already." };
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
        due_date: dueDate,
        assigned_by: user.id,
      })),
    )
    .select("id");
  if (error) return { error: error.message };

  const created = data?.length ?? 0;
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "assignment.created",
    entityType: "assignment",
    entityId: null,
    summary: `Assigned a ${kind} to ${personIds.length} ${personIds.length === 1 ? "person" : "people"}`,
    metadata: { kind, target_id: id, people: personIds.length, created, due_date: dueDate },
  });

  revalidatePath("/people/assignments");
  return {
    ok:
      created === personIds.length
        ? `Assigned to ${created} ${created === 1 ? "person" : "people"}.`
        : `Assigned. ${personIds.length - created} already had it.`,
  };
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

  revalidatePath("/people/assignments");
  return { ok: "Cancelled." };
}

/**
 * A Team Member confirms they have read a policy. The confirmation is written
 * through the seeded Policy Acknowledgement form, so it is real Evidence with a
 * timestamp and a frozen schema, not a boolean on a row.
 */
export async function acknowledgePolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) return { error: "Missing assignment." };
  if (String(formData.get("confirmed") ?? "") !== "on") {
    return { error: "Tick the box to confirm you have read it." };
  }

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, company_id, person_id, policy_id, status, company_policies:policy_id(title, version), people:person_id(full_name, branch_id)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "That assignment could not be found." };
  if (assignment.status !== "assigned") return { error: "That is already done." };

  const policy = (Array.isArray(assignment.company_policies)
    ? assignment.company_policies[0]
    : assignment.company_policies) as { title: string; version: number } | null;
  const person = (Array.isArray(assignment.people)
    ? assignment.people[0]
    : assignment.people) as { full_name: string; branch_id: string | null } | null;

  const form = await getCompanyFormByKey(assignment.company_id as string, POLICY_ACK_FORM_KEY);
  if (!form) {
    return { error: "The Policy Acknowledgement form is not available for your company yet." };
  }

  const answers: Answers = {
    policy: policy?.title ?? "Policy",
    policy_version: String(policy?.version ?? 1),
    name: person?.full_name ?? profile.full_name,
    read_date: new Date().toISOString().slice(0, 10),
    confirmed: true,
  };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: person?.branch_id ?? null,
    answers,
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
    return { error: `Your confirmation was saved, but the task did not close: ${rpcErr.message}` };
  }

  await writeAudit({
    companyId: assignment.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy.acknowledged",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Confirmed reading "${policy?.title ?? "a policy"}"`,
    metadata: { evidence_id: result.evidenceId, policy_id: assignment.policy_id },
  });

  revalidatePath("/my");
  return { ok: "Thank you, that is recorded." };
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
