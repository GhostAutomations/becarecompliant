"use server";

/**
 * Be Care Compliant — Documents on a People or Service User record (migration 0439).
 *
 * EVERY WRITE IS A DATABASE FUNCTION, which decides who may do what (the Updates audience to add,
 * a Company Admin to remove). These actions put the files where they belong, copy them to the
 * company's cloud drive when one is connected, and write the audit trail.
 *
 * UPLOADS GO IN TWO STEPS, like an Update's attachments, because a phone photo or a scan can be
 * bigger than a server action may carry:
 *   1. startDocumentUpload checks the caller may add documents here and the files are allowed, makes
 *      the upload's id, and hands back one single use signed upload URL per file inside a folder
 *      named for that id, in the PRIVATE record-documents bucket.
 *   2. saveDocuments reads each file back out of the bucket (so the size and fingerprint stored are
 *      the file's own, not what the browser claimed) and saves the documents.
 * An upload started and never saved is removed by the nightly run.
 *
 * Support mode (the Founder managing as a company) writes nothing: it is for looking.
 */

import { randomUUID, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { queueCloudCopies } from "@/lib/cloud/queue";
import {
  DOC_MAX_BYTES,
  DOC_NOTE_MAX,
  docFilePath,
  docFileProblem,
  docFilesProblem,
  docMimeType,
  docTitleProblem,
} from "./rules";
import type { DocumentKind } from "./types";

const BUCKET = "record-documents";
const SIGNED_URL_TTL_SECONDS = 300;
const UUID = /^[0-9a-f-]{36}$/i;

type Ref = { kind: DocumentKind; id: string };

function cleanRef(kind: unknown, id: unknown): Ref | null {
  const k = kind === "person" || kind === "service_user" ? kind : null;
  const i = String(id ?? "");
  if (!k || !UUID.test(i)) return null;
  return { kind: k, id: i };
}

function rpcArgs(ref: Ref) {
  return ref.kind === "person" ? { p_person: ref.id, p_su: null } : { p_person: null, p_su: ref.id };
}

function recordPath(ref: Ref): string {
  return ref.kind === "person" ? `/people/${ref.id}` : `/service-users/${ref.id}`;
}

/** The record's company and name, read past RLS once the caller has been checked. */
async function recordFacts(ref: Ref): Promise<{ companyId: string; name: string } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from(ref.kind === "person" ? "people" : "service_users")
    .select("company_id, full_name")
    .eq("id", ref.id)
    .maybeSingle();
  const row = data as { company_id: string; full_name: string } | null;
  return row ? { companyId: row.company_id, name: row.full_name } : null;
}

async function writer() {
  const { user, profile } = await requireCompany();
  if (profile.actingAsCompanyId) {
    return { error: "Support mode is for looking. Documents are added by the company's own team." } as const;
  }
  return { user, profile } as const;
}

export async function startDocumentUpload(input: {
  kind: DocumentKind;
  recordId: string;
  files: Array<{ name: string; size: number }>;
}): Promise<{ ok: true; batchId: string; uploads: Array<{ path: string; token: string }> } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error as string };
  const ref = cleanRef(input.kind, input.recordId);
  if (!ref) return { ok: false, error: "That record could not be found." };
  const files = (Array.isArray(input.files) ? input.files : []).map((f) => ({ name: String(f.name ?? ""), size: Number(f.size ?? 0) }));
  const problem = docFilesProblem(files);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const { data: canPost } = await supabase.rpc("can_post_record_updates", rpcArgs(ref));
  if (canPost !== true) return { ok: false, error: "You cannot add documents to this record." };
  const facts = await recordFacts(ref);
  if (!facts) return { ok: false, error: "That record could not be found." };

  const batchId = randomUUID();
  const service = createServiceClient();
  const { error: pendErr } = await service
    .from("record_document_uploads_pending")
    .insert({ batch_id: batchId, company_id: facts.companyId, created_by: w.user.id });
  if (pendErr) return { ok: false, error: `Could not start the upload: ${pendErr.message}` };

  const uploads: Array<{ path: string; token: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const path = docFilePath(facts.companyId, batchId, i + 1, files[i].name);
    const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: `Could not start the upload: ${error?.message ?? "no upload link"}` };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, batchId, uploads };
}

