"use server";

/**
 * Be Care Compliant — completing a Check by uploading the paper copy (DEF-056). Admins only.
 *
 * TWO STEPS, because of how big a scan is. A server action body is capped at 4 MB here and
 * Vercel stops any request at 4.5 MB, and one phone photo of a page can be more than that. So:
 *
 *   1. startPaperUpload checks the caller may do this, checks the files they have picked, and
 *      hands back one single use signed upload URL per page, inside a folder named for the
 *      Evidence that is about to exist. The browser puts each page straight into the private
 *      bucket. Nothing is public at any point.
 *   2. finishPaperUpload reads each page back out of the bucket (so the size, type and
 *      fingerprint stored are the file's, not what the browser claimed), files the Evidence
 *      through submit_paper_evidence, which refuses anybody who is not a Company Admin, and then
 *      moves the Check on with the SAME code a Form completed on screen uses.
 *
 * An upload started and never finished is removed by the nightly retention run
 * (lib/evidence/paper-cleanup.ts).
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { closeBookingsForCheck } from "@/lib/planner/close-booking";
import { advancePersonCheck } from "@/lib/people/advance-check";
import { advanceServiceUserCheck, serviceUserNextDue } from "@/lib/service-users/advance-check";
import type { CheckDefinition } from "@/lib/people/types";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { EVIDENCE_BUCKET, evidenceFilePath, sha256Hex } from "./storage";
import {
  PAPER_MAX_BYTES,
  paperDateProblem,
  paperFieldKey,
  paperFileProblem,
  paperFilesProblem,
  paperMovesCheck,
  paperOffered,
  paperPathPrefix,
} from "./paper";

type InstanceRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  person_id: string | null;
  service_user_id: string | null;
  last_completed_on: string | null;
  definition: CheckDefinition | null;
};

async function loadInstance(instanceId: string): Promise<InstanceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_instances")
    .select("id, company_id, branch_id, person_id, service_user_id, last_completed_on, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();
  return (data as unknown as InstanceRow | null) ?? null;
}

/** Why this caller may not upload a paper copy of this Check, or null when they may. */
async function refusal(instanceId: string): Promise<{ error: string } | { instance: InstanceRow; def: CheckDefinition; profile: Awaited<ReturnType<typeof requireCompany>>["profile"]; userId: string }> {
  const { user, profile } = await requireCompany();
  const instance = await loadInstance(instanceId);
  const def = instance?.definition ?? null;
  if (!instance || !def) return { error: "That check could not be found." };
  if (!def.form_id) return { error: "This check has no form." };
  const offered = paperOffered({
    role: profile.role,
    supportMode: !!profile.actingAsCompanyId,
    population: instance.person_id ? "people" : "service_users",
    checkKey: def.key,
    anchor: (def as { anchor?: string | null }).anchor ?? null,
  });
  if (!offered) return { error: "Only an Admin can upload a check completed on paper." };
  return { instance, def, profile, userId: user.id };
}

export async function startPaperUpload(input: {
  instanceId: string;
  files: Array<{ name: string; size: number }>;
}): Promise<
  | { ok: true; evidenceId: string; uploads: Array<{ fieldKey: string; path: string; token: string }> }
  | { ok: false; error: string }
> {
  const r = await refusal(String(input.instanceId ?? ""));
  if ("error" in r) return { ok: false, error: r.error };
  const files = Array.isArray(input.files) ? input.files : [];
  const problem = paperFilesProblem(files.map((f) => ({ name: String(f.name ?? ""), size: Number(f.size ?? 0) })));
  if (problem) return { ok: false, error: problem };

  const evidenceId = randomUUID();
  const service = createServiceClient();
  const { error: pendErr } = await service.from("paper_upload_pending").insert({
    evidence_id: evidenceId,
    company_id: r.instance.company_id,
    instance_id: r.instance.id,
    created_by: r.userId,
  });
  if (pendErr) return { ok: false, error: `Could not start the upload: ${pendErr.message}` };

  const uploads: Array<{ fieldKey: string; path: string; token: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const fieldKey = paperFieldKey(i + 1);
    const path = evidenceFilePath(r.instance.company_id, evidenceId, fieldKey, String(files[i].name));
    const { data, error } = await service.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: `Could not start the upload: ${error?.message ?? "no upload link"}` };
    uploads.push({ fieldKey, path, token: data.token });
  }
  return { ok: true, evidenceId, uploads };
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

