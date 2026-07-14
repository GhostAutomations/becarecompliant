import "server-only";

/**
 * Be Care Compliant — training certificate storage.
 * Certificates live in the same PRIVATE 'evidence' bucket as all other binaries,
 * under a training/ prefix. Access is only ever via a short-lived signed URL
 * generated server-side with the service role, and every download is audit-logged,
 * exactly like evidence files. No public URLs.
 *
 * Path: {companyId}/training/{personTrainingId}/{safeName}
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/evidence/storage";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "certificate";
}

export function trainingCertPath(companyId: string, recordId: string, fileName: string): string {
  return `${companyId}/training/${recordId}/${safeName(fileName)}`;
}

/** Upload a certificate file for a person_training record. */
export async function uploadTrainingCertificate(
  companyId: string,
  recordId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = trainingCertPath(companyId, recordId, file.name);
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Sign a certificate download AND audit-log it. Only sanctioned way to serve one. */
export async function signTrainingCertificate(input: {
  companyId: string;
  recordId: string;
  path: string;
  actor: { id: string; email: string; role: string };
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(input.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign the certificate URL." };
  }
  await writeAudit({
    companyId: input.companyId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: "training.certificate_downloaded",
    entityType: "training",
    entityId: input.recordId,
    summary: "Downloaded a training certificate",
    metadata: { path: input.path, ttl_seconds: SIGNED_URL_TTL_SECONDS },
  });
  return { ok: true, url: data.signedUrl };
}
