import "server-only";

/**
 * Be Care Compliant — the category folder each copied file goes in, inside its record's folder
 * (Phil, 2026-10-09: "when a folder is set up for a person, there's a holiday folder, a spot check
 * folder, a supervision folder, probation folder, appraisal folder, training folder ... a document
 * folder ... the same for service users").
 *
 * Decided by popup: one folder per check, named like the check (Supervision, Spot Check, Audit,
 * Care Plan Review ...); fixed folders for Holiday, Absence, Training, Documents, DBS, Right to
 * Work, Probation and, on a service user, Care Plan; anything left over in a folder named after
 * its form, so nothing is ever loose. The whole set is made when the record's folder is made, and
 * files already copied flat are moved into them.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  CATEGORY_NAMES,
  PERSON_FIXED_CATEGORIES,
  SERVICE_USER_FIXED_CATEGORIES,
  categoryForFormKey,
  categoryKey,
  safeDriveName,
  type FolderKey,
  type RecordKey,
} from "@/lib/cloud/names";

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** A form's file: the check that uses the form, else the fixed category its key names, else its own. */
async function evidenceSlug(companyId: string, recordType: string, formId: string | null, formKey: string | null): Promise<string> {
  if (formId) {
    const db = createServiceClient();
    const { data } = await db
      .from("check_definitions")
      .select("id, active, sort_order")
      .eq("company_id", companyId)
      .eq("form_id", formId)
      .eq("population", recordType === "person" ? "people" : "service_users")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1);
    const def = ((data ?? []) as Array<{ id: string }>)[0];
    if (def) return `check-${def.id}`;
  }
  const fixed = categoryForFormKey(formKey, recordType);
  if (fixed) return fixed;
  return formId ? `form-${formId}` : "documents";
}

async function evidenceTarget(companyId: string, evidenceId: string): Promise<FolderKey | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("evidence")
    .select("record_type, record_id, form_id, forms(key)")
    .eq("id", evidenceId)
    .eq("company_id", companyId)
    .maybeSingle<{ record_type: string; record_id: string; form_id: string | null; forms: One<{ key: string | null }> }>();
  if (!data || (data.record_type !== "person" && data.record_type !== "service_user")) return null;
  const record = `${data.record_type}:${data.record_id}` as RecordKey;
  return categoryKey(record, await evidenceSlug(companyId, data.record_type, data.form_id, one(data.forms)?.key ?? null));
}

/**
 * The category folder a copy goes in, or null when it is not a person's or service user's file
 * (a policy, a briefing, a complaint), which stays exactly where it went before.
 */
export async function categoryTargetFor(companyId: string, kind: string, sourceId: string): Promise<FolderKey | null> {
  const db = createServiceClient();
  switch (kind) {
    case "evidence":
      return evidenceTarget(companyId, sourceId);
    case "evidence_file":
      return evidenceTarget(companyId, sourceId.split("|")[0] ?? "");
    case "training_cert": {
      const { data } = await db.from("person_training").select("person_id").eq("id", sourceId).eq("company_id", companyId).maybeSingle<{ person_id: string }>();
      return data ? categoryKey(`person:${data.person_id}`, "training") : null;
    }
    case "meeting_letter":
    case "outcome_letter": {
      const table = kind === "meeting_letter" ? "absence_meeting_letters" : "absence_outcome_letters";
      const { data } = await db.from(table).select("person_id").eq("id", sourceId).eq("company_id", companyId).maybeSingle<{ person_id: string }>();
      return data ? categoryKey(`person:${data.person_id}`, "absence") : null;
    }
    case "care_plan":
      return categoryKey(`service_user:${sourceId}`, "care-plan");
    case "record_document": {
      const { data } = await db
        .from("record_documents")
        .select("person_id, service_user_id")
        .eq("id", sourceId)
        .eq("company_id", companyId)
        .maybeSingle<{ person_id: string | null; service_user_id: string | null }>();
      if (!data) return null;
      return data.person_id ? categoryKey(`person:${data.person_id}`, "documents") : categoryKey(`service_user:${data.service_user_id}`, "documents");
    }
    default:
      return null;
  }
}

/** Every category folder a record gets when its folder is made: the fixed ones and one per check it has. */
export async function recordCategorySet(companyId: string, record: RecordKey): Promise<FolderKey[]> {
  const isPerson = record.startsWith("person:");
  const id = record.slice(record.indexOf(":") + 1);
  const db = createServiceClient();
  const { data } = await db
    .from("check_instances")
    .select("definition_id, check_definitions!inner(active)")
    .eq("company_id", companyId)
    .eq(isPerson ? "person_id" : "service_user_id", id)
    .eq("active", true);
  const defs = [
    ...new Set(
      ((data ?? []) as Array<{ definition_id: string; check_definitions: One<{ active: boolean }> }>)
        .filter((r) => one(r.check_definitions)?.active !== false)
        .map((r) => r.definition_id),
    ),
  ];
  const fixed = isPerson ? PERSON_FIXED_CATEGORIES : SERVICE_USER_FIXED_CATEGORIES;
  return [...fixed.map((s) => categoryKey(record, s)), ...defs.map((d) => categoryKey(record, `check-${d}`))];
}

/** The name a category folder should have: the fixed name, the check's name, or the form's name. */
export async function categoryFolderName(companyId: string, slug: string): Promise<string | null> {
  if (CATEGORY_NAMES[slug]) return CATEGORY_NAMES[slug];
  const db = createServiceClient();
  if (slug.startsWith("check-")) {
    const { data } = await db.from("check_definitions").select("name").eq("id", slug.slice(6)).eq("company_id", companyId).maybeSingle<{ name: string }>();
    return data ? safeDriveName(data.name, "Check") : null;
  }
  if (slug.startsWith("form-")) {
    // Not narrowed by company: a form can be a library form shared by every company.
    const { data } = await db.from("forms").select("name").eq("id", slug.slice(5)).maybeSingle<{ name: string }>();
    return data ? safeDriveName(data.name, "Forms") : null;
  }
  return null;
}