export async function finishPaperUpload(input: {
  instanceId: string;
  evidenceId: string;
  completedOn: string;
  supervisionType?: string | null;
  week?: string | null;
  pages: Array<{ fieldKey: string; path: string; name: string }>;
}): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const instanceId = String(input.instanceId ?? "");
  const r = await refusal(instanceId);
  if ("error" in r) return { ok: false, error: r.error };
  const { instance, def, profile, userId } = r;
  const evidenceId = String(input.evidenceId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) return { ok: false, error: "That upload could not be found." };

  const today = formatCivilDate(todayInLondon());
  const dateProblem = paperDateProblem(input.completedOn, today);
  if (dateProblem) return { ok: false, error: dateProblem };
  const completedOn = String(input.completedOn);

  const pages = Array.isArray(input.pages) ? input.pages : [];
  const setProblem = paperFilesProblem(pages.map((p) => ({ name: String(p.name ?? ""), size: 1 })));
  if (setProblem) return { ok: false, error: setProblem };

  // Read every page back from the bucket: what is stored about it is the file's own truth.
  const service = createServiceClient();
  const prefix = paperPathPrefix(instance.company_id, evidenceId);
  const files: Array<Record<string, unknown>> = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const fieldKey = paperFieldKey(i + 1);
    const path = String(p.path ?? "");
    if (p.fieldKey !== fieldKey || !path.startsWith(prefix)) {
      return { ok: false, error: "A page is not part of this upload. Start again." };
    }
    const { data: blob, error } = await service.storage.from(EVIDENCE_BUCKET).download(path);
    if (error || !blob) return { ok: false, error: `Page ${i + 1} did not arrive. Try the upload again.` };
    const bytes = Buffer.from(await blob.arrayBuffer());
    const name = String(p.name ?? "");
    const problem = paperFileProblem({ name, size: bytes.length });
    if (problem) return { ok: false, error: problem };
    if (bytes.length > PAPER_MAX_BYTES) return { ok: false, error: `${name} is too big.` };
    const ext = name.split(".").pop()!.toLowerCase();
    files.push({
      field_key: fieldKey,
      storage_path: path,
      file_name: name,
      mime_type: MIME[ext] ?? "application/octet-stream",
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
    });
  }

  if (def.key === "supervision" && !/^[1-4]$/.test(String(input.supervisionType ?? ""))) {
    return { ok: false, error: "Choose which supervision this was." };
  }
  if (def.key === "health_check" && !/^(4|8)$/.test(String(input.week ?? ""))) {
    return { ok: false, error: "Choose which week's Health Check this was." };
  }
  const extra: Record<string, string> = {};
  if (def.key === "supervision" && input.supervisionType) extra.supervision_type = String(input.supervisionType);
  if (def.key === "health_check" && input.week) extra.week = String(input.week);

  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("submit_paper_evidence", {
    p_evidence_id: evidenceId,
    p_instance_id: instanceId,
    p_completed_on: completedOn,
    p_answers: extra,
    p_files: files,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  const population = instance.person_id ? "people" : "service_users";
  const recordId = (instance.person_id ?? instance.service_user_id) as string;
  const base = population === "people" ? `/people/${recordId}` : `/service-users/${recordId}`;
  const label = def.key === "supervision" && extra.supervision_type ? `Supervision ${extra.supervision_type}` : def.name;

  await writeAudit({
    companyId: instance.company_id,
    actorId: userId,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "evidence.created",
    entityType: "evidence",
    entityId: evidenceId,
    summary: `Uploaded the paper copy of ${label}, completed on ${completedOn}`,
    metadata: { paper: true, completed_on: completedOn, record_type: population, record_id: recordId, files: files.length },
  });

  /* ONLY THE NEWEST MOVES THE CHECK ON (agreed 2026-09-23). A supervision from March uploaded
     after June's has been done goes into the history, in its place, and moves nothing. */
  if (!paperMovesCheck(completedOn, instance.last_completed_on)) {
    revalidatePath(base);
    revalidatePath(population === "people" ? "/people" : "/service-users");
    return { ok: true, redirectTo: `${base}?history=${encodeURIComponent(label)}` };
  }

  const { data: version } = await supabase
    .from("form_versions")
    .select("schema")
    .eq("form_id", def.form_id as string)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const schema = isFormSchema(version?.schema) ? (version!.schema as FormSchema) : null;
  // The answers the schedule reads: which supervision it was, which week, and nothing a
  // scan could claim beyond that.
  const answers = { ...extra };

  let nextDue: string | null = null;
  if (population === "people") {
    const advanced = await advancePersonCheck({
      supabase,
      instanceId,
      personId: recordId,
      companyId: instance.company_id,
      def,
      schema,
      answers,
      completedOnIso: completedOn,
      evidenceId,
    });
    if (!advanced.ok) return { ok: false, error: advanced.error };
    nextDue = advanced.nextDue;
  } else {
    const due = await serviceUserNextDue({
      supabase,
      companyId: instance.company_id,
      branchId: instance.branch_id,
      def,
      schema,
      answers,
      completedOnIso: completedOn,
    });
    const advanced = await advanceServiceUserCheck({
      supabase,
      instanceId,
      serviceUserId: recordId,
      def,
      completedOnIso: completedOn,
      evidenceId,
      nextDue: due.nextDue,
      expiry: due.expiry,
      actorId: userId,
    });
    if (!advanced.ok) return { ok: false, error: advanced.error };
    nextDue = due.nextDue;
  }

  await closeBookingsForCheck(supabase, instanceId, userId);
  await writeAudit({
    companyId: instance.company_id,
    actorId: userId,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check.completed",
    entityType: "check_instance",
    entityId: instanceId,
    summary: `Completed ${label} on paper`,
    metadata: { evidence_id: evidenceId, next_due: nextDue, definition_id: def.id, paper: true, record_type: population },
  });

  revalidatePath(base);
  revalidatePath(population === "people" ? "/people" : "/service-users");
  return { ok: true, redirectTo: `${base}?completed=${encodeURIComponent(label)}` };
}
