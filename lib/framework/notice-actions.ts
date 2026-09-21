"use server";

/**
 * Be Care Compliant — recording the regulator's own notices from an inspection.
 *
 * Why these exist is in migration 0306: CIW's one fixed rating rule is that a Priority Action
 * Notice makes its theme Requires significant improvement, and BCC had nowhere to put one.
 * RLS (inspection_notices_*) is the guard; the checks here are for a clear message.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function text(fd: FormData, key: string): string | null {
  const s = String(fd.get(key) ?? "").trim();
  return s === "" ? null : s;
}

export async function addInspectionNotice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };

  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle();
  const regulator = ((co?.regulator as string | null) ?? "ciw") as "ciw" | "cqc";

  const code = text(fd, "requirement_code");
  const kind = text(fd, "kind");
  const description = text(fd, "description");
  const issuedOn = text(fd, "issued_on");
  const dueBy = text(fd, "due_by");
  if (!code) return { error: "Choose the theme it was issued under." };
  if (kind !== "priority_action" && kind !== "area_for_improvement") return { error: "Choose the kind of notice." };
  if (!description) return { error: "Say what the notice requires." };
  if (!issuedOn || !ISO.test(issuedOn)) return { error: "Enter the date it was issued." };
  if (dueBy && !ISO.test(dueBy)) return { error: "Enter a valid date it is due to be put right by." };

  const { data: req } = await supabase
    .from("framework_requirements")
    .select("code")
    .eq("regulator", regulator)
    .eq("code", code)
    .maybeSingle();
  if (!req) return { error: "That theme was not found." };

  const { data, error } = await supabase
    .from("inspection_notices")
    .insert({
      company_id: companyId,
      regulator,
      requirement_code: code,
      kind,
      regulation: text(fd, "regulation"),
      description,
      issued_on: issuedOn,
      due_by: dueBy,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "The notice could not be saved." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "inspection_notice.recorded",
    entityType: "inspection_notice",
    entityId: data.id as string,
    summary: `Recorded a ${kind === "priority_action" ? "Priority Action Notice" : "Area for Improvement"} under ${code}`,
  });

  revalidatePath("/readiness");
  revalidatePath("/dashboard");
  return { ok: "Recorded." };
}

/** Put right, or reopened. `resolved_on` blank reopens it. */
export async function setInspectionNoticeResolved(fd: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return;
  const id = text(fd, "id");
  const resolvedOn = text(fd, "resolved_on");
  if (!id || (resolvedOn && !ISO.test(resolvedOn))) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("inspection_notices")
    .update({ resolved_on: resolvedOn, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id");
  if (!data || data.length === 0) return;

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: resolvedOn ? "inspection_notice.resolved" : "inspection_notice.reopened",
    entityType: "inspection_notice",
    entityId: id,
    summary: resolvedOn ? `Marked a notice as put right on ${resolvedOn}` : "Reopened a notice",
  });
  revalidatePath("/readiness");
  revalidatePath("/dashboard");
}
