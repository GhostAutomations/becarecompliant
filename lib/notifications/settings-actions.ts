"use server";

/**
 * Notification settings server actions (Company Admin only).
 *  - saveNotificationSettings : channel switches + chaser thresholds (upsert,
 *    RLS allows admins to write their own company's row).
 *  - saveUserPhone : sets the SMS number for a Manager/Admin in the company.
 *    Uses the service client behind requireCompanyAdmin with an explicit
 *    same-company ownership check (profiles RLS does not let admins update
 *    other profiles directly).
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

export async function saveNotificationSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };

  const emailDigest = formData.get("email_digest_enabled") === "on";
  const smsEnabled = formData.get("sms_enabled") === "on";
  const first = clampDays(formData.get("chaser_first_days"), 7);
  const second = clampDays(formData.get("chaser_second_days"), 14);
  const smsDays = clampDays(formData.get("sms_overdue_days"), 14);
  if (second <= first) {
    return { error: "The second chaser must be later than the first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      company_id: profile.company_id,
      email_digest_enabled: emailDigest,
      sms_enabled: smsEnabled,
      chaser_first_days: first,
      chaser_second_days: second,
      sms_overdue_days: smsDays,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: `Settings could not be saved: ${error.message}` };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "notification_settings.updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated notification settings",
    metadata: {
      email_digest_enabled: emailDigest,
      sms_enabled: smsEnabled,
      chaser_first_days: first,
      chaser_second_days: second,
      sms_overdue_days: smsDays,
    },
  });

  revalidatePath("/settings/notifications");
  return { ok: "Notification settings saved." };
}

export async function saveUserPhone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };

  const targetId = String(formData.get("profile_id") ?? "");
  const rawPhone = String(formData.get("phone") ?? "").trim();
  if (!targetId) return { error: "Missing user." };
  if (rawPhone && !/^\+[1-9]\d{7,14}$/.test(rawPhone)) {
    return { error: "Enter the number in international format, for example +447700900123." };
  }

  // Ownership check before the privileged write: the target must be an active
  // Manager or Admin in THIS admin's company.
  const service = createServiceClient();
  const { data: target } = await service
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || target.company_id !== profile.company_id) {
    return { error: "That user is not in your company." };
  }
  if (!["company_admin", "manager"].includes(target.role as string)) {
    return { error: "SMS numbers are only held for Managers and Admins." };
  }

  const { error } = await service
    .from("profiles")
    .update({ phone: rawPhone || null })
    .eq("id", targetId);
  if (error) return { error: `The number could not be saved: ${error.message}` };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "profile.phone_updated",
    entityType: "profile",
    entityId: targetId,
    summary: rawPhone ? "Set an SMS number" : "Removed an SMS number",
  });

  revalidatePath("/settings/notifications");
  return { ok: rawPhone ? "Number saved." : "Number removed." };
}

function clampDays(value: FormDataEntryValue | null, fallback: number): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 365) return fallback;
  return n;
}
