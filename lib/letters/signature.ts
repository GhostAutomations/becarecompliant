import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import {
  MAX_SIGNATURE_BYTES,
  mayKeepLetterSignature,
  parseSignatureChoice,
  pngDataUrlBase64,
  sniffSignatureImage,
} from "@/lib/letters/signature-rules";

/**
 * Be Care Compliant: a signature for one letter (Phil, 2026-10-12, Job 2 Part A,
 * docs/decisions/letter-signatures.md).
 *
 * The saved ones are read with the SIGNER'S OWN sign in, never the server key: the table and the
 * private bucket only ever hand a signature to its owner (0446), so a letter can only carry the
 * signature of the person making it.
 */

export const SIGNATURE_BUCKET = "signatures";

export type LetterSignature = {
  kind: "upload" | "drawn" | "now";
  /** data: URL of the PNG or JPEG, drawn into the PDF above the name. */
  dataUrl: string;
  signerId: string;
  signerName: string;
  signerRole: string | null;
};

type SignerProfile = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status?: string | null;
  company_id: string | null;
  actingAsCompanyId?: string | null;
};

/** The job title under a name on a letter, for the signer and the person holding the meeting alike
 *  (letter-extras.ts). Never the system role (Phil, 2026-10-12, Part C). */
export async function letterJobTitle(companyId: string, profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  const admin = createServiceClient();
  /* The job title an Admin set on the login (Settings, Users; Phil, 2026-10-12, 0447), else the one
     on their People record, else none: never the system role (Part C). */
  const [{ data: login }, { data: person }] = await Promise.all([
    admin.from("profiles").select("job_title").eq("id", profileId).eq("company_id", companyId).maybeSingle(),
    admin.from("people").select("job_title").eq("company_id", companyId).eq("profile_id", profileId).limit(1).maybeSingle(),
  ]);
  const title = ((login?.job_title as string | null) ?? "").trim() || ((person?.job_title as string | null) ?? "").trim();
  return title || null;
}

const KIND_WORDS = {
  upload: "saved uploaded signature",
  drawn: "saved drawn signature",
  now: "signature drawn for this letter",
} as const;

/**
 * The signature the letter's signing choice asks for, ready to draw, or null for No signature.
 * Refused with a plain message when the choice cannot be honoured, so nothing goes out unsigned
 * that was meant to be signed.
 */
export async function resolveLetterSignature(
  formData: FormData,
  profile: SignerProfile,
): Promise<{ signature: LetterSignature | null } | { error: string }> {
  const choice = parseSignatureChoice(formData.get("signature_choice"));
  if (choice === "none") return { signature: null };
  if (!profile.company_id || !mayKeepLetterSignature(profile)) {
    return {
      error: profile.actingAsCompanyId
        ? "In support mode a letter cannot be signed. Choose No signature."
        : "Your role cannot sign letters. Choose No signature.",
    };
  }

  let bytes: Buffer;
  if (choice === "now") {
    const b64 = pngDataUrlBase64(formData.get("signature_now"));
    if (!b64) return { error: "Draw your signature in the box, or choose another option." };
    bytes = Buffer.from(b64, "base64");
  } else {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("user_signatures")
      .select("storage_path")
      .eq("profile_id", profile.id)
      .eq("kind", choice)
      .maybeSingle();
    if (!row) {
      return {
        error: `You have no ${choice === "upload" ? "uploaded" : "drawn"} signature saved. Add one in My signature, or choose another option.`,
      };
    }
    const { data: file, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(row.storage_path as string);
    if (error || !file) return { error: `Your signature could not be read: ${error?.message ?? "no file"}` };
    bytes = Buffer.from(await file.arrayBuffer());
  }
  if (bytes.length > MAX_SIGNATURE_BYTES) return { error: "That signature is too large. Use one under 1MB." };
  const type = sniffSignatureImage(bytes);
  if (!type) return { error: "That signature is not a PNG or JPEG image." };

  return {
    signature: {
      kind: choice,
      dataUrl: `data:${type};base64,${bytes.toString("base64")}`,
      signerId: profile.id,
      signerName: profile.full_name || profile.email,
      signerRole: await letterJobTitle(profile.company_id, profile.id),
    },
  };
}

/** Every use of a signature on a letter, in the audit log (Phil, 2026-10-12). */
export async function auditSignatureUse(opts: {
  signature: LetterSignature;
  companyId: string;
  actorEmail: string | null;
  actorRole: string | null;
  personId: string;
  letter: string;
  meetingId?: string | null;
  letterId?: string | null;
}): Promise<void> {
  await writeAudit({
    companyId: opts.companyId,
    actorId: opts.signature.signerId,
    actorEmail: opts.actorEmail,
    actorRole: opts.actorRole,
    action: "signature.used",
    entityType: "person",
    entityId: opts.personId,
    summary: `Signed the ${opts.letter} with their ${KIND_WORDS[opts.signature.kind]}`,
    metadata: {
      kind: opts.signature.kind,
      letter: opts.letter,
      meeting_id: opts.meetingId ?? null,
      letter_id: opts.letterId ?? null,
    },
  });
}

/**
 * A deleted login's saved signatures go with it (GDPR: a signature is personal data). Their rows
 * cascade with the profile; the files are removed here with the server key, because the owner can
 * no longer sign in to do it. Best effort: a failure is logged, never thrown.
 */
export async function removeSignatureFiles(companyId: string, profileId: string): Promise<void> {
  try {
    const admin = createServiceClient();
    const folder = `${companyId}/${profileId}`;
    const { data } = await admin.storage.from(SIGNATURE_BUCKET).list(folder, { limit: 100 });
    const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
    if (paths.length) {
      const { error } = await admin.storage.from(SIGNATURE_BUCKET).remove(paths);
      if (error) console.error("[signatures] files not removed:", error.message);
    }
  } catch (e) {
    console.error("[signatures] files not removed:", (e as Error).message);
  }
}
