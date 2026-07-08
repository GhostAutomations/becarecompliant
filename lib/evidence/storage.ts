import "server-only";

/**
 * Be Care Compliant — evidence Storage helpers (Phase 2).
 *
 * All evidence binaries (the branded PDF and any uploaded files / signatures)
 * live in the PRIVATE 'evidence' bucket. They are never public: access is only
 * ever via a short-lived (5 minute) signed URL generated server-side with the
 * service role, and every download is written to the append-only audit log.
 *
 * Path convention (the storage select policy keys off the first folder):
 *   {companyId}/{evidenceId}/evidence.pdf
 *   {companyId}/{evidenceId}/files/{fieldKey}-{safeName}
 *
 * The service role is required. If it is missing, createServiceClient throws so
 * the dependency is never a silent no-op (callers surface it in the UI).
 */

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

export const EVIDENCE_BUCKET = "evidence";

/** Short-lived signed URL lifetime for evidence downloads (seconds). */
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes (agreed with Phil)

export function evidencePdfPath(companyId: string, evidenceId: string): string {
  return `${companyId}/${evidenceId}/evidence.pdf`;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

export function evidenceFilePath(
  companyId: string,
  evidenceId: string,
  fieldKey: string,
  fileName: string,
): string {
  return `${companyId}/${evidenceId}/files/${safeName(fieldKey)}-${safeName(fileName)}`;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Upload an evidence object. `upsert: false` so an evidence path can never be
 * silently overwritten (evidence is immutable).
 */
export async function uploadEvidenceObject(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Generate a signed URL for an evidence object AND audit-log the download.
 * This is the ONLY sanctioned way to hand an evidence file to a browser.
 */
export async function signEvidenceDownload(input: {
  companyId: string;
  evidenceId: string;
  path: string;
  /** What is being downloaded, for the audit summary (e.g. "PDF", "signature"). */
  label: string;
  actor: { id: string; email: string; role: string };
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(input.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign the evidence URL." };
  }

  await writeAudit({
    companyId: input.companyId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: "evidence.downloaded",
    entityType: "evidence",
    entityId: input.evidenceId,
    summary: `Downloaded evidence ${input.label}`,
    metadata: { path: input.path, ttl_seconds: SIGNED_URL_TTL_SECONDS },
  });

  return { ok: true, url: data.signedUrl };
}

/** Remove evidence objects (used by anonymisation / SAR erasure). */
export async function deleteEvidenceObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createServiceClient();
  await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
}

/** Decode a `data:image/png;base64,...` signature into a PNG buffer. */
export function dataUrlToPngBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}
