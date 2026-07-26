import "server-only";

/**
 * Be Care Compliant — policy document storage.
 *
 * Policies live in the same PRIVATE 'evidence' bucket as every other binary,
 * under a policies/ prefix, and are only ever served through a short-lived
 * signed URL generated server side. Same rules as training certificates: no
 * public URLs, and every download is audit-logged, including a staff member
 * opening the policy they were asked to read.
 *
 * Path: {companyId}/policies/{policyId}/{safeName}
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "policy";
}

export function policyPath(companyId: string, policyId: string, fileName: string): string {
  return `${companyId}/policies/${policyId}/${safeName(fileName)}`;
}

export async function uploadPolicyDocument(
  companyId: string,
  policyId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = policyPath(companyId, policyId, file.name);
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/**
 * Store a policy document we generated ourselves (a written policy rendered to
 * PDF). Same bucket, same path shape and same privacy as an uploaded file, so
 * nothing downstream can tell the difference.
 */
export async function storePolicyBytes(
  companyId: string,
  policyKey: string,
  fileName: string,
  bytes: Buffer,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const path = policyPath(companyId, policyKey, fileName);
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Sign a policy download AND audit it. The only sanctioned way to serve one. */
export async function signPolicyDocument(input: {
  companyId: string;
  policyId: string;
  path: string;
  actor: { id: string; email: string; role: string };
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(input.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign the policy URL." };
  }
  await writeAudit({
    companyId: input.companyId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: "policy.opened",
    entityType: "policy",
    entityId: input.policyId,
    summary: "Opened a company policy",
    metadata: { path: input.path, ttl_seconds: SIGNED_URL_TTL_SECONDS },
  });
  return { ok: true, url: data.signedUrl };
}
