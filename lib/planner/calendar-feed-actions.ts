"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { PLANNER_ROLES } from "@/lib/planner/data";
import { ensureMyFeed, rotateMyFeed, deleteMyFeed } from "@/lib/planner/calendar-feed";

/**
 * Turning the Outlook link on, changing it, and turning it off.
 *
 * ALWAYS THE CALLER'S OWN. None of these take an id: the row is chosen by auth.uid() through
 * RLS, so there is no parameter to tamper with and no way to mint or revoke a link for somebody
 * else. That is worth more than a permission check, because it cannot be forgotten.
 *
 * WHAT THE AUDIT SAYS, AND WHAT IT DOES NOT. Creating and revoking a calendar key is a security
 * event and is logged. The TOKEN ITSELF IS NEVER WRITTEN to the audit log: an audit trail that
 * records the password defeats the rotation it is recording.
 */

export async function enableCalendarFeed(): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "planner");
  if (gate) return { error: gate };
  if (!PLANNER_ROLES.includes(profile.role)) return { error: "You do not have a planner." };

  try {
    await ensureMyFeed(user.id, profile.company_id);
  } catch {
    return { error: "Could not create the calendar link. Try again." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "planner.calendar_feed_created",
    entityType: "profile",
    entityId: user.id,
    summary: "Created their planner calendar subscription link.",
  });

  revalidatePath("/planner");
  return { ok: "Calendar link ready." };
}

export async function rotateCalendarFeed(): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!PLANNER_ROLES.includes(profile.role)) return { error: "You do not have a planner." };

  try {
    await rotateMyFeed();
  } catch {
    return { error: "Could not change the calendar link. Try again." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "planner.calendar_feed_rotated",
    entityType: "profile",
    entityId: user.id,
    summary: "Changed their planner calendar link, which stops the old one working.",
  });

  revalidatePath("/planner");
  return { ok: "New link created. The old one has stopped working." };
}

export async function disableCalendarFeed(): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!PLANNER_ROLES.includes(profile.role)) return { error: "You do not have a planner." };

  try {
    await deleteMyFeed();
  } catch {
    return { error: "Could not turn the calendar link off. Try again." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "planner.calendar_feed_deleted",
    entityType: "profile",
    entityId: user.id,
    summary: "Turned off their planner calendar link.",
  });

  revalidatePath("/planner");
  return { ok: "Calendar link turned off." };
}
