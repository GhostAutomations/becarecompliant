"use server";

/**
 * Personal outcomes actions for a Service User. Manager+ via RLS. Save replaces the
 * whole list (like the care plan): rows of statement, status, last reviewed and note.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import type { OutcomeStatus } from "./outcome-consts";

const STATUSES: OutcomeStatus[] = ["achieved", "progressing", "working_towards", "no_longer_relevant"];

type Row = { statement: string; status: OutcomeStatus; last_reviewed: string | null; review_note: string | null };

function parseRows(formData: FormData): Row[] | null {
  try {
    const parsed = JSON.parse(String(formData.get("outcomes") ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => {
        const o = r as Record<string, unknown>;
        const status = String(o.status ?? "working_towards") as OutcomeStatus;
        const reviewed = String(o.last_reviewed ?? "");
        return {
          statement: String(o.statement ?? "").trim().slice(0, 500),
          status: STATUSES.includes(status) ? status : "working_towards",
          last_reviewed: /^\d{4}-\d{2}-\d{2}$/.test(reviewed) ? reviewed : null,
          review_note: (String(o.review_note ?? "").trim().slice(0, 1000)) || null,
        };
      })
      .filter((r) => r.statement !== "");
  } catch {
    return null;
  }
}

export async function saveOutcomes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  if (!serviceUserId) return { error: "Missing service user." };

  const rows = parseRows(formData);
  if (rows === null) return { error: "Could not read the outcomes." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("company_id")
    .eq("id", serviceUserId)
    .maybeSingle();
  if (!su) return { error: "Service user not found." };

  const { error: delErr } = await supabase
    .from("service_user_outcomes")
    .delete()
    .eq("service_user_id", serviceUserId);
  if (delErr) return { error: "Could not save. Check your access and try again." };

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("service_user_outcomes").insert(
      rows.map((r, i) => ({
        company_id: su.company_id,
        service_user_id: serviceUserId,
        statement: r.statement,
        status: r.status,
        last_reviewed: r.last_reviewed,
        review_note: r.review_note,
        position: i,
        created_by: profile.id,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })),
    );
    if (insErr) return { error: "Could not save the outcomes. Please try again." };
  }

  await writeAudit({
    companyId: su.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcomes_saved",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Updated personal outcomes (${rows.length})`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath(`/service-users/${serviceUserId}`);
  return { ok: "Saved" };
}