export async function saveDocuments(input: {
  kind: DocumentKind;
  recordId: string;
  batchId: string;
  note?: string | null;
  files: Array<{ path: string; name: string; title: string }>;
}): Promise<{ ok: true; saved: number } | { ok: false; error: string; restart?: boolean }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error as string };
  const ref = cleanRef(input.kind, input.recordId);
  if (!ref) return { ok: false, error: "That record could not be found." };
  const batchId = String(input.batchId ?? "");
  if (!UUID.test(batchId)) return { ok: false, error: "That upload could not be saved. Start again.", restart: true };
  const note = String(input.note ?? "").trim();
  if (note.length > DOC_NOTE_MAX) return { ok: false, error: `A note can be up to ${DOC_NOTE_MAX} characters.` };
  const picked = Array.isArray(input.files) ? input.files : [];
  if (picked.length === 0) return { ok: false, error: "Choose a file to upload." };

  const facts = await recordFacts(ref);
  if (!facts) return { ok: false, error: "That record could not be found." };

  // Read every file back: what is stored about it is the file's own truth.
  const service = createServiceClient();
  const files: Array<Record<string, unknown>> = [];
  for (let i = 0; i < picked.length; i++) {
    const name = String(picked[i].name ?? "");
    const path = String(picked[i].path ?? "");
    const title = String(picked[i].title ?? "").trim();
    const titleProblem = docTitleProblem(title);
    if (titleProblem) return { ok: false, error: titleProblem };
    if (path !== docFilePath(facts.companyId, batchId, i + 1, name)) {
      return { ok: false, error: "A file is not part of this upload. Start again.", restart: true };
    }
    const { data: blob, error } = await service.storage.from(BUCKET).download(path);
    // restart: the browser sends the files again rather than retrying a save that cannot work.
    if (error || !blob) return { ok: false, error: `${name} did not arrive. Try again.`, restart: true };
    const bytes = Buffer.from(await blob.arrayBuffer());
    const fileProblem = docFileProblem({ name, size: bytes.length });
    if (fileProblem) return { ok: false, error: fileProblem };
    if (bytes.length > DOC_MAX_BYTES) return { ok: false, error: `${name} is too big.` };
    files.push({
      storage_path: path,
      file_name: name,
      mime_type: docMimeType(name),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      title,
    });
  }

  const supabase = await createClient();
  const { data: saved, error: rpcErr } = await supabase.rpc("add_record_documents", {
    p_batch: batchId,
    ...rpcArgs(ref),
    p_note: note || null,
    p_files: files,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message, restart: /Start again/.test(rpcErr.message) };

  // A copy in the company's cloud drive, in this record's folder, when one is connected (0437).
  const { data: rows } = await service.from("record_documents").select("id").eq("batch_id", batchId);
  await queueCloudCopies(
    facts.companyId,
    ((rows ?? []) as Array<{ id: string }>).map((r) => ({ kind: "record_document" as const, sourceId: r.id })),
  );

  await writeAudit({
    companyId: facts.companyId,
    actorId: w.user.id,
    actorEmail: w.profile.email,
    actorRole: w.profile.role,
    action: "record_document.added",
    entityType: ref.kind,
    entityId: ref.id,
    summary: `Added ${files.length} ${files.length === 1 ? "document" : "documents"} to ${facts.name}`,
    metadata: { batch_id: batchId, documents: files.map((f) => ({ title: f.title, file: f.file_name, bytes: f.bytes })) },
  });

  revalidatePath(recordPath(ref));
  return { ok: true, saved: Number(saved ?? files.length) };
}

