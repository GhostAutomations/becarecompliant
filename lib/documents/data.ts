import "server-only";

/**
 * Be Care Compliant — reading a record's Documents for the People and Service User record pages
 * (migration 0439).
 *
 * READ THROUGH THE USER'S OWN CLIENT, so the database decides what they see: the Updates audience
 * (a Viewer reads, a carer or On Call gets nothing, a Manager gets nothing on their own record).
 * The page draws no tile at all when they may not read, rather than an empty one that would
 * suggest there is nothing there.
 */

import { createClient } from "@/lib/supabase/server";
import type { DocumentKind, RecordDocument, RecordDocuments } from "./types";
export type { DocumentKind, RecordDocument, RecordDocuments } from "./types";

const NONE: RecordDocuments = { canRead: false, canUpload: false, count: 0, documents: [], loadError: null };

function args(kind: DocumentKind, id: string) {
  return kind === "person" ? { p_person: id, p_su: null } : { p_person: null, p_su: id };
}

export async function getRecordDocuments(
  ref: { kind: DocumentKind; id: string },
  opts: { supportMode: boolean },
): Promise<RecordDocuments> {
  const supabase = await createClient();
  const [{ data: canRead }, { data: canPost }] = await Promise.all([
    supabase.rpc("can_read_record_updates", args(ref.kind, ref.id)),
    supabase.rpc("can_post_record_updates", args(ref.kind, ref.id)),
  ]);
  if (canRead !== true) return NONE;

  const { data, error } = await supabase
    .from("record_documents")
    .select("id, title, note, file_name, mime_type, bytes, uploaded_by_name, created_at, removed_at, removed_by_name, removed_reason")
    .eq(ref.kind === "person" ? "person_id" : "service_user_id", ref.id)
    .order("created_at", { ascending: false })
    .limit(500);
  /* Said on the tile rather than thrown: a fault here must never take the rest of the record
     page down with it. */
  if (error) {
    console.error("[documents] read failed", error.message);
    return { ...NONE, canRead: true, loadError: "Documents could not be loaded. Refresh the page to try again." };
  }

  const documents: RecordDocument[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    note: (r.note as string | null) ?? null,
    fileName: r.file_name as string,
    mimeType: r.mime_type as string,
    bytes: Number(r.bytes ?? 0),
    uploadedByName: r.uploaded_by_name as string,
    createdAt: r.created_at as string,
    removedAt: (r.removed_at as string | null) ?? null,
    removedByName: (r.removed_by_name as string | null) ?? null,
    removedReason: (r.removed_reason as string | null) ?? null,
  }));
  return {
    canRead: true,
    canUpload: canPost === true && !opts.supportMode,
    count: documents.filter((d) => !d.removedAt).length,
    documents,
    loadError: null,
  };
}
