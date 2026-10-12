"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import {
  MAX_SIGNATURE_BYTES,
  mayKeepLetterSignature,
  pngDataUrlBase64,
  sniffSignatureImage,
  type SignatureKind,
} from "@/lib/letters/signature-rules";

/**
 * Be Care Compliant: My signature (Phil, 2026-10-12, Job 2 Part A, docs/decisions/letter-signatures.md).
 *
 * Every read and write here uses the signed in person's OWN client, so the database and the private
 * bucket decide (0446): your own row and your own folder, and only for the six office roles. The
 * server key is never used, so nothing in this file could hand one person's signature to another.
 */

const BUCKET = "signatures";
/** A signed URL to show your own signature on screen lives this long. */
const SHOW_FOR_SECONDS = 120;

export type MySignatures = {
  /** This login can keep and use a signature. */
  eligible: boolean;
  /** Why not, in plain words, when not eligible. */
  reason?: string;
  upload: { url: string; savedAt: string } | null;
  drawn: { url: string; savedAt: string } | null;
};

const LABEL: Record<SignatureKind, string> = { upload: "uploaded", drawn: "drawn" };

async function signer() {
  const { user, profile } = await requireCompany();
  const eligible = mayKeepLetterSignature(profile);
  const reason = profile.actingAsCompanyId
    ? "In support mode you cannot see, keep or use anyone's signature."
    : eligible
      ? undefined
      : "Signatures on letters are for Supervisors, Recruiters, Managers, Registered Managers, Registered Individuals and Admins.";
  return { user, profile, eligible, reason };
}

/** Your saved signatures, each with a short signed URL to show it. Nobody else's, ever. */
export async function myLetterSignatures(): Promise<MySignatures> {
  const { user, eligible, reason } = await signer();
  if (!eligible) return { eligible, reason, upload: null, drawn: null };
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("user_signatures")
    .select("kind, storage_path, updated_at")
    .eq("profile_id", user.id);
  const out: MySignatures = { eligible, upload: null, drawn: null };
  for (const r of (rows as Array<{ kind: SignatureKind; storage_path: string; updated_at: string }> | null) ?? []) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, SHOW_FOR_SECONDS);
    if (data?.signedUrl) out[r.kind] = { url: data.signedUrl, savedAt: r.updated_at };
  }
  return out;
}

/** Store one signature as the login's upload or drawing, replacing the one before. */
async function keep(kind: SignatureKind, bytes: Buffer): Promise<ActionState> {
  const { user, profile, eligible, reason } = await signer();
  if (!eligible || !profile.company_id) return { error: reason ?? "You cannot keep a signature." };
  if (bytes.length === 0) return { error: "That file is empty." };
  if (bytes.length > MAX_SIGNATURE_BYTES) return { error: "Use an image under 1MB." };
  const type = sniffSignatureImage(bytes);
  if (!type) return { error: "Use a PNG or JPEG image of your signature." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("user_signatures")
    .select("storage_path")
    .eq("profile_id", user.id)
    .eq("kind", kind)
    .maybeSingle();

  const path = `${profile.company_id}/${user.id}/${kind}-${randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (up.error) return { error: `Your signature could not be saved: ${up.error.message}` };

  const { data: saved, error } = await supabase
    .from("user_signatures")
    .upsert(
      {
        profile_id: user.id,
        company_id: profile.company_id,
        kind,
        storage_path: path,
        content_type: type,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      { onConflict: "profile_id,kind" },
    )
    .select("profile_id");
  if (error || !saved || saved.length === 0) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: `Your signature could not be saved: ${error?.message ?? "not allowed"}` };
  }
  if (before?.storage_path && before.storage_path !== path) {
    await supabase.storage.from(BUCKET).remove([before.storage_path as string]);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "signature.saved",
    entityType: "profile",
    entityId: user.id,
    summary: `Saved their ${LABEL[kind]} signature`,
    metadata: { kind },
  });
  revalidatePath("/my-signature");
  return { ok: "Saved" };
}

/** Upload a photo or scan of your signature (PNG or JPEG, under 1MB). */
export async function saveUploadedSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("signature_file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image of your signature." };
  if (file.size > MAX_SIGNATURE_BYTES) return { error: "Use an image under 1MB." };
  return keep("upload", Buffer.from(await file.arrayBuffer()));
}

/** Save the signature drawn in the box. */
export async function saveDrawnSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const b64 = pngDataUrlBase64(formData.get("signature_drawn"));
  if (!b64) return { error: "Draw your signature in the box first." };
  return keep("drawn", Buffer.from(b64, "base64"));
}

/** Remove one of your saved signatures, file and all. Letters already sent keep theirs. */
export async function removeSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "upload" && kind !== "drawn") return { error: "Choose which signature to remove." };
  // Removing needs only that it is yours (0446), so somebody whose role changed can still clear it.
  const { user, profile } = await requireCompany();
  if (profile.actingAsCompanyId) return { error: "In support mode you cannot see, keep or use anyone's signature." };
  const supabase = await createClient();
  const { data: gone, error } = await supabase
    .from("user_signatures")
    .delete()
    .eq("profile_id", user.id)
    .eq("kind", kind)
    .select("storage_path");
  if (error) return { error: `It could not be removed: ${error.message}` };
  if (!gone || gone.length === 0) return { error: "There was nothing to remove." };
  await supabase.storage.from(BUCKET).remove(gone.map((g) => g.storage_path as string));

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "signature.removed",
    entityType: "profile",
    entityId: user.id,
    summary: `Removed their ${LABEL[kind]} signature`,
    metadata: { kind },
  });
  revalidatePath("/my-signature");
  return { ok: "Removed" };
}
