import "server-only";

/**
 * Be Care Compliant — making sure a folder exists in the company's drive (0437), and that a
 * record's folder still has the right name and sits in the right branch. Remembered in
 * cloud_folders so a folder is made once; if somebody deletes it in SharePoint it is made again
 * on the next copy.
 *
 * Layout (Phil, 2026-10-09, by popup): Be Care Compliant > People > [Branch] > [Person] >
 * [category], and the same under Service Users. A transfer moves the record's whole folder into
 * the new branch's folder (0441); folders made before branches existed are moved in the same way
 * the next time they are used.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createMsFolderRenaming, ensureMsFolder, getMsItem, moveMsItem, renameMsItem, CloudNotFoundError } from "@/lib/cloud/microsoft";
import {
  branchFolderName,
  branchKey,
  isBranchKey,
  isRecordKey,
  parentKey,
  recordFolderName,
  ROOT_FOLDER_NAME,
  SECTION_NAMES,
  sectionKeyOf,
  splitCategoryKey,
  type FolderKey,
  type SectionKey,
} from "@/lib/cloud/names";
import { recordFolderFacts } from "@/lib/cloud/sources";
import { categoryFolderName } from "@/lib/cloud/categories";
import type { CloudConnection } from "@/lib/cloud/connection";

type Ready = CloudConnection & { drive_id: string; root_folder_id: string };

/** What a folder should be called and which folder it belongs in, or null if its thing is gone. */
async function plan(c: Ready, key: FolderKey): Promise<{ name: string; parent: FolderKey } | null> {
  if (key.startsWith("section:")) {
    const name = SECTION_NAMES[key.slice(8) as SectionKey];
    return name ? { name, parent: "root" } : null;
  }
  // A category inside a record's folder (Holiday, Spot Check, Documents ...).
  const cat = splitCategoryKey(key);
  if (cat) {
    const name = await categoryFolderName(c.company_id, cat.slug);
    return name ? { name, parent: cat.record } : null;
  }
  if (isBranchKey(key)) {
    const db = createServiceClient();
    const branchId = key.slice(key.lastIndexOf(":") + 1);
    const { data } = await db
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .eq("company_id", c.company_id)
      .maybeSingle<{ name: string }>();
    return data ? { name: branchFolderName(data.name), parent: sectionKeyOf(key) } : null;
  }
  if (isRecordKey(key)) {
    const facts = await recordFolderFacts(c.company_id, key);
    if (!facts) return null;
    // In its branch's folder; a record with no branch (none should have one) stays in the section.
    return {
      name: recordFolderName(facts.fullName, facts.n),
      parent: facts.branchId ? branchKey(key, facts.branchId) : sectionKeyOf(key),
    };
  }
  return null;
}

/** The folder a key sits in, asking the database for a record's branch. */
async function parentOf(c: Ready, key: FolderKey): Promise<FolderKey | null> {
  if (key === "root") return null;
  if (isRecordKey(key)) return (await plan(c, key))?.parent ?? sectionKeyOf(key);
  return parentKey(key);
}

function nameTaken(e: unknown): boolean {
  const err = e as { status?: number; code?: string };
  return err.status === 409 || err.code === "nameAlreadyExists";
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
  const want = await plan(c, key);
  if (!want) throw new Error("That record no longer exists, so it has no folder.");
  const { name, parent } = want;

  const { data: known } = await db
    .from("cloud_folders")
    .select("id, drive_item_id, name, parent_key")
    .eq("connection_id", c.id)
    .eq("folder_key", key)
    .maybeSingle<{ id: string; drive_item_id: string; name: string; parent_key: string | null }>();

  if (known) {
    try {
      if (verify) await getMsItem(token, c.drive_id, known.drive_item_id);

      /* A file going into a category folder first puts its RECORD's folder right: renamed, and in
         its branch. Without this a record whose category folders were all made already would
         never be looked at again, so a new name or a transfer would never reach the drive.
         Database reads only, unless something has actually changed. */
      if (splitCategoryKey(key)) await ensureFolder(c, token, parent, verify);

      if (isRecordKey(key)) {
        // The branch folder it belongs in (made if need be, and renamed if the branch was).
        const parentId = await ensureFolder(c, token, parent, verify);
        /* IN THE WRONG FOLDER: transferred to another branch, or made before branch folders
           existed (parent_key empty). The whole folder moves, everything inside it going with it
           (Phil, 2026-10-09, by popup), taking its new name in the same step. */
        if (known.parent_key !== parent) {
          try {
            await moveMsItem(token, c.drive_id, known.drive_item_id, parentId, known.name !== name ? name : undefined);
            await db
              .from("cloud_folders")
              .update({ parent_key: parent, name, updated_at: new Date().toISOString() })
              .eq("id", known.id);
          } catch (me) {
            if (me instanceof CloudNotFoundError) throw me;
            if (!nameTaken(me)) throw me;
            // A folder of that name is already in the branch (made by hand, or another record's).
            // Keep copying into this folder where it is, and try the move again next time.
            console.warn("[cloud] could not move a record folder into its branch yet, that name is taken:", name);
          }
          return known.drive_item_id;
        }
      }

      // A new name: the folder follows (Phil, 2026-10-08). Records and branches.
      if (known.name !== name && (isRecordKey(key) || isBranchKey(key))) {
        let renamed = true;
        try {
          await renameMsItem(token, c.drive_id, known.drive_item_id, name);
        } catch (re) {
          if (re instanceof CloudNotFoundError) throw re;
          // A folder of that name is already there (another record's, or one made by hand). Keep
          // copying into the folder it has always used, and try the rename again next time; the
          // remembered name stays the folder's REAL name, so nothing else can take it over.
          if (!nameTaken(re)) throw re;
          renamed = false;
          console.warn("[cloud] could not rename a folder yet, that name is taken:", name);
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

  const parentId = await ensureFolder(c, token, parent, verify);
  let made = await ensureMsFolder(token, c.drive_id, parentId, name);
  let madeName = name;
  /* NEVER ANOTHER RECORD'S FOLDER (review, 9 Oct 2026). ensureMsFolder adopts a folder that is
     already there with this name, which is right for a folder we made and lost track of, and
     wrong if that folder is another record's (a same named record whose number has just changed).
     Then a folder of its own is made, with whatever free name Microsoft gives it. */
  if (isRecordKey(key)) {
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
      parent_key: parent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,folder_key" },
  );
  /* A record's folder made for the first time gets its whole set of category folders (Phil,
     2026-10-09, by popup: all of them when the record folder is made). Queued, so the copy that
     needed the folder is not held up; the every minute run makes them. */
  if (isRecordKey(key)) {
    await db.from("cloud_sync_queue").upsert(
      { company_id: c.company_id, source_kind: "record_folder", source_id: key, dedupe_key: `record_folder_set:${key}` },
      { onConflict: "company_id,dedupe_key", ignoreDuplicates: true },
    );
  }
  return made.id;
}

/** Forget remembered folders for a key and its parents, after the drive said they are gone. */
export async function forgetFolderChain(c: Ready, key: FolderKey): Promise<void> {
  const db = createServiceClient();
  const keys: string[] = [];
  let k: FolderKey | null = key;
  while (k && k !== "root") {
    keys.push(k);
    k = await parentOf(c, k);
  }
  if (keys.length) await db.from("cloud_folders").delete().eq("connection_id", c.id).in("folder_key", keys);
}
