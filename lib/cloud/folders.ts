import "server-only";

/**
 * Be Care Compliant — making sure a folder exists in the company's drive (0437), and that a
 * record's folder still carries the right "Name (Branch)". Remembered in cloud_folders so a
 * folder is made once; if somebody deletes it in SharePoint it is made again on the next copy.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createMsFolderRenaming, ensureMsFolder, getMsItem, renameMsItem, CloudNotFoundError } from "@/lib/cloud/microsoft";
import { parentKey, recordFolderName, ROOT_FOLDER_NAME, SECTION_NAMES, type FolderKey, type SectionKey } from "@/lib/cloud/names";
import { recordFolderFacts } from "@/lib/cloud/sources";
import type { CloudConnection } from "@/lib/cloud/connection";

type Ready = CloudConnection & { drive_id: string; root_folder_id: string };

async function desiredName(c: Ready, key: FolderKey): Promise<string | null> {
  if (key === "root") return ROOT_FOLDER_NAME;
  if (key.startsWith("section:")) return SECTION_NAMES[key.slice(8) as SectionKey] ?? null;
  const facts = await recordFolderFacts(c.company_id, key);
  return facts ? recordFolderName(facts.fullName, facts.branchName, facts.n) : null;
}

/**
 * The "Be Care Compliant" folder itself. Normally the one chosen in Settings; checked against the
 * drive when asked (after a copy found something missing), and made again if somebody deleted or
 * moved it, so one tidy up in SharePoint never stops every copy for good.
 */
async function ensureRoot(c: Ready, token: string, verify: boolean): Promise<string> {
  if (!verify) return c.root_folder_id;
  try {
    await getMsItem(token, c.drive_id, c.root_folder_id);
    return c.root_folder_id;
  } catch (e) {
    if (!(e instanceof CloudNotFoundError)) throw e;
  }
  const db = createServiceClient();
  const made = await ensureMsFolder(token, c.drive_id, "root", ROOT_FOLDER_NAME);
  await db
    .from("cloud_connections")
    .update({ root_folder_id: made.id, root_folder_url: made.webUrl ?? c.root_folder_url, updated_at: new Date().toISOString() })
    .eq("id", c.id);
  // Everything that sat under the old one went with it.
  await db.from("cloud_folders").delete().eq("connection_id", c.id);
  c.root_folder_id = made.id;
  return made.id;
}

/** The drive item id of the folder for this key, making it (and its parents) if need be. */
export async function ensureFolder(c: Ready, token: string, key: FolderKey, verify = false): Promise<string> {
  if (key === "root") return ensureRoot(c, token, verify);
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
        let renamed = true;
        try {
          await renameMsItem(token, c.drive_id, known.drive_item_id, name);
        } catch (re) {
          if (re instanceof CloudNotFoundError) throw re;
          const err = re as { status?: number; code?: string };
          // A folder of that name is already there (another record's, or one made by hand). Keep
          // copying into the folder it has always used, and try the rename again next time; the
          // remembered name stays the folder's REAL name, so nothing else can take it over.
          if (err.status !== 409 && err.code !== "nameAlreadyExists") throw re;
          renamed = false;
          console.warn("[cloud] could not rename a record folder yet, that name is taken:", name);
        }
        if (renamed) await db.from("cloud_folders").update({ name, updated_at: new Date().toISOString() }).eq("id", known.id);
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
  let made = await ensureMsFolder(token, c.drive_id, parentId, name);
  let madeName = name;
  /* NEVER ANOTHER RECORD'S FOLDER (review, 9 Oct 2026). ensureMsFolder adopts a folder that is
     already there with this name, which is right for a folder we made and lost track of, and
     wrong if that folder is another record's (a same named record whose number has just changed).
     Then a folder of its own is made, with whatever free name Microsoft gives it. */
  if (key.startsWith("person:") || key.startsWith("service_user:")) {
    const { data: owner } = await db
      .from("cloud_folders")
      .select("folder_key")
      .eq("connection_id", c.id)
      .eq("drive_item_id", made.id)
      .neq("folder_key", key)
      .limit(1);
    if ((owner ?? []).length > 0) {
      made = await createMsFolderRenaming(token, c.drive_id, parentId, name);
      madeName = made.name || name;
    }
  }
  await db.from("cloud_folders").upsert(
    {
      company_id: c.company_id,
      connection_id: c.id,
      folder_key: key,
      drive_item_id: made.id,
      name: madeName,
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
