"use server";

/**
 * Be Care Compliant — Settings, Cloud drive (0437). Admins only (and the Founder), checked here
 * on every call; the tables themselves are server only.
 *
 *   findCloudSites       SharePoint sites the connected account can reach
 *   chooseCloudLocation  a site or their OneDrive: makes "Be Care Compliant" and its folders
 *   retryCloudFailures   puts failed copies back in the queue
 *   disconnectCloud      stops copying and forgets the keys (files already copied stay put)
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { getAccessToken, getCloudConnection } from "@/lib/cloud/connection";
import { ensureMsFolder, microsoftDriveFor, microsoftSites, type MsSite } from "@/lib/cloud/microsoft";
import { ROOT_FOLDER_NAME, SECTION_KEYS, type FolderKey } from "@/lib/cloud/names";
import { ensureFolder } from "@/lib/cloud/folders";
import { processCloudQueue } from "@/lib/cloud/worker";
import { queueEverything } from "@/lib/cloud/backfill";
import type { ActionState } from "@/lib/forms";

async function admin() {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) throw new Error("No company context.");
  return { user, profile, companyId: profile.company_id };
}

export async function findCloudSites(search: string): Promise<{ ok: true; sites: MsSite[] } | { ok: false; error: string }> {
  try {
    const { companyId } = await admin();
    const c = await getCloudConnection(companyId);
    if (!c || c.status !== "connected") return { ok: false, error: "Connect Microsoft 365 first." };
    const token = await getAccessToken(c);
    return { ok: true, sites: await microsoftSites(token, String(search ?? "").slice(0, 100)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "The sites could not be listed." };
  }
}

export async function chooseCloudLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { user, profile, companyId } = await admin();
    const c = await getCloudConnection(companyId);
    if (!c || c.status !== "connected") return { error: "Connect Microsoft 365 first." };
    const kind = String(formData.get("location_kind") ?? "");
    const siteId = String(formData.get("site_id") ?? "");
    const siteName = String(formData.get("site_name") ?? "").slice(0, 200);
    if (kind !== "onedrive" && kind !== "sharepoint") return { error: "Choose a SharePoint site or your OneDrive." };
    if (kind === "sharepoint" && !siteId) return { error: "Choose the SharePoint site." };

    const token = await getAccessToken(c);
    const drive = await microsoftDriveFor(token, kind === "onedrive" ? { kind } : { kind, siteId });
    const root = await ensureMsFolder(token, drive.driveId, "root", ROOT_FOLDER_NAME);

    const db = createServiceClient();
    // A new place: forget the folders remembered for the old one.
    // Copies already made went to the old place, so they are forgotten too: "Copy everything so far"
    // then fills the new place rather than skipping documents that only exist in the old one.
    if (c.drive_id && c.drive_id !== drive.driveId) {
      await db.from("cloud_folders").delete().eq("connection_id", c.id);
      await db.from("cloud_sync_queue").delete().eq("company_id", c.company_id).eq("status", "done");
    }
    const { data: updated, error } = await db
      .from("cloud_connections")
      .update({
        location_kind: kind,
        site_id: kind === "sharepoint" ? siteId : null,
        site_name: kind === "sharepoint" ? siteName || "SharePoint site" : "OneDrive",
        drive_id: drive.driveId,
        root_folder_id: root.id,
        root_folder_url: root.webUrl ?? drive.webUrl ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id)
      .select("*")
      .single();
    if (error) return { error: error.message };

    // The section folders straight away, so the company sees the shape before anything is copied.
    const ready = { ...(updated as typeof c), drive_id: drive.driveId, root_folder_id: root.id };
    for (const s of SECTION_KEYS) await ensureFolder(ready, token, `section:${s}` as FolderKey);

    await writeAudit({
      companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "cloud.location_chosen",
      entityType: "cloud_connection",
      entityId: c.id,
      summary: `Cloud drive copies go to ${kind === "onedrive" ? "OneDrive" : siteName || "a SharePoint site"}`,
    });
    revalidatePath("/settings/cloud");
    return { ok: "Done. The Be Care Compliant folder is ready." };
  } catch (e) {
    return { error: (e as Error).message || "That could not be set up." };
  }
}

export async function retryCloudFailures(_prev?: ActionState, _fd?: FormData): Promise<ActionState> {
  try {
    const { user, profile, companyId } = await admin();
    const db = createServiceClient();
    const { data, error } = await db
      .from("cloud_sync_queue")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), claimed_at: null })
      .eq("company_id", companyId)
      .eq("status", "failed")
      .select("id");
    if (error) return { error: error.message };
    const n = data?.length ?? 0;
    // Anything waiting on a reconnect gets tried now too.
    await db
      .from("cloud_sync_queue")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("status", "pending");
    await writeAudit({
      companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "cloud.retried",
      entityType: "cloud_connection",
      entityId: null,
      summary: `Retried ${n} cloud drive ${n === 1 ? "copy" : "copies"}`,
    });
    const r = await processCloudQueue({ companyId, limit: 20, budgetMs: 25_000 });
    revalidatePath("/settings/cloud");
    return { ok: `Trying again. ${r.copied} copied so far.` };
  } catch (e) {
    return { error: (e as Error).message || "That could not be retried." };
  }
}

export async function disconnectCloud(_prev?: ActionState, _fd?: FormData): Promise<ActionState> {
  try {
    const { user, profile, companyId } = await admin();
    const db = createServiceClient();
    const { error } = await db
      .from("cloud_connections")
      .update({
        status: "disconnected",
        refresh_token_enc: null,
        access_token_enc: null,
        access_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);
    if (error) return { error: error.message };
    // Nothing more will be copied, so nothing should sit waiting.
    await db.from("cloud_sync_queue").delete().eq("company_id", companyId);
    await writeAudit({
      companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "cloud.disconnected",
      entityType: "cloud_connection",
      entityId: null,
      summary: "Disconnected cloud drive copies",
    });
    revalidatePath("/settings/cloud");
    return { ok: "Disconnected. Files already copied stay in your drive." };
  } catch (e) {
    return { error: (e as Error).message || "That could not be disconnected." };
  }
}

/** "Copy everything so far": queue the company's whole history (safe to press twice). */
export async function copyEverythingSoFar(_prev?: ActionState, _fd?: FormData): Promise<ActionState> {
  try {
    const { user, profile, companyId } = await admin();
    const c = await getCloudConnection(companyId);
    if (!c || c.status !== "connected" || !c.drive_id) return { error: "Connect and choose where the folder lives first." };
    const n = await queueEverything(companyId);
    await writeAudit({
      companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "cloud.copy_everything",
      entityType: "cloud_connection",
      entityId: c.id,
      summary: `Asked for everything so far to be copied to the cloud drive (${n} documents and folders)`,
    });
    // Start straight away rather than waiting for the next cron run (every minute).
    after(() => processCloudQueue({ companyId, limit: 200, budgetMs: 25_000 }).catch(() => undefined));
    revalidatePath("/settings/cloud");
    return { ok: `Started. ${n} documents and folders are being copied in the background. This page shows how many are still waiting.` };
  } catch (e) {
    return { error: (e as Error).message || "That could not be started." };
  }
}
