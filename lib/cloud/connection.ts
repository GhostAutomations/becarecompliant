import "server-only";

/**
 * Be Care Compliant — a company's cloud drive connection (0437). Read and written with the
 * service role only; callers have already checked who is asking.
 *
 * getAccessToken keeps a short lived Microsoft access key (encrypted) and refreshes it from the
 * refresh token when it runs out. When Microsoft stops accepting the refresh token (the person
 * who connected changed their password, left, or the access was removed) the connection is
 * marked needs_reconnect and the company's Admins are emailed once a day until someone
 * reconnects. Nothing queued is lost meanwhile.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { openToken, sealToken } from "@/lib/cloud/crypto";
import { CloudAuthError, refreshMicrosoftToken } from "@/lib/cloud/microsoft";
import { claimNotification, settleNotifications } from "@/lib/notifications/log";
import { isSendableAddress, sendEmail } from "@/lib/email/resend";
import { escapeHtml, noticeEmailHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";

export type CloudConnection = {
  id: string;
  company_id: string;
  provider: "microsoft" | "google";
  status: "connected" | "needs_reconnect" | "disconnected";
  account_email: string | null;
  account_name: string | null;
  location_kind: "sharepoint" | "onedrive" | null;
  site_id: string | null;
  site_name: string | null;
  drive_id: string | null;
  root_folder_id: string | null;
  root_folder_url: string | null;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_copied_at: string | null;
  connected_by: string | null;
  connected_at: string;
};

export async function getCloudConnection(companyId: string): Promise<CloudConnection | null> {
  const db = createServiceClient();
  const { data } = await db.from("cloud_connections").select("*").eq("company_id", companyId).maybeSingle();
  return (data as CloudConnection | null) ?? null;
}

/** Ready to copy into: connected, a folder chosen, and keys held. */
export function isReady(c: CloudConnection | null): c is CloudConnection & { drive_id: string; root_folder_id: string } {
  return Boolean(c && c.status === "connected" && c.drive_id && c.root_folder_id && c.refresh_token_enc);
}

export async function getAccessToken(c: CloudConnection): Promise<string> {
  const db = createServiceClient();
  const expires = c.access_token_expires_at ? Date.parse(c.access_token_expires_at) : 0;
  if (c.access_token_enc && expires - Date.now() > 120_000) {
    try {
      return openToken(c.access_token_enc);
    } catch {
      // Fall through and refresh.
    }
  }
  if (!c.refresh_token_enc) throw new CloudAuthError("There is no stored connection. Connect again.");
  try {
    const t = await refreshMicrosoftToken(openToken(c.refresh_token_enc));
    await db
      .from("cloud_connections")
      .update({
        access_token_enc: sealToken(t.accessToken),
        access_token_expires_at: t.expiresAt.toISOString(),
        refresh_token_enc: sealToken(t.refreshToken),
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    return t.accessToken;
  } catch (e) {
    if (e instanceof CloudAuthError) await markNeedsReconnect(c, e.message);
    throw e;
  }
}

export async function recordCloudError(connectionId: string, message: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("cloud_connections")
    .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

/** The connection stopped working: show it red, and tell the Admins (once a day). */
export async function markNeedsReconnect(c: CloudConnection, reason: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("cloud_connections")
    .update({
      status: "needs_reconnect",
      access_token_enc: null,
      access_token_expires_at: null,
      last_error: reason.slice(0, 500),
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id)
    .eq("status", "connected");

  try {
    const { data: admins } = await db
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", c.company_id)
      .eq("role", "company_admin")
      .eq("status", "active");
    const day = new Date().toISOString().slice(0, 10);
    for (const a of (admins ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      if (!isSendableAddress(a.email)) continue;
      const subject = "Your cloud drive copies have stopped";
      const logId = await claimNotification({
        companyId: c.company_id,
        recipientProfileId: a.id,
        channel: "email",
        kind: "cloud_reconnect",
        dedupeKey: `cloud_reconnect:${c.company_id}:${a.id}:${day}`,
        toAddress: a.email as string,
        subject,
      });
      if (!logId) continue;
      const r = await sendEmail({
        to: a.email as string,
        subject,
        companyId: c.company_id,
        html: noticeEmailHtml({
          preheader: "Be Care Compliant can no longer copy documents into your Microsoft 365.",
          heading: "Your cloud drive needs connecting again",
          bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml((a.full_name ?? "").split(" ")[0] || "there")},</p>
            <p style="margin:0 0 12px;">Microsoft has stopped accepting Be Care Compliant's connection to your ${escapeHtml(c.site_name || "OneDrive")}. This usually happens when the person who connected it changes their password, leaves, or has their access removed.</p>
            <p style="margin:0;">Nothing is lost. New documents are waiting and will be copied as soon as an Admin connects it again in Settings.</p>`,
          ctaLabel: "Open cloud drive settings",
          ctaUrl: `${siteUrl()}/settings/cloud`,
        }),
      });
      await settleNotifications([logId], r.sent ? "sent" : "skipped", r.sent ? undefined : r.skippedReason ?? "Not sent");
    }
  } catch (e) {
    console.error("[cloud] could not email the admins:", (e as Error).message);
  }
}
