"use server";

/**
 * Be Care Compliant — absence discounting server actions (0328).
 *
 * Discount an absence, or count it again.
 * Managers and above only: checked here for a clear message, and enforced by the database
 * (can_discount_absence inside each SECURITY DEFINER function, and a trigger that refuses any
 * direct edit of the discount columns). Every change is written to the audit log.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { ukDate } from "@/lib/dates";
import type { ActionState } from "@/lib/forms";
import { canDiscountAbsences, discountReasonProblem } from "@/lib/absence/discount";

const NOT_ALLOWED = "Only a Manager or above can discount absences.";

function refresh(personId: string | null) {
  revalidatePath("/people/absence");
  revalidatePath("/dashboard");
  if (personId) revalidatePath(`/people/${personId}`);
}

/** Discount one or more absences with one reason. Safe to press twice: an absence that is
 *  already discounted keeps its first reason. */
export async function discountAbsences(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!canDiscountAbsences(profile.role)) return { error: NOT_ALLOWED };

  const ids = [...new Set(formData.getAll("absence_id").map(String).filter(Boolean))];
  if (ids.length === 0) return { error: "Tick the absences to discount." };
  const reason = String(formData.get("reason") ?? "").trim();
  const problem = discountReasonProblem(reason);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("absence_events")
    .select("id, person_id, company_id, start_date, discounted_at")
    .in("id", ids);
  const found = (rows ?? []) as Array<{ id: string; person_id: string; company_id: string; start_date: string; discounted_at: string | null }>;
  if (found.length !== ids.length) return { error: "One of those absences could not be found." };

  let done = 0;
  for (const ev of found) {
    if (ev.discounted_at) continue;
    const { error } = await supabase.rpc("discount_absence", { p_id: ev.id, p_reason: reason });
    if (error) {
      refresh(ev.person_id);
      return { error: done > 0 ? `${done} discounted, then: ${error.message}` : error.message };
    }
    done += 1;
    await writeAudit({
      companyId: ev.company_id,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "absence.discounted",
      entityType: "person",
      entityId: ev.person_id,
      summary: `Discounted the absence of ${ukDate(ev.start_date)}: ${reason}`,
      metadata: { absence_id: ev.id, reason },
    });
  }

  refresh(found[0]?.person_id ?? null);
  if (done === 0) return { ok: "Already discounted." };
  return { ok: done === 1 ? "Absence discounted." : `${done} absences discounted.` };
}

/** Count a discounted absence again. */
export async function restoreAbsence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!canDiscountAbsences(profile.role)) return { error: NOT_ALLOWED };
  const id = String(formData.get("absence_id") ?? "");
  if (!id) return { error: "Missing absence." };

  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("absence_events")
    .select("person_id, company_id, start_date, discount_reason")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return { error: "That absence could not be found." };

  const { error } = await supabase.rpc("restore_absence", { p_id: id });
  if (error) return { error: error.message };

  await writeAudit({
    companyId: ev.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.discount_removed",
    entityType: "person",
    entityId: ev.person_id as string,
    summary: `Counted the absence of ${ukDate(ev.start_date as string)} again`,
    metadata: { absence_id: id, previous_reason: ev.discount_reason ?? null },
  });
  refresh(ev.person_id as string);
  return { ok: "The absence counts again." };
}
