import "server-only";

/**
 * Be Care Compliant — making sure a folder exists in the company's drive (0437), and that a
 * record's folder still carries the right "Name (Branch)". Remembered in cloud_folders so a
 * folder is made once; if somebody deletes it in SharePoint it is made again on the next copy.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureMsFolder, getMsItem, renameMsItem, CloudNotFoundError } from "@/lib/cloud/microsoft";
import { parentKey, recordFolderName, ROOT_FOLDER_NAME, SECTION_NAMES, type FolderKey, type SectionKey } from "@/lib/cloud/names";
import { recordFolderFacts } from "@/lib/cloud/sources";
import type { CloudConnection } from "@/lib/cloud/connection";

type Ready = CloudConnection & { drive_id: string; root_folder_id: string };

async function desiredName(c: Ready, key: FolderKey): Promise<string | null> {
  if (key === "root") return ROOT_FOLDER_NAME;
  if (key.startsWith("section:")) return SECTION_NAMES[key.slice(8) as SectionKey] ?? null;
  const facts = await recordFolderFacts(c.company_id, key);
  return facts ? recordFolderName(facts.fullName, facts.branchName) : null;
}

/** The drive item id of the folder for this key, making it (and its parents) if need be. */
export async function ensureFolder(c: Ready, token: string, key: FolderKey, verify = false): Promise<string> {
  if (key === "root") return c.root_folder_id;
  const db = createServiceClient();
  const name = await desiredName(c, key);
  if (!name) throw new Error("That record no longer exists, so it has no folder.");

  const { data: known } = await db
    .from("cloud_folders")
    .select("id, drive_item_id, name")
    .eq("connection_id", c.id)
    .eq("folder_key", key)
    .maybeSingle<{ id: string; drive_item_id: string; name: string }>();

  if (known) {
    try {
      if (verify) await getMsItem(token, c.drive_id, known.drive_item_id);
      // A new name or a move to another branch: the folder follows (Phil, 2026-10-08).
      if (known.name !== name) {
        await renameMsItem(token, c.drive_id, known.drive_item_id, name);
        await db.from("cloud_folders").update({ name, updated_at: new Date().toISOString() }).eq("id", known.id);
      }
      return known.drive_item_id;
    } catch (e) {
      if (!(e instanceof CloudNotFoundError)) throw e;
      // Deleted in the drive: forget it and make it again below.
      await db.from("cloud_folders").delete().eq("id", known.id);
    }
  }

  const parent = parentKey(key) ?? "root";
  const parentId = await ensureFolder(c, token, parent, verify);
  const made = await ensureMsFolder(token, c.drive_id, parentId, name);
  await db.from("cloud_folders").upsert(
    {
      company_id: c.company_id,
      connection_id: c.id,
      folder_key: key,
      drive_item_id: made.id,
      name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,folder_key" },
  );
  return made.id;
}

/** Forget remembered folders for a key and its parents, after the drive said they are gone. */
export async function forgetFolderChain(c: Ready, key: FolderKey): Promise<void> {
  const db = createServiceClient();
  const keys: string[] = [];
  let k: FolderKey | null = key;
  while (k && k !== "root") {
    keys.push(k);
    k = parentKey(k);
  }
  if (keys.length) await db.from("cloud_folders").delete().eq("connection_id", c.id).in("folder_key", keys);
}
