"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/billing/tier";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { listRegisterCheckColumns } from "@/lib/register/data";
import { MAX_REGISTER_COLUMNS } from "@/lib/register/custom-columns";

/**
 * Link a form to a compliance check (a register column) in its department, edited
 * from the Forms list. A form links to at most one column: setting a column points
 * that check at this form and clears this form from any other check. Past evidence
 * keeps the form it was completed on. Admin only (RLS also enforces it).
 */
export async function setFormColumnLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  // Business sees its forms read only (2026-10-01); pointing a form at a column is a builder job.
  const gated = await requireFeature(companyId, "form_builder");
  if (gated) return { error: gated };

  const formId = String(formData.get("form_id") ?? "").trim();
  const checkId = String(formData.get("check_id") ?? "").trim();
  if (!formId) return { error: "Missing form." };

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, population, name")
    .eq("id", formId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!form) return { error: "That form could not be found." };

  // A form links to at most one column: clear it from every check first.
  const { error: clearErr } = await supabase
    .from("check_definitions")
    .update({ form_id: null })
    .eq("company_id", companyId)
    .eq("form_id", formId);
  if (clearErr) return { error: clearErr.message };

  let summary = `Unlinked form "${form.name}" from all columns`;
  if (checkId) {
    const { data: check } = await supabase
      .from("check_definitions")
      .select("id, name, population")
      .eq("id", checkId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!check) return { error: "That column could not be found." };
    if ((check.population as string) !== (form.population as string)) {
      return { error: "That column is not in this form's department." };
    }
    const { data, error } = await supabase
      .from("check_definitions")
      .update({ form_id: formId })
      .eq("id", checkId)
      .eq("company_id", companyId)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "No change was saved." };
    summary = `Linked form "${form.name}" to the "${check.name}" column`;
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "form.column_linked",
    entityType: "form",
    entityId: formId,
    summary,
    metadata: { check_id: checkId || null },
  });

  revalidatePath("/settings/forms");
  return { ok: "Saved." };
}

/**
 * ADD A NEW COLUMN FROM THE FORMS LIST (Phil, 2 Oct 2026, popup "Yes, as described"). One step
 * instead of three: makes a recurring check for every active record in the form's department,
 * links this form to it, and shows it on the register straight away (Simple and Complex views
 * alike, which both draw the extra columns). The register shows at most MAX_REGISTER_COLUMNS extra
 * columns; past that the column is made but left hidden, and the reply says so and where to show it.
 * A form links to one column, so it is cleared from any other first (the dropdown has warned).
 */
export async function addFormColumn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  const gated = await requireFeature(companyId, "form_builder");
  if (gated) return { error: gated };

  const formId = String(formData.get("form_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "month") as "day" | "week" | "month" | "year";
  const interval = Number.parseInt(String(formData.get("interval") ?? ""), 10);
  const amberRaw = String(formData.get("amber_days") ?? "").trim();
  const amberDays = amberRaw === "" ? null : Number.parseInt(amberRaw, 10);
  if (!formId) return { error: "Missing form." };
  if (!name) return { error: "Give the column a name." };
  if (!["day", "week", "month", "year"].includes(frequency)) return { error: "Choose how often it recurs." };
  if (!Number.isInteger(interval) || interval < 1) return { error: "Recurs every must be a whole number of at least 1." };
  if (amberDays != null && (!Number.isInteger(amberDays) || amberDays < 0 || amberDays > 365)) {
    return { error: "Amber days must be a whole number between 0 and 365." };
  }

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, population, name, current_version")
    .eq("id", formId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!form) return { error: "That form could not be found." };
  const population = form.population as string;
  if (population !== "people" && population !== "service_users") {
    return { error: "Columns are for People and Service User forms." };
  }
  if (form.current_version == null) return { error: "Publish this form before giving it a column." };

  const before = await listRegisterCheckColumns(companyId, population);
  const shownBefore = before.filter((c) => c.show).length;

  const { error: clearErr } = await supabase
    .from("check_definitions")
    .update({ form_id: null })
    .eq("company_id", companyId)
    .eq("form_id", formId);
  if (clearErr) return { error: clearErr.message };

  const { data: newId, error } = await supabase.rpc("create_check_definition_with_form", {
    p_company_id: companyId,
    p_population: population,
    p_name: name,
    p_form_id: formId,
    p_frequency: frequency,
    p_interval: interval,
    p_amber_days: amberDays,
  });
  if (error) return { error: error.message };

  let shown = false;
  if (shownBefore < MAX_REGISTER_COLUMNS) {
    const { error: showErr } = await supabase
      .from("check_definitions")
      .update({ show_on_register: true })
      .eq("id", newId as string)
      .eq("company_id", companyId);
    shown = !showErr;
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check_definition.created",
    entityType: "check_definition",
    entityId: (newId as string) ?? null,
    summary: `Created the "${name}" column for form "${form.name}"`,
    metadata: { population, form_id: formId, frequency, interval, shown_on_register: shown },
  });

  revalidatePath("/settings/forms");
  revalidatePath("/settings/people");
  revalidatePath("/settings/service-users");
  revalidatePath(population === "people" ? "/people" : "/service-users");
  const where = population === "people" ? "People" : "Service Users";
  return {
    ok: shown
      ? `Added. ${name} is now a column on the ${where} register.`
      : `Added, but hidden: the ${where} register already shows ${MAX_REGISTER_COLUMNS} extra columns. Hide one in the register's Columns panel to show ${name}.`,
  };
}
