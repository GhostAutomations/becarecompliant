"use server";

/**
 * Be Care Compliant — Training write actions (Admins and branch Managers only;
 * RLS enforces it again at the row). Records or clears a person's course result,
 * with an optional certificate upload to the private bucket. No dashes in copy.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { uploadTrainingCertificate } from "@/lib/training/storage";
import type { ActionState } from "@/lib/forms";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveTraining(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    return { error: "Only Admins and Managers can record training." };
  }

  const personId = String(formData.get("person_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  if (!personId || !courseId) return { error: "Missing person or course." };

  const supabase = await createClient();

  // Resolve the person through RLS: a manager who cannot see this person (wrong
  // branch) gets no row back, which authorises the write by branch, not just company.
  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, branch_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person || person.company_id !== profile.company_id) {
    return { error: "That person is not in your view." };
  }

  // Confirm the course belongs to this company.
  const { data: course } = await supabase
    .from("training_courses")
    .select("id, name")
    .eq("id", courseId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!course) return { error: "Unknown course." };

  if (intent === "clear") {
    const { error } = await supabase
      .from("person_training")
      .delete()
      .eq("person_id", personId)
      .eq("course_id", courseId);
    if (error) return { error: error.message };
    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "training.cleared",
      entityType: "training",
      entityId: personId,
      summary: `Cleared ${course.name} training`,
      metadata: { course_id: courseId },
    });
    revalidatePath("/people/training");
    return { ok: "Training cleared." };
  }

  const completedRaw = String(formData.get("completed_on") ?? "").trim();
  const expiryRaw = String(formData.get("expiry_on") ?? "").trim();
  const completed = ISO_RE.test(completedRaw) ? completedRaw : null;
  const expiry = ISO_RE.test(expiryRaw) ? expiryRaw : null;
  if (!completed && !expiry) {
    return { error: "Enter a completed date or a renewal date, or use Clear." };
  }

  const { data: up, error } = await supabase
    .from("person_training")
    .upsert(
      {
        company_id: person.company_id,
        branch_id: person.branch_id,
        person_id: personId,
        course_id: courseId,
        status: "completed",
        completed_on: completed,
        expiry_on: expiry,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "person_id,course_id" },
    )
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };

  // Optional certificate upload.
  const file = formData.get("certificate");
  if (up && file && typeof file !== "string" && file.size > 0) {
    const res = await uploadTrainingCertificate(person.company_id, up.id, file);
    if (!res.ok) return { error: res.error };
    await supabase.from("person_training").update({ certificate_path: res.path }).eq("id", up.id);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "training.updated",
    entityType: "training",
    entityId: personId,
    summary: `Recorded ${course.name} training`,
    metadata: { course_id: courseId, completed_on: completed, expiry_on: expiry },
  });
  revalidatePath("/people/training");
  return { ok: "Training saved." };
}

/** Create or update a training course in the company catalogue. Admins only. */
export async function saveCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!["platform_admin", "company_admin"].includes(profile.role)) {
    return { error: "Only Admins can change training courses." };
  }
  const companyId = profile.company_id;

  const courseId = String(formData.get("course_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the course a name." };

  const renewalRaw = String(formData.get("renewal_months") ?? "").trim();
  let renewal: number | null = null;
  if (renewalRaw !== "") {
    const n = Number.parseInt(renewalRaw, 10);
    if (!Number.isInteger(n) || n < 1) return { error: "Renewal months must be a whole number, or blank for one off." };
    renewal = n;
  }
  const amberRaw = String(formData.get("amber_days") ?? "").trim();
  const amber = amberRaw === "" ? 30 : Number.parseInt(amberRaw, 10);
  if (!Number.isInteger(amber) || amber < 0) return { error: "Amber days must be zero or more." };

  const patch = {
    name,
    renewal_months: renewal,
    mandatory: String(formData.get("mandatory") ?? "") === "on",
    is_safeguarding: String(formData.get("is_safeguarding") ?? "") === "on",
    amber_days: amber,
    active: String(formData.get("active") ?? "") === "on",
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  if (courseId) {
    const { error } = await supabase
      .from("training_courses")
      .update(patch)
      .eq("id", courseId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase
      .from("training_courses")
      .select("sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort = (last?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from("training_courses")
      .insert({ company_id: companyId, sort_order: sort, ...patch });
    if (error) return { error: error.message };
  }

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: courseId ? "training.course_updated" : "training.course_created",
    entityType: "training",
    entityId: courseId || null,
    summary: `${courseId ? "Updated" : "Added"} training course ${name}`,
    metadata: { renewal_months: renewal },
  });
  revalidatePath("/settings/people");
  revalidatePath("/people/training");
  return { ok: "Course saved." };
}
