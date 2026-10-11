import "server-only";

/**
 * Be Care Compliant — Service User Care Plan document storage.
 * Care Plans live in the private 'evidence' bucket under a care-plans/ prefix, served
 * only via short-lived signed URLs generated with the service role. Path:
 *   {companyId}/care-plans/{serviceUserId}/{uploadId}/{safeName}
 *
 * EVERY VERSION IS KEPT (audit F13, Phil 11 Oct 2026). Each upload has its own folder and never
 * overwrites anything; a Replace leaves the earlier file where it was. The database records each
 * file in service_user_care_plan_files the moment service_users.care_plan_path changes (0444), so
 * service user deletion, company deletion, retention and the subject access export all find every
 * version. The older flat paths ({serviceUserId}/{safeName}) still sign and copy.
 */

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";
import { pathInCompany, PATH_REFUSED } from "@/lib/storage/company-path";
import { writeAudit } from "@/lib/audit";
import { carePlanPath } from "./care-plan-path";

/** Upload a Care Plan file for a service user, to a path of its own. Nothing is overwritten. */
export async function uploadCarePlanFile(
  companyId: string,
  serviceUserId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = carePlanPath(companyId, serviceUserId, randomUUID(), file.name);
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/**
 * Take back a file whose save was refused, so it is not left in the bucket with nothing pointing
 * at it. Only from this company's folder, and never a file the database has recorded as a version
 * of somebody's care plan: a recorded version is kept. Best effort; a failure leaves an orphan
 * file, never a lost plan.
 */
export async function removeUnsavedCarePlanFile(companyId: string, path: string): Promise<void> {
  if (!pathInCompany(path, companyId)) return;
  try {
    const supabase = createServiceClient();
    const { data: recorded } = await supabase
      .from("service_user_care_plan_files")
      .select("id")
      .eq("storage_path", path)
      .limit(1);
    if (recorded && recorded.length > 0) return;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    if (error) console.error("[care-plan] unsaved upload not removed:", error.message);
  } catch (e) {
    console.error("[care-plan] unsaved upload not removed:", (e as Error).message);
  }
}

/** Short-lived signed URL to view/download a Care Plan, only from that company's own folder. */
export async function signCarePlan(
  companyId: string,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Never sign a file outside this company's folder, whatever the row says (audit F1, 0443).
  if (!pathInCompany(path, companyId)) return { ok: false, error: PATH_REFUSED };
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign the care plan URL." };
  }
  return { ok: true, url: data.signedUrl };
}

/**
 * RETENTION (0444), called by the nightly retention run. A discharged service user's care plan
 * files, every version, are erased eight years after the discharge date and never while the
 * record is on a retention hold: the rule Updates and Documents already follow. The selection and
 * the deletion happen inside expire_care_plan_file_retention (service role only); each file is
 * queued there and removed by removeCarePlanFileLeftovers below. One audit line per record.
 */
export async function expireCarePlanFiles(options?: { limit?: number }): Promise<{
  records: number;
  files: number;
  error?: string;
}> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("expire_care_plan_file_retention", {
    p_limit: options?.limit ?? 200,
  });
  if (error) return { records: 0, files: 0, error: error.message };
  const rows = (data ?? []) as Array<{ company_id: string; service_user_id: string; removed: number }>;
  let files = 0;
  for (const row of rows) {
    files += row.removed ?? 0;
    await writeAudit({
      companyId: row.company_id,
      actorId: null,
      actorEmail: null,
      actorRole: "retention",
      action: "service_user.care_plan_files_erased",
      entityType: "service_user",
      entityId: row.service_user_id,
      summary: "Care plan files erased by the retention rule (eight years after the end of care)",
      metadata: { files: row.removed ?? 0, reason: "retention_expiry" },
    });
  }
  return { records: rows.length, files };
}

/**
 * Care plan files whose row has gone (the service user was deleted, or retention erased them),
 * queued by the database in care_plan_file_trash. Removed from the bucket, then from the queue.
 * Belt and braces: a path still recorded as a version, or still a record's current file, is never
 * removed.
 */
export async function removeCarePlanFileLeftovers(): Promise<{ removed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  const { data: trash, error: trashErr } = await supabase
    .from("care_plan_file_trash")
    .select("storage_path, company_id")
    .order("queued_at", { ascending: true })
    // 100 a night keeps the path lists below short enough for a request; more waits for tomorrow.
    .limit(100);
  if (trashErr) return { removed: 0, errors: [`queue: ${trashErr.message}`] };
  const queued = ((trash as Array<{ storage_path: string; company_id: string }>) ?? []);
  if (queued.length === 0) return { removed: 0, errors };

  const paths = queued.map((t) => t.storage_path);
  const [{ data: versions, error: vErr }, { data: current, error: cErr }] = await Promise.all([
    supabase.from("service_user_care_plan_files").select("storage_path").in("storage_path", paths),
    supabase.from("service_users").select("care_plan_path").in("care_plan_path", paths),
  ]);
  // Without both answers nothing can be shown safe to remove, so nothing is removed tonight.
  if (vErr || cErr) return { removed: 0, errors: [`check: ${(vErr ?? cErr)?.message}`] };
  const keep = new Set<string>([
    ...(((versions as Array<{ storage_path: string }>) ?? []).map((v) => v.storage_path)),
    ...(((current as Array<{ care_plan_path: string }>) ?? []).map((c) => c.care_plan_path)),
  ]);
  const gone = queued.filter((t) => !keep.has(t.storage_path) && pathInCompany(t.storage_path, t.company_id)).map((t) => t.storage_path);

  let removed = 0;
  if (gone.length > 0) {
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(gone);
    if (error) errors.push(`files: ${error.message}`);
    else removed = gone.length;
  }
  // Out of the queue: what was removed, and what must be kept (still recorded somewhere). A path
  // outside its company's folder is left queued and reported, for a person to look at.
  const done = new Set(removed > 0 ? gone : []);
  const clear = paths.filter((p) => done.has(p) || keep.has(p));
  const odd = queued.filter((t) => !keep.has(t.storage_path) && !pathInCompany(t.storage_path, t.company_id));
  if (odd.length) errors.push(`${odd.length} queued path(s) outside their company folder were left in place`);
  if (clear.length) {
    const { error } = await supabase.from("care_plan_file_trash").delete().in("storage_path", clear);
    if (error) errors.push(`queue: ${error.message}`);
  }
  return { removed, errors };
}
