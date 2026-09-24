"use server";

/**
 * Be Care Compliant — writing Updates on a People or Service User record (0324).
 *
 * EVERY WRITE IS A DATABASE FUNCTION, which is where who may do what is decided: these actions
 * only prepare the call, put the files where they belong, send the @mention emails and write the
 * audit trail. Refusals come back in the database's own words.
 *
 * ATTACHMENTS GO IN TWO STEPS, like a paper upload (lib/evidence/paper-actions.ts), because a
 * phone photo can be bigger than a server action may carry:
 *   1. startUpdateUpload checks the caller may post here and the files are allowed, makes the
 *      update's id, and hands back one single use signed upload URL per file inside a folder
 *      named for that id, in the PRIVATE record-updates bucket.
 *   2. postUpdate reads each file back out of the bucket (so the size and fingerprint stored are
 *      the file's own, not what the browser claimed) and posts the update with them.
 * An upload started and never posted is removed by the nightly retention run.
 *
 * Support mode (the Founder managing as a company) writes nothing: it is for looking.
 */

import { randomUUID, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import { sendEmail } from "@/lib/email/resend";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { mentionEmailHtml, mentionEmailSubject } from "@/lib/email/templates";
import {
  UPDATE_MAX_BYTES,
  mentionedIds,
  updateFilePath,
  updateFileProblem,
  updateFilesProblem,
  updateMimeType,
  updatePostProblem,
} from "./rules";

const BUCKET = "record-updates";
const SIGNED_URL_TTL_SECONDS = 300;
const UUID = /^[0-9a-f-]{36}$/i;

type Kind = "person" | "service_user";
type Ref = { kind: Kind; id: string };

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

type Writer = Awaited<ReturnType<typeof requireCompany>>;

async function writer(): Promise<Writer | { error: string }> {
  const { user, profile } = await requireCompany();
  if (profile.actingAsCompanyId) return { error: "Support mode is for looking. Updates are written by the company's own team." };
  return { user, profile };
}

export async function startUpdateUpload(input: {
  kind: Kind;
  recordId: string;
  files: Array<{ name: string; size: number }>;
}): Promise<{ ok: true; updateId: string; uploads: Array<{ path: string; token: string }> } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const ref = cleanRef(input.kind, input.recordId);
  if (!ref) return { ok: false, error: "That record could not be found." };
  const files = (Array.isArray(input.files) ? input.files : []).map((f) => ({ name: String(f.name ?? ""), size: Number(f.size ?? 0) }));
  const problem = updateFilesProblem(files);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const { data: canPost } = await supabase.rpc("can_post_record_updates", rpcArgs(ref));
  if (canPost !== true) return { ok: false, error: "You cannot post an update on this record." };
  const facts = await recordFacts(ref);
  if (!facts) return { ok: false, error: "That record could not be found." };

  const updateId = randomUUID();
  const service = createServiceClient();
  if (files.length > 0) {
    const { error: pendErr } = await service
      .from("record_update_uploads_pending")
      .insert({ update_id: updateId, company_id: facts.companyId, created_by: w.user.id });
    if (pendErr) return { ok: false, error: `Could not start the upload: ${pendErr.message}` };
  }
  const uploads: Array<{ path: string; token: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const path = updateFilePath(facts.companyId, updateId, i + 1, files[i].name);
    const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: `Could not start the upload: ${error?.message ?? "no upload link"}` };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, updateId, uploads };
}

