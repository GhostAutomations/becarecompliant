import "server-only";

/**
 * Be Care Compliant — reading a record's Updates for the People and Service User record pages.
 *
 * READ THROUGH THE USER'S OWN CLIENT, so the database decides what they see (0324): a Viewer
 * reads, a carer or On Call gets nothing, a Manager gets nothing on their own record. The page
 * asks can_read first and draws no tile at all when the answer is no, rather than an empty one
 * that would suggest there is nothing written.
 */

import { createClient } from "@/lib/supabase/server";
import { orderThreads, tileUpdate, updateCount } from "./rules";

import type { RecordRef, RecordUpdate, RecordUpdates } from "./types";
export type { RecordRef, RecordUpdate, RecordUpdates } from "./types";

const NONE: RecordUpdates = { canRead: false, canPost: false, count: 0, tile: null, threads: [], mentionables: [] };

function args(ref: RecordRef) {
  return ref.kind === "person" ? { p_person: ref.id, p_su: null } : { p_person: null, p_su: ref.id };
}

export async function getRecordUpdates(ref: RecordRef, opts: { supportMode: boolean }): Promise<RecordUpdates> {
  const supabase = await createClient();
  const [{ data: canRead }, { data: canPost }] = await Promise.all([
    supabase.rpc("can_read_record_updates", args(ref)),
    supabase.rpc("can_post_record_updates", args(ref)),
  ]);
  if (canRead !== true) return NONE;

  const column = ref.kind === "person" ? "person_id" : "service_user_id";
  const [{ data: rows, error }, mentionablesRes] = await Promise.all([
    supabase
      .from("record_updates")
      .select(
        "id, parent_id, author_id, author_name, body, created_at, edited_at, pinned_at, removed_at, removed_reason, files:record_update_files(id, file_name, mime_type, bytes), mentions:record_update_mentions(display_name)",
      )
      .eq(column, ref.id)
      .order("created_at", { ascending: true })
      .limit(500),
    canPost === true && !opts.supportMode ? supabase.rpc("record_update_mentionables", args(ref)) : Promise.resolve({ data: [] }),
  ]);
  if (error) throw new Error(`Updates could not be read: ${error.message}`);

  type Raw = {
    id: string;
    parent_id: string | null;
    author_id: string | null;
    author_name: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    pinned_at: string | null;
    removed_at: string | null;
    removed_reason: string | null;
    files: Array<{ id: string; file_name: string; mime_type: string; bytes: number }> | null;
    mentions: Array<{ display_name: string }> | null;
  };
  const updates: RecordUpdate[] = ((rows ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    pinnedAt: r.pinned_at,
    removedAt: r.removed_at,
    removedReason: r.removed_reason,
    // A removed update's files are withheld by the database from all but Admins; hide them here too.
    files: r.removed_at ? [] : (r.files ?? []).map((f) => ({ id: f.id, fileName: f.file_name, mimeType: f.mime_type, bytes: Number(f.bytes) })),
    mentions: (r.mentions ?? []).map((m) => m.display_name),
  }));

  return {
    canRead: true,
    canPost: canPost === true && !opts.supportMode,
    count: updateCount(updates),
    tile: tileUpdate(updates),
    threads: orderThreads(updates),
    mentionables: (((mentionablesRes as { data: unknown }).data ?? []) as Array<{ profile_id: string; full_name: string }>).map(
      (m) => ({ id: m.profile_id, name: m.full_name }),
    ),
  };
}
