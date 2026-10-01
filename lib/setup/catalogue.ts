import "server-only";

/**
 * The creation tick list's contents, read from the same tables the seed functions read
 * (default_check_definitions, form_templates, training_course_templates), so the list can never
 * offer something the seed would not create. Founder only: RLS on default_check_definitions
 * is is_platform_admin().
 */

import { createClient } from "@/lib/supabase/server";
import { columnsForCheck, FORM_COLUMNS } from "./defaults";

export type { SetupCheck, SetupForm, SetupCourse, SetupCatalogue } from "./defaults";
import type { SetupCheck, SetupCatalogue } from "./defaults";

export async function getSetupCatalogue(): Promise<SetupCatalogue> {
  const supabase = await createClient();
  const [checksRes, formsRes, coursesRes] = await Promise.all([
    supabase
      .from("default_check_definitions")
      .select("population, key, name, form_key, schedule_mode, locked_reason, sort_order")
      .order("population", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from("form_templates").select("key, name, locked_reason").eq("status", "active"),
    supabase
      .from("training_course_templates")
      .select("id, name, mandatory, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);
  if (checksRes.error) throw new Error(`The default checks could not be read: ${checksRes.error.message}`);
  if (formsRes.error) throw new Error(`The form library could not be read: ${formsRes.error.message}`);
  if (coursesRes.error) throw new Error(`The training courses could not be read: ${coursesRes.error.message}`);

  const forms = (formsRes.data ?? []) as Array<{ key: string; name: string; locked_reason: string | null }>;
  const formName = new Map(forms.map((f) => [f.key, f.name]));

  const checks = ((checksRes.data ?? []) as Array<{
    population: "people" | "service_users";
    key: string;
    name: string;
    form_key: string | null;
    schedule_mode: string;
    locked_reason: string | null;
  }>).map((c) => ({
    population: c.population,
    key: c.key,
    name: c.name,
    formName: c.form_key ? formName.get(c.form_key) ?? null : null,
    adHoc: c.schedule_mode === "ad_hoc",
    columns: columnsForCheck(c.population, c.key),
    lockedReason: c.locked_reason,
  }));

  const lockedForms = forms
    .filter((f): f is { key: string; name: string; locked_reason: string } => Boolean(f.locked_reason))
    .map((f) => ({ key: f.key, name: f.name, lockedReason: f.locked_reason, columns: FORM_COLUMNS[f.key] ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const courses = ((coursesRes.data ?? []) as Array<{ id: string; name: string; mandatory: boolean }>).map((c) => ({
    id: c.id,
    name: c.name,
    mandatory: c.mandatory,
  }));

  return { checks, lockedForms, courses };
}
