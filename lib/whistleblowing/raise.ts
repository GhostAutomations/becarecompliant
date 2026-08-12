"use server";

/**
 * Be Care Compliant — a member of staff raising a whistleblowing concern.
 *
 * Kept in its OWN file, away from lib/whistleblowing/actions.ts, because the caller here is
 * the opposite person: actions.ts is the Admin writing up a disclosure, this is the carer
 * making one. Nothing in this file may read the register.
 *
 * The insert goes through raise_whistleblowing_concern() (migration 0177), a SECURITY
 * DEFINER function, precisely so a Team Member needs no privilege on the table at all. The
 * company is resolved inside the function from auth.uid(): a company id from the browser is
 * never trusted, or a carer could file a disclosure into somebody else's company.
 */

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { DISCLOSURE_CATEGORIES } from "./types";

export async function raiseConcern(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "Your login is not attached to a company." };

  const disclosure = String(formData.get("disclosure") ?? "").trim();
  if (!disclosure) return { error: "Please describe the concern." };

  const rawCategory = String(formData.get("category") ?? "").trim();
  const category = (DISCLOSURE_CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory
    : "Other";

  // Default false. An untouched form, or a mis-click, must land on anonymous.
  const named = String(formData.get("named") ?? "") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("raise_whistleblowing_concern", {
    p_category: category,
    p_disclosure: disclosure,
    p_named: named,
  });
  if (error) return { error: error.message };

  /*
   * THE AUDIT ROW CARRIES NO ACTOR WHEN THE DISCLOSURE IS ANONYMOUS.
   *
   * Storing null in created_by and then writing the same person's id and email into
   * audit_log a line later would make the whole exercise theatre — and audit_log is
   * readable by people who cannot read the register. So an anonymous submission records
   * that a concern arrived and nothing about who brought it.
   *
   * What this does NOT protect against, and nobody should claim otherwise: a company small
   * enough that the timing gives it away, and the infrastructure request logs, which are
   * ours rather than the product's.
   */
  await writeAudit({
    companyId: profile.company_id,
    actorId: named ? user.id : undefined,
    actorEmail: named ? profile.email : undefined,
    actorRole: named ? profile.role : undefined,
    action: "whistleblowing.raised_by_staff",
    entityType: "whistleblowing_disclosure",
    summary: named
      ? "A concern was raised through the Team Member area"
      : "An anonymous concern was raised through the Team Member area",
    metadata: { anonymous: !named },
  });

  return { ok: "Sent" };
}
