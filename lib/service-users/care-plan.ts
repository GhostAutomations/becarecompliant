import "server-only";

/**
 * Be Care Compliant — Service User Care Plan document storage.
 * Care Plans live in the private 'evidence' bucket under a care-plans/ prefix, served
 * only via short-lived signed URLs generated with the service role. Path:
 *   {companyId}/care-plans/{serviceUserId}/{safeName}
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "care-plan";
}

export function carePlanPath(companyId: string, serviceUserId: string, fileName: string): string {
  return `${companyId}/care-plans/${serviceUserId}/${safeName(fileName)}`;
}

/** Upload (or replace) a Care Plan file for a service user. */
export async function uploadCarePlanFile(
  companyId: string,
  serviceUserId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = carePlanPath(companyId, serviceUserId, file.name);
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Short-lived signed URL to view/download a Care Plan. */
export async function signCarePlan(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign the care plan URL." };
  }
  return { ok: true, url: data.signedUrl };
}