export async function postUpdate(input: {
  kind: Kind;
  recordId: string;
  updateId: string;
  parentId?: string | null;
  body: string;
  mentions: Array<{ id: string; name: string }>;
  files: Array<{ path: string; name: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const ref = cleanRef(input.kind, input.recordId);
  if (!ref) return { ok: false, error: "That record could not be found." };
  const updateId = String(input.updateId ?? "");
  if (!UUID.test(updateId)) return { ok: false, error: "That update could not be saved. Try again." };
  const parentId = input.parentId ? String(input.parentId) : null;
  if (parentId && !UUID.test(parentId)) return { ok: false, error: "That reply does not belong to an update on this record." };
  const body = String(input.body ?? "");
  const pages = Array.isArray(input.files) ? input.files : [];
  const problem = updatePostProblem(body, pages.length);
  if (problem) return { ok: false, error: problem };

  const facts = await recordFacts(ref);
  if (!facts) return { ok: false, error: "That record could not be found." };

  // Read every file back: what is stored about it is the file's own truth.
  const service = createServiceClient();
  const files: Array<Record<string, unknown>> = [];
  for (let i = 0; i < pages.length; i++) {
    const name = String(pages[i].name ?? "");
    const path = String(pages[i].path ?? "");
    if (path !== updateFilePath(facts.companyId, updateId, i + 1, name)) {
      return { ok: false, error: "An attachment is not part of this update. Start again." };
    }
    const { data: blob, error } = await service.storage.from(BUCKET).download(path);
    if (error || !blob) return { ok: false, error: `${name} did not arrive. Try again.` };
    const bytes = Buffer.from(await blob.arrayBuffer());
    const fileProblem = updateFileProblem({ name, size: bytes.length });
    if (fileProblem) return { ok: false, error: fileProblem };
    if (bytes.length > UPDATE_MAX_BYTES) return { ok: false, error: `${name} is too big.` };
    files.push({
      storage_path: path,
      file_name: name,
      mime_type: updateMimeType(name),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const picked = (Array.isArray(input.mentions) ? input.mentions : [])
    .filter((m) => UUID.test(String(m?.id ?? "")))
    .map((m) => ({ id: String(m.id), name: String(m.name ?? "") }));
  const mentionIds = mentionedIds(body, picked);

  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("post_record_update", {
    p_id: updateId,
    ...rpcArgs(ref),
    p_parent: parentId,
    p_body: body,
    p_mentions: mentionIds,
    p_files: files,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  await writeAudit({
    companyId: facts.companyId,
    actorId: w.user.id,
    actorEmail: w.profile.email,
    actorRole: w.profile.role,
    action: parentId ? "record_update.replied" : "record_update.posted",
    entityType: ref.kind,
    entityId: ref.id,
    summary: `${parentId ? "Replied to an update" : "Posted an update"} on ${facts.name}${files.length ? ` with ${files.length} ${files.length === 1 ? "file" : "files"}` : ""}`,
    metadata: { update_id: updateId, parent_id: parentId, files: files.length, mentions: mentionIds.length },
  });

  await emailMentions({ ref, facts, updateId, authorName: w.profile.full_name });
  revalidatePath(recordPath(ref));
  return { ok: true };
}

/**
 * One email per person mentioned, once. The database has already dropped anybody who may not see
 * the record, so this sends to exactly the rows it kept. The email names who mentioned them and
 * on whose record, and NEVER carries the words: they may be care details, and they belong in the
 * app, not in an inbox (Phil, 2026-09-24).
 */
async function emailMentions(opts: { ref: Ref; facts: { companyId: string; name: string }; updateId: string; authorName: string }) {
  const service = createServiceClient();
  const { data: rows } = await service
    .from("record_update_mentions")
    .select("profile_id, profile:profiles(full_name, email, status)")
    .eq("update_id", opts.updateId)
    .is("emailed_at", null);
  const { data: company } = await service.from("companies").select("name").eq("id", opts.facts.companyId).maybeSingle();
  const companyName = (company as { name?: string } | null)?.name ?? "";
  const url = `${siteUrl()}${recordPath(opts.ref)}?updates=open`;
  const subject = mentionEmailSubject(opts.authorName);

  for (const r of (rows ?? []) as unknown as Array<{ profile_id: string; profile: { full_name: string; email: string; status: string } | null }>) {
    const p = r.profile;
    if (!p?.email || p.status !== "active") continue;
    const logId = await claimNotification({
      companyId: opts.facts.companyId,
      recipientProfileId: r.profile_id,
      channel: "email",
      kind: "update_mention",
      dedupeKey: `update_mention:${opts.updateId}:${r.profile_id}`,
      toAddress: p.email,
      subject,
      metadata: { update_id: opts.updateId, record_kind: opts.ref.kind, record_id: opts.ref.id },
    });
    if (!logId) continue;
    const result = await sendEmail({
      to: p.email,
      subject,
      html: mentionEmailHtml({
        recipientName: p.full_name,
        authorName: opts.authorName,
        recordName: opts.facts.name,
        recordKind: opts.ref.kind,
        companyName,
        url,
      }),
    });
    await settleNotification(logId, result.sent ? "sent" : result.skippedReason ? "skipped" : "failed", result.error ?? result.skippedReason);
    if (result.sent) {
      await service
        .from("record_update_mentions")
        .update({ emailed_at: new Date().toISOString() })
        .eq("update_id", opts.updateId)
        .eq("profile_id", r.profile_id);
    }
  }
}

async function updateRecord(updateId: string): Promise<{ ref: Ref; companyId: string; name: string } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("record_updates")
    .select("person_id, service_user_id, company_id")
    .eq("id", updateId)
    .maybeSingle();
  const row = data as { person_id: string | null; service_user_id: string | null; company_id: string } | null;
  if (!row) return null;
  const ref: Ref = row.person_id ? { kind: "person", id: row.person_id } : { kind: "service_user", id: row.service_user_id as string };
  const facts = await recordFacts(ref);
  return { ref, companyId: row.company_id, name: facts?.name ?? "" };
}

export async function editUpdate(input: { updateId: string; body: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const updateId = String(input.updateId ?? "");
  if (!UUID.test(updateId)) return { ok: false, error: "That update could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_record_update", { p_id: updateId, p_body: String(input.body ?? "") });
  if (error) return { ok: false, error: error.message };
  const rec = await updateRecord(updateId);
  if (rec) {
    await writeAudit({
      companyId: rec.companyId,
      actorId: w.user.id,
      actorEmail: w.profile.email,
      actorRole: w.profile.role,
      action: "record_update.edited",
      entityType: rec.ref.kind,
      entityId: rec.ref.id,
      summary: `Edited an update on ${rec.name}`,
      metadata: { update_id: updateId },
    });
    revalidatePath(recordPath(rec.ref));
  }
  return { ok: true };
}

export async function removeUpdate(input: { updateId: string; reason: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const updateId = String(input.updateId ?? "");
  if (!UUID.test(updateId)) return { ok: false, error: "That update could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_record_update", { p_id: updateId, p_reason: String(input.reason ?? "") });
  if (error) return { ok: false, error: error.message };
  const rec = await updateRecord(updateId);
  if (rec) {
    await writeAudit({
      companyId: rec.companyId,
      actorId: w.user.id,
      actorEmail: w.profile.email,
      actorRole: w.profile.role,
      action: "record_update.removed",
      entityType: rec.ref.kind,
      entityId: rec.ref.id,
      summary: `Removed an update on ${rec.name}: ${String(input.reason ?? "").trim().slice(0, 200)}`,
      metadata: { update_id: updateId },
    });
    revalidatePath(recordPath(rec.ref));
  }
  return { ok: true };
}

export async function pinUpdate(input: { updateId: string; pin: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const updateId = String(input.updateId ?? "");
  if (!UUID.test(updateId)) return { ok: false, error: "That update could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pin_record_update", { p_id: updateId, p_pin: !!input.pin });
  if (error) return { ok: false, error: error.message };
  const rec = await updateRecord(updateId);
  if (rec) {
    await writeAudit({
      companyId: rec.companyId,
      actorId: w.user.id,
      actorEmail: w.profile.email,
      actorRole: w.profile.role,
      action: input.pin ? "record_update.pinned" : "record_update.unpinned",
      entityType: rec.ref.kind,
      entityId: rec.ref.id,
      summary: `${input.pin ? "Pinned" : "Unpinned"} an update on ${rec.name}`,
      metadata: { update_id: updateId },
    });
    revalidatePath(recordPath(rec.ref));
  }
  return { ok: true };
}

/**
 * A five minute link to one attachment, and a line in the audit log saying who opened what.
 * The row is read through the caller's own client, so the database decides whether they may.
 */
export async function openUpdateFile(input: { fileId: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user, profile } = await requireCompany();
  const fileId = String(input.fileId ?? "");
  if (!UUID.test(fileId)) return { ok: false, error: "That file could not be found." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("record_update_files")
    .select("storage_path, file_name, update_id, company_id")
    .eq("id", fileId)
    .maybeSingle();
  const row = data as { storage_path: string; file_name: string; update_id: string; company_id: string } | null;
  if (!row) return { ok: false, error: "That file could not be found." };

  const service = createServiceClient();
  const { data: signed, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.file_name });
  if (error || !signed?.signedUrl) return { ok: false, error: `The file could not be opened: ${error?.message ?? "no link"}` };

  const rec = await updateRecord(row.update_id);
  await writeAudit({
    companyId: row.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "record_update.file_downloaded",
    entityType: rec?.ref.kind ?? "record_update",
    entityId: rec?.ref.id ?? row.update_id,
    summary: `Opened ${row.file_name} from an update${rec?.name ? ` on ${rec.name}` : ""}`,
    metadata: { update_id: row.update_id, file_id: fileId },
  });
  return { ok: true, url: signed.signedUrl };
}