/**
 * A five minute link to one document, and a line in the audit log saying who opened what. The row
 * is read through the caller's own client, so the database decides whether they may.
 */
export async function openDocument(input: { documentId: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user, profile } = await requireCompany();
  const documentId = String(input.documentId ?? "");
  if (!UUID.test(documentId)) return { ok: false, error: "That document could not be found." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("record_documents")
    .select("storage_path, file_name, title, company_id, person_id, service_user_id, removed_at")
    .eq("id", documentId)
    .maybeSingle();
  const row = data as {
    storage_path: string;
    file_name: string;
    title: string;
    company_id: string;
    person_id: string | null;
    service_user_id: string | null;
    removed_at: string | null;
  } | null;
  if (!row) return { ok: false, error: "That document could not be found." };
  if (row.removed_at) return { ok: false, error: "That document has been removed." };

  const service = createServiceClient();
  const { data: signed, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.file_name });
  if (error || !signed?.signedUrl) return { ok: false, error: `The document could not be opened: ${error?.message ?? "no link"}` };

  const ref: Ref = row.person_id ? { kind: "person", id: row.person_id } : { kind: "service_user", id: row.service_user_id as string };
  const facts = await recordFacts(ref);
  await writeAudit({
    companyId: row.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "record_document.opened",
    entityType: ref.kind,
    entityId: ref.id,
    summary: `Opened the document "${row.title}"${facts?.name ? ` on ${facts.name}` : ""}`,
    metadata: { document_id: documentId, file: row.file_name },
  });
  return { ok: true, url: signed.signedUrl };
}

/**
 * A Company Admin removes a document, with a reason (Phil, 2026-10-09). The file is deleted now;
 * a line saying who removed it, when and why stays on the record. A copy already in the company's
 * cloud drive is the company's own and is left where it is (the tile says so).
 */
export async function removeDocument(input: { documentId: string; reason: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error as string };
  const documentId = String(input.documentId ?? "");
  if (!UUID.test(documentId)) return { ok: false, error: "That document could not be found." };
  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, error: "Give a reason for removing it." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("record_documents")
    .select("title, file_name, company_id, person_id, service_user_id")
    .eq("id", documentId)
    .maybeSingle();
  const row = before as { title: string; file_name: string; company_id: string; person_id: string | null; service_user_id: string | null } | null;
  if (!row) return { ok: false, error: "That document could not be found." };

  const { data: path, error } = await supabase.rpc("remove_record_document", { p_id: documentId, p_reason: reason });
  if (error) return { ok: false, error: error.message };

  const service = createServiceClient();
  if (typeof path === "string" && path) {
    const { error: rmErr } = await service.storage.from(BUCKET).remove([path]);
    // Removed from the bucket now: no need for the nightly run to try again.
    if (!rmErr) await service.from("record_document_file_trash").delete().eq("storage_path", path);
  }
  // Anything still waiting to be copied to the cloud drive is not copied now.
  await service
    .from("cloud_sync_queue")
    .delete()
    .eq("company_id", row.company_id)
    .eq("source_kind", "record_document")
    .eq("source_id", documentId)
    .neq("status", "done");

  const ref: Ref = row.person_id ? { kind: "person", id: row.person_id } : { kind: "service_user", id: row.service_user_id as string };
  const facts = await recordFacts(ref);
  await writeAudit({
    companyId: row.company_id,
    actorId: w.user.id,
    actorEmail: w.profile.email,
    actorRole: w.profile.role,
    action: "record_document.removed",
    entityType: ref.kind,
    entityId: ref.id,
    summary: `Removed the document "${row.title}"${facts?.name ? ` from ${facts.name}` : ""}`,
    metadata: { document_id: documentId, file: row.file_name, reason },
  });

  revalidatePath(recordPath(ref));
  return { ok: true };
}
