"use server";

/**
 * Be Care Compliant — Whistleblowing server actions (THE LIST item 21, increment 2).
 *
 * RLS is the guard (0174 as amended by 0175): platform admin, Company Admin, Responsible
 * Individual. The role check here only turns a database refusal into a sentence.
 *
 * Available on every tier including Business: a whistleblowing procedure is a legal
 * expectation of any provider, not an upsell.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { DISCLOSURE_STATUSES, type DisclosureStatus } from "./types";
import { todayIso } from "./logic";

const MANAGE_ROLES = ["company_admin", "registered_individual"];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function checked(v: FormDataEntryValue | null): boolean {
  return String(v ?? "") === "on" || String(v ?? "") === "true";
}

/**
 * The disclosure's identity fields.
 *
 * When the disclosure is anonymous the name is DISCARDED, not hidden: the column is
 * written null. If the name were kept and merely not rendered, it would still be in the
 * export, in the backup, and in any future screen somebody adds without thinking. The
 * only way to keep an anonymous disclosure anonymous is to not hold the name.
 *
 * The checkbox on the form reads "the discloser gave their name", so an unticked box —
 * which is what an untouched form posts — means anonymous. Defaulting the other way would
 * make a mis-click the thing that unmasks somebody.
 */
function identityFields(formData: FormData) {
  const named = checked(formData.get("named"));
  return {
    anonymous: !named,
    discloser_name: named ? trimOrNull(formData.get("discloser_name")) : null,
    /*
     * created_by IS CLEARED TOO when the disclosure becomes anonymous (migration 0178).
     *
     * Found on the live site by looking at the rows rather than the code. A disclosure
     * raised through the Team Member area under the person's own name carried their user
     * id here; unticking the box cleared discloser_name and left that foreign key pointing
     * straight at them. "The name is deleted, not hidden" was then only true of one column.
     *
     * On an Admin-typed record this discards which Admin typed it, which is a real if small
     * loss - and audit_log has it. Worth it for a rule with no exceptions: an anonymous
     * disclosure holds no identity in any column.
     */
    ...(named ? {} : { created_by: null }),
  };
}

export async function createDisclosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to record whistleblowing disclosures." };
  }
  const companyId = profile.company_id;

  const received_on = isoDateOrNull(formData.get("received_on"));
  const category = String(formData.get("category") ?? "").trim();
  const disclosure = String(formData.get("disclosure") ?? "").trim();
  if (!received_on) return { error: "Enter the date the disclosure was received." };
  if (!category) return { error: "Choose a category." };
  if (!disclosure) return { error: "Record what was disclosed." };

  const identity = identityFields(formData);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("whistleblowing_disclosures")
    .insert({
      company_id: companyId,
      branch_id: trimOrNull(formData.get("branch_id")),
      received_on,
      category,
      disclosure,
      action_taken: trimOrNull(formData.get("action_taken")),
      status: "open",
      // Who typed it up. LAST, so the spread below can null it: an anonymous disclosure
      // holds no identity in any column, and this Admin's id is still in audit_log.
      created_by: user.id,
      ...identity,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // The audit summary carries the category and nothing else. The audit log is readable by
  // people who cannot read the disclosures themselves, so it must not restate them.
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "whistleblowing.created",
    entityType: "whistleblowing_disclosure",
    entityId: row.id,
    summary: `Recorded a whistleblowing disclosure (${category})`,
    metadata: { category, anonymous: identity.anonymous },
  });

  revalidatePath("/whistleblowing");
  return { ok: "Recorded", redirectTo: `/whistleblowing/${row.id}` };
}

export async function updateDisclosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to edit whistleblowing disclosures." };
  }
  const id = String(formData.get("disclosure_id") ?? "").trim();
  if (!id) return { error: "Missing disclosure." };

  const received_on = isoDateOrNull(formData.get("received_on"));
  const category = String(formData.get("category") ?? "").trim();
  const disclosure = String(formData.get("disclosure") ?? "").trim();
  if (!received_on) return { error: "Enter the date the disclosure was received." };
  if (!category) return { error: "Choose a category." };
  if (!disclosure) return { error: "Record what was disclosed." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("whistleblowing_disclosures")
    .update({
      branch_id: trimOrNull(formData.get("branch_id")),
      received_on,
      ...identityFields(formData),
      category,
      disclosure,
      action_taken: trimOrNull(formData.get("action_taken")),
      outcome: trimOrNull(formData.get("outcome")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "whistleblowing.updated",
    entityType: "whistleblowing_disclosure",
    entityId: id,
    summary: "Updated a whistleblowing disclosure",
  });

  revalidatePath(`/whistleblowing/${id}`);
  revalidatePath("/whistleblowing");
  return { ok: "Saved" };
}

export async function setDisclosureStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) {
    return { error: "You do not have permission to change a disclosure." };
  }
  const id = String(formData.get("disclosure_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as DisclosureStatus;
  if (!id) return { error: "Missing disclosure." };
  if (!DISCLOSURE_STATUSES.includes(status)) return { error: "Choose a status." };

  const closed_on =
    status === "closed" ? isoDateOrNull(formData.get("closed_on")) ?? todayIso() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("whistleblowing_disclosures")
    .update({ status, closed_on, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "whistleblowing.status_changed",
    entityType: "whistleblowing_disclosure",
    entityId: id,
    summary: `Whistleblowing disclosure marked ${status.replace("_", " ")}`,
    metadata: { status },
  });

  revalidatePath(`/whistleblowing/${id}`);
  revalidatePath("/whistleblowing");
  return { ok: "Saved" };
}
