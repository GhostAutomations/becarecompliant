"use server";

/**
 * Be Care Compliant — Service Users (Phase 4) server actions.
 *
 * The compliance loop lives in completeCheck: complete a Form -> Evidence via the
 * shared submitEvidence pipeline (record_type='service_user') -> complete_check
 * advances the Check (stamps completion, stores the evidence link, sets the next
 * due date from the shared recurrence engine). Everything is idempotent.
 *
 * Special-category data: reads of a Service User Record and its evidence are audit
 * logged in the pages that render them (writeAudit), not just writes here.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany, requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { profilesById } from "@/lib/auth/company-profiles";
import { writeAudit } from "@/lib/audit";
import { sendCalendarInvite } from "@/lib/notifications/invites";
import { escapeHtml } from "@/lib/email/templates";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { applyRetentionForRecord } from "@/lib/evidence/retention";
import { type Answers, type FormSchema, firstDateFieldKey, isFormSchema } from "@/lib/form-schema";
import { formCompletesCheck } from "@/lib/form-validate";
import { closeBookingsForCheck } from "@/lib/planner/close-booking";
import { rebakeFormFieldOptions } from "@/lib/forms/rebake-options";
import { ensurePrivateInvoicingFromSetup } from "@/lib/invoicing/ensure-private-invoicing";
import { seedCarePlanFromSetup } from "./seed-care-plan";
import type { ActionState } from "@/lib/forms";
import type { CheckDefinition } from "@/lib/people/types";
import { parseCivilDate } from "@/lib/recurrence";
import { nextDueAfterCompletion } from "@/lib/people/logic";
import {
  listServiceUserCheckDefinitions,
  getPublishedFormVersion,
} from "./data";
import { initialDueDate, todayIso, addDaysToIso } from "./logic";
import { carersOf, handedFromCarers } from "./care-plan-consts";
import { CALL_SLOTS } from "./care-package";

const SLOTS: string[] = CALL_SLOTS.map((s) => s.value);
import { SU_REGISTER_COLUMNS } from "./types";
import { uploadCarePlanFile, signCarePlan } from "./care-plan";

/** The branch Service User type + company Complex review interval, so care plan
 *  reviews on a Complex branch schedule at the Complex cadence (default 80 days). */
async function complexReviewContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  branchId: string,
): Promise<{ isComplex: boolean; intervalDays: number }> {
  const [{ data: branch }, { data: def }] = await Promise.all([
    supabase.from("branches").select("service_user_type").eq("id", branchId).maybeSingle(),
    supabase
      .from("check_definitions")
      .select("interval")
      .eq("company_id", companyId)
      .eq("population", "service_users")
      .eq("key", "care_plan_review")
      .maybeSingle(),
  ]);
  const days = def?.interval as number | null;
  return {
    isComplex: (branch?.service_user_type as string | null) === "complex",
    /* ONE cadence for both views (Phil, 2026-09-04): the Care Plan Review's own. */
    intervalDays: typeof days === "number" && days >= 1 ? days : 90,
  };
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const INVOICE_TO = ["service_user", "nhs", "solicitor", "next_of_kin", "other"];

/** Parse and validate the private invoicing fields from an SU form. Returns the
 *  db values, or an error string when the chosen delivery method lacks its
 *  required contact detail (email needs an email, post needs an address). */
function invoicingFieldsFromForm(
  formData: FormData,
): { values: Record<string, unknown>; error?: undefined } | { error: string; values?: undefined } {
  const on = formData.get("private_invoicing") === "on";
  if (!on) {
    return {
      values: {
        private_invoicing: false,
        invoice_to: null,
        invoice_contact_name: null,
        invoice_address: null,
        invoice_phone: null,
        invoice_email: null,
        invoice_delivery: null,
      },
    };
  }
  const invoice_to_raw = String(formData.get("invoice_to") ?? "").trim();
  const invoice_to = INVOICE_TO.includes(invoice_to_raw) ? invoice_to_raw : "service_user";
  const deliveryRaw = String(formData.get("invoice_delivery") ?? "").trim();
  const invoice_delivery = deliveryRaw === "post" ? "post" : "email";
  const invoice_email = trimOrNull(formData.get("invoice_email"));
  const invoice_address = trimOrNull(formData.get("invoice_address"));
  if (invoice_delivery === "email" && !invoice_email) {
    return { error: "Add an email address to invoice this service user by email." };
  }
  if (invoice_delivery === "post" && !invoice_address) {
    return { error: "Add an address to invoice this service user by post." };
  }
  return {
    values: {
      private_invoicing: true,
      invoice_to,
      invoice_contact_name: trimOrNull(formData.get("invoice_contact_name")),
      invoice_address,
      invoice_phone: trimOrNull(formData.get("invoice_phone")),
      invoice_email,
      invoice_delivery,
    },
  };
}

/** Create a Service User Record and auto-apply the company's active SU checks, each
 *  with its initial due date computed from the package start date. */
export async function createServiceUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const full_name = String(formData.get("full_name") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!full_name) return { error: "Enter the service user's name." };
  if (!branch_id) return { error: "Choose a branch." };

  const ssid = trimOrNull(formData.get("ssid"));
  const package_start_date = isoDateOrNull(formData.get("package_start_date"));
  /* Private invoicing is no longer asked here (Phil, 2026-09-09: "remove private invoicing as
     we now have it in funding options"). It is switched on by the Setup Visit's funding
     answer, which is the moment somebody actually knows who is paying — asking it up front
     asked the person creating the record to guess. The fields stay on the RECORD so the
     office can still set it by hand. */
  const inv = invoicingFieldsFromForm(formData);
  if (inv.error) return { error: inv.error };

  const supabase = await createClient();
  const { data: su, error } = await supabase
    .from("service_users")
    .insert({
      company_id: companyId,
      branch_id,
      full_name,
      ssid,
      package_start_date,
      created_by: user.id,
      ...inv.values,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That SSID is already used in your company." };
    return { error: error.message };
  }

  // Auto-apply active definitions, each scheduled from the package start date. On a
  // Complex branch the Care Plan Review (REV1) is due at the Complex cadence.
  const definitions = await listServiceUserCheckDefinitions(companyId);
  const { isComplex, intervalDays } = await complexReviewContext(supabase, companyId, branch_id);
  const rows = definitions.map((def: CheckDefinition) => ({
    definition_id: def.id,
    due_date:
      def.key === "care_plan_review" && isComplex
        ? addDaysToIso(package_start_date, intervalDays)
        : initialDueDate(def, package_start_date),
    expiry_date: null,
  }));
  const { data: applied, error: applyErr } = await supabase.rpc("apply_service_user_checks", {
    p_service_user_id: su.id,
    p_rows: rows,
  });

  // Optional Care Plan document uploaded on the Add form. If they do not have it yet
  // they can add it later on the Setup form or the record.
  const carePlan = formData.get("care_plan");
  if (carePlan instanceof File && carePlan.size > 0) {
    const up = await uploadCarePlanFile(companyId, su.id, carePlan);
    if (up.ok) {
      await supabase
        .from("service_users")
        .update({ care_plan_path: up.path, care_plan_uploaded_at: new Date().toISOString() })
        .eq("id", su.id);
    }
  }

  // Assign the chosen users to the caseload (auto-filled from the branch).
  const assigneeIds = formData.getAll("supervisor_ids").map(String).filter(Boolean);
  if (assigneeIds.length > 0) {
    await supabase.from("service_user_assignments").insert(
      assigneeIds.map((uid) => ({
        company_id: companyId,
        service_user_id: su.id,
        user_id: uid,
        created_by: user.id,
      })),
    );
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.created",
    entityType: "service_user",
    entityId: su.id,
    summary: `Added ${full_name} to the Service User register`,
    metadata: { branch_id, checks_applied: applyErr ? 0 : (applied ?? 0) },
  });

  /* "Add service user and complete Setup" goes straight to the Setup Visit rather than to the
     record and a hunt for the tile. The instance only exists once the checks above have been
     applied, so it is looked up here rather than guessed. If anything is missing — no Setup
     definition, no form, the apply failed — fall through to the record rather than to a dead
     URL: the record was still created, and that is the part that matters.
     No query string on either target, so redirect() is safe here (see lib/forms). */
  if (String(formData.get("then") ?? "") === "setup" && !applyErr) {
    const setupDef = definitions.find((d: CheckDefinition) => d.key === "setup");
    if (setupDef?.form_id) {
      const { data: instance } = await supabase
        .from("check_instances")
        .select("id")
        .eq("service_user_id", su.id)
        .eq("definition_id", setupDef.id)
        .limit(1)
        .maybeSingle();
      if (instance?.id) {
        redirect(`/service-users/${su.id}/checks/${instance.id}/complete`);
      }
    }
  }

  redirect(`/service-users/${su.id}`);
}

/** Edit a Record's identity fields. */
export async function updateServiceUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id) return { error: "Missing record." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Enter the service user's name." };
  const inv = invoicingFieldsFromForm(formData);
  if (inv.error) return { error: inv.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_users")
    .update({
      full_name,
      ssid: trimOrNull(formData.get("ssid")),
      package_start_date: isoDateOrNull(formData.get("package_start_date")),
      ...inv.values,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That SSID is already used in your company." };
    return { error: error.message };
  }

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.updated",
    entityType: "service_user",
    entityId: id,
    summary: `Updated ${full_name}`,
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Saved." };
}

type CarePlanRow = { day_of_week: number; service: string; unit: string; handed: string; carers: number; slot: string | null; quantity: number };

function parseCarePlanRows(formData: FormData): CarePlanRow[] | null {
  try {
    const parsed = JSON.parse(String(formData.get("entries") ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => {
        const o = r as Record<string, unknown>;
        const carers = carersOf(o.carers, o.handed);
        return {
          day_of_week: Math.max(0, Math.min(6, Math.trunc(Number(o.day_of_week)))),
          service: String(o.service ?? "").trim(),
          unit: String(o.unit ?? "").trim(),
          /* handed is kept true to carers rather than trusted from the browser: the two must
             never disagree, and carers is what prices the line. */
          handed: handedFromCarers(carers),
          carers,
          slot: SLOTS.includes(String(o.slot ?? "")) ? String(o.slot) : null,
          quantity: Math.max(0, Number(o.quantity) || 0),
        };
      })
      .filter((r) => r.service !== "" && r.unit !== "");
  } catch {
    return null;
  }
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Edit the CURRENT (open) care plan version in place, for corrections. Keeps the
 *  version's effective_from; does not touch superseded versions. Manager+ via RLS. */
export async function saveCarePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  if (!serviceUserId) return { error: "Missing service user." };

  const rows = parseCarePlanRows(formData);
  if (rows === null) return { error: "Could not read the care plan." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("company_id")
    .eq("id", serviceUserId)
    .maybeSingle();
  if (!su) return { error: "Service user not found." };

  // Preserve the current open version's start date (or start one from long ago so
  // a brand new plan bills any period). Only the open version is replaced.
  const { data: current } = await supabase
    .from("care_plan_entries")
    .select("effective_from")
    .eq("service_user_id", serviceUserId)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const effectiveFrom = (current?.effective_from as string | undefined) ?? "2020-01-01";

  const { error: delErr } = await supabase
    .from("care_plan_entries")
    .delete()
    .eq("service_user_id", serviceUserId)
    .is("effective_to", null);
  if (delErr) return { error: "Could not save the care plan. Check your access and try again." };

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("care_plan_entries").insert(
      rows.map((r, i) => ({
        company_id: su.company_id,
        service_user_id: serviceUserId,
        day_of_week: r.day_of_week,
        service: r.service,
        unit: r.unit,
        handed: r.handed,
        carers: r.carers,
        slot: r.slot,
        quantity: r.quantity,
        position: i,
        effective_from: effectiveFrom,
        effective_to: null,
      })),
    );
    if (insErr) return { error: "Could not save the care plan. Please try again." };
  }

  await writeAudit({
    companyId: su.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_saved",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Updated the care plan (${rows.length} ${rows.length === 1 ? "entry" : "entries"})`,
  });
  revalidatePath(`/service-users/${serviceUserId}/care-plan`);
  return { ok: "Saved" };
}

/** Supersede the current care plan with a new version effective from a chosen date.
 *  The old version is CLOSED (effective_to = new start minus one day), not deleted,
 *  so invoices bill the old plan up to the change and the new plan from it. */
export async function updateCarePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  if (!serviceUserId) return { error: "Missing service user." };

  const newFrom = String(formData.get("effective_from") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newFrom)) return { error: "Choose the date the new plan takes effect." };

  const rows = parseCarePlanRows(formData);
  if (rows === null) return { error: "Could not read the care plan." };
  if (rows.length === 0) return { error: "Add at least one line to the new care plan." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("company_id")
    .eq("id", serviceUserId)
    .maybeSingle();
  if (!su) return { error: "Service user not found." };

  // The new version must start after the current one started.
  const { data: current } = await supabase
    .from("care_plan_entries")
    .select("effective_from")
    .eq("service_user_id", serviceUserId)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentFrom = current?.effective_from as string | undefined;
  if (currentFrom && newFrom < currentFrom) {
    return { error: `The schedule cannot start before the current one began (${currentFrom}).` };
  }

  /* SAME DATE MEANS CORRECT, NOT SUPERSEDE (2026-09-09). Every edit now carries the date the
     schedule starts (Phil: "the new plan starts on should be required for any edits"), and
     the honest reading of the SAME date is that this version was written wrong and is being
     put right — not that a second version begins the day it began. Closing it the day before
     its own start would leave a version that was live for minus one day, and refusing outright
     leaves somebody who spotted a typo an hour later with nowhere to go. */
  const correctingInPlace = currentFrom === newFrom;

  if (correctingInPlace) {
    const { error: delErr } = await supabase
      .from("care_plan_entries")
      .delete()
      .eq("service_user_id", serviceUserId)
      .is("effective_to", null);
    if (delErr) return { error: "Could not update the care plan. Please try again." };
  } else if (currentFrom) {
    // Close the current open version the day before the new one starts.
    const { error: closeErr } = await supabase
      .from("care_plan_entries")
      .update({ effective_to: addDaysIso(newFrom, -1) })
      .eq("service_user_id", serviceUserId)
      .is("effective_to", null);
    if (closeErr) return { error: "Could not update the care plan. Please try again." };
  }

  const { error: insErr } = await supabase.from("care_plan_entries").insert(
    rows.map((r, i) => ({
      company_id: su.company_id,
      service_user_id: serviceUserId,
      day_of_week: r.day_of_week,
      service: r.service,
      unit: r.unit,
      handed: r.handed,
      carers: r.carers,
      slot: r.slot,
      quantity: r.quantity,
      position: i,
      effective_from: newFrom,
      effective_to: null,
    })),
  );
  if (insErr) return { error: "Could not save the new care plan. Please try again." };

  await writeAudit({
    companyId: su.company_id as string,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_updated",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: correctingInPlace
      ? `Corrected the care schedule effective ${newFrom}`
      : `New care schedule version effective ${newFrom}`,
    metadata: { effective_from: newFrom, corrected_in_place: correctingInPlace },
  });
  revalidatePath(`/service-users/${serviceUserId}/care-plan`);
  revalidatePath(`/service-users/${serviceUserId}/care-schedule`);
  revalidatePath(`/service-users/${serviceUserId}`);
  return { ok: "Saved" };
}

/** Transfer a Record to another branch (its checks follow via the DB trigger). */
export async function transferServiceUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!id || !branchId) return { error: "Choose a branch." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_users")
    .update({ branch_id: branchId })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.transferred",
    entityType: "service_user",
    entityId: id,
    summary: "Transferred record to another branch",
    metadata: { branch_id: branchId },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Transferred." };
}

/** Change the service status (active / hospital / respite / cancelled), or archive a
 *  cancelled Record. Cancelled excludes the Record from the active register, rollups,
 *  dashboard and reminders (kept for audit), exactly like a People leaver. */
export async function setServiceStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return { error: "Missing record." };

  const supabase = await createClient();

  // "archive" is offered on the Status pill only in the Cancelled view: it archives
  // the cancelled Record (sets archived_at) rather than changing service_status.
  if (status === "archive") {
    const { data, error: archErr } = await supabase
      .from("service_users")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (archErr) return { error: archErr.message };
    if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };
    await writeAudit({
      companyId: profile.company_id ?? "",
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "service_user.archived",
      entityType: "service_user",
      entityId: id,
      summary: "Archived record",
    });
    revalidatePath(`/service-users/${id}`);
    revalidatePath("/service-users");
    return { ok: "Archived." };
  }

  if (!["active", "hospital", "respite", "cancelled"].includes(status)) {
    return { error: "Choose a valid status." };
  }

  const discharge_date = status === "cancelled" ? todayIso() : null;
  // Setting a status also un-archives, so changing the pill (e.g. back to Active)
  // brings an archived Record back into the relevant view, not stuck in Archive.
  const { data, error } = await supabase
    .from("service_users")
    .update({ service_status: status, discharge_date, archived_at: null })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  // ITEM 18: a discharge is a Service User's end of care, so it starts the eight year
  // retention clock; any other status clears it again (see the People twin).
  const retention = await applyRetentionForRecord({
    companyId: profile.company_id ?? "",
    recordType: "service_user",
    recordId: id,
    endOfCare: discharge_date,
  });

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.status_changed",
    entityType: "service_user",
    entityId: id,
    summary: `Set service status to ${status}`,
    metadata: {
      status,
      retention_rows_updated: retention.updated,
      ...(retention.error ? { retention_error: retention.error } : {}),
    },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Saved." };
}

/** Book the next Care Plan Review: set the Planned Review Date and the reviewer who
 *  will complete it. Review Status derives to "Booked In" from this (until the due
 *  date passes). Booking also emails the reviewer a branded calendar invite with an
 *  .ics attachment (Phase 6); the email silently no-ops when Resend is not
 *  configured and the outcome lands in the audit metadata either way.
 *  Pass an empty date to clear a booking. */
export async function bookReview(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id || !profile.company_id) return;

  const plannedDate = isoDateOrNull(formData.get("planned_review_date"));
  const reviewerId = trimOrNull(formData.get("planned_reviewer_id"));
  const rawTime = String(formData.get("planned_review_time") ?? "").trim();
  const plannedTime = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null;
  const rawDuration = Number.parseInt(String(formData.get("planned_review_duration") ?? ""), 10);
  const plannedDuration =
    Number.isFinite(rawDuration) && rawDuration >= 15 && rawDuration <= 480 ? rawDuration : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_trackers")
    .update({
      planned_review_date: plannedDate,
      planned_review_time: plannedDate ? plannedTime : null,
      planned_review_duration_minutes: plannedDate && plannedTime ? plannedDuration : null,
      planned_reviewer_id: plannedDate ? reviewerId : null,
      planned_review_booked_at: plannedDate ? new Date().toISOString() : null,
      updated_by: user.id,
    })
    .eq("service_user_id", id);
  if (error) return;

  // Reviewer calendar invite (carried from Phase 4). Idempotent per service
  // user + date + reviewer, so re-saving the same booking never re-sends and
  // a changed date sends a fresh invitation.
  let inviteOutcome = "not_applicable";
  if (plannedDate && reviewerId) {
    // Definer path: read directly this was null for a Manager or Supervisor, so the reviewer's
    // calendar invitation was silently never sent and the audit recorded "not_applicable".
    const [reviewer, { data: su }, { data: company }] = await Promise.all([
      profilesById([reviewerId], profile.company_id).then((m) => m.get(reviewerId) ?? null),
      supabase.from("service_users").select("full_name, branch_id").eq("id", id).maybeSingle(),
      supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle(),
    ]);
    if (reviewer?.email && su) {
      const result = await sendCalendarInvite({
        companyId: profile.company_id,
        branchId: (su.branch_id as string | null) ?? null,
        companyName: company?.name ?? "Be Care Compliant",
        kind: "su_review_invite",
        // Time is part of the key: rebooking the same slot never re-sends, a
        // changed date OR time sends a fresh invitation.
        dedupeKey: `su_review:${id}:${plannedDate}:${plannedTime ?? "allday"}:${reviewerId}`,
        recipient: {
          profileId: reviewer.id,
          name: reviewer.name || reviewer.email,
          email: reviewer.email,
        },
        eventTitle: `Care Plan Review: ${su.full_name}`,
        dateIso: plannedDate,
        timeHHMM: plannedTime,
        durationMinutes: plannedDuration ?? (plannedTime ? 60 : null),
        detailHtml: `<p style="margin:0;">You are booked to complete the Care Plan Review for <strong style="color:#ffffff;">${escapeHtml(String(su.full_name))}</strong>. The review form is in the Service Users section.</p>`,
        icsUid: `su-review-${id}-${plannedDate}-${(plannedTime ?? "allday").replace(":", "")}@becarecompliant.com`,
      });
      inviteOutcome = result.sent
        ? "sent"
        : result.deduped
          ? "already_sent"
          : result.skippedReason
            ? "skipped_no_email_config"
            : `failed: ${result.error}`;
    } else {
      inviteOutcome = "skipped_no_reviewer_email";
    }
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: plannedDate ? "service_user.review_booked" : "service_user.review_unbooked",
    entityType: "service_user",
    entityId: id,
    summary: plannedDate ? `Booked a review for ${plannedDate}` : "Cleared the planned review",
    metadata: {
      planned_review_date: plannedDate,
      planned_review_time: plannedTime,
      planned_review_duration_minutes: plannedDuration,
      planned_reviewer_id: reviewerId,
      invite_email: inviteOutcome,
    },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
}

/** Assign a user to a Record's caseload (visibility for that user). */
export async function assignServiceUserSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!id || !userId || !profile.company_id) return { error: "Choose a user to assign." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_assignments")
    .insert({ company_id: profile.company_id, service_user_id: id, user_id: userId, created_by: user.id });
  if (error && error.code !== "23505") return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.assigned",
    entityType: "service_user",
    entityId: id,
    summary: "Assigned a user to the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/service-users/${id}`);
  return { ok: "Assigned." };
}

/** Remove a user from a Record's caseload. */
export async function unassignServiceUserSupervisor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!id || !userId) return { error: "Missing assignment." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_user_assignments")
    .delete()
    .eq("service_user_id", id)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.unassigned",
    entityType: "service_user",
    entityId: id,
    summary: "Removed a user from the caseload",
    metadata: { user_id: userId },
  });

  revalidatePath(`/service-users/${id}`);
  return { ok: "Removed." };
}

/** Apply any active SU definitions this Record is missing (idempotent). */
export async function applyMissingChecks(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  const id = String(formData.get("service_user_id") ?? "");
  if (!id || !profile.company_id) return { error: "Missing record." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("package_start_date")
    .eq("id", id)
    .maybeSingle();
  const definitions = await listServiceUserCheckDefinitions(profile.company_id);
  const rows = definitions.map((def) => ({
    definition_id: def.id,
    due_date: initialDueDate(def, (su?.package_start_date as string | null) ?? null),
    expiry_date: null,
  }));
  const { error } = await supabase.rpc("apply_service_user_checks", { p_service_user_id: id, p_rows: rows });
  if (error) return { error: error.message };

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/service-users");
  return { ok: "Checks applied." };
}

/**
 * THE COMPLIANCE LOOP. Complete a Check's Form: validate + store Evidence through
 * the shared pipeline, then advance the Check with the next due date from the shared
 * engine. Idempotent on the evidence id. Completing a Care Plan Review clears any
 * Planned Review Date booking (the booked review has now happened).
 */
export async function completeCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const instanceId = String(formData.get("instance_id") ?? "");
  if (!instanceId) return { error: "Missing check." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, service_user_id, branch_id, company_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || !def || !instance.service_user_id) return { error: "That check could not be found." };
  if (!def.form_id) return { error: "This check has no form to complete." };

  const version = await getPublishedFormVersion(def.form_id);
  if (!version) return { error: "This check's form has no published version." };

  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }

  // 1. Store immutable Evidence through the shared pipeline (validates authoritatively).
  const result = await submitEvidence({
    formVersionId: version.id,
    branchId: (instance.branch_id as string | null) ?? null,
    answers,
    files,
    recordType: "service_user",
    recordId: instance.service_user_id as string,
  });
  if (!result.ok) return { error: result.error };

  // 2. Advance the Check: completion date = the activity date captured on the form
  // (e.g. Date of review) when present, else today; it anchors the next due date so a
  // back-dated completion schedules the next one correctly.
  const dateKey = isFormSchema(version.schema) ? firstDateFieldKey(version.schema as FormSchema) : null;
  const dateAnswer = dateKey ? answers[dateKey] : undefined;
  const completedOnIso =
    typeof dateAnswer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateAnswer) ? dateAnswer : todayIso();
  const advance = nextDueAfterCompletion(def, answers, null, parseCivilDate(completedOnIso));
  let nextDue = advance.nextDue;
  const expiry = advance.expiry;
  // On a Complex branch, the Care Plan Review advances at the Complex cadence (default
  // 80 days), so the next REV slot / rollup RAG is scheduled correctly.
  if (def.key === "care_plan_review") {
    const ctx = await complexReviewContext(
      supabase,
      instance.company_id as string,
      (instance.branch_id as string | null) ?? "",
    );
    if (ctx.isComplex) nextDue = addDaysToIso(completedOnIso, ctx.intervalDays);
  }
  // Did it actually happen? A Form whose gate has been tripped records the attempt and
  // the reason as Evidence, but the Check is NOT advanced: it stays due on the register
  // exactly as it was. Crediting a visit that never happened is the one thing a
  // compliance record must never do.
  const happened = isFormSchema(version.schema)
    ? formCompletesCheck(version.schema as FormSchema, answers)
    : true;
  if (!happened) {
    await writeAudit({
      companyId: instance.company_id as string,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "check.not_completed",
      entityType: "check_instance",
      entityId: instanceId,
      summary: `${def.name} could not be completed`,
      metadata: { evidence_id: result.evidenceId, definition_id: def.id, record_type: "service_user" },
    });
    revalidatePath(`/service-users/${instance.service_user_id}`);
    revalidatePath("/service-users");
    return {
      ok: "recorded",
      redirectTo: `/service-users/${instance.service_user_id}?recorded=${encodeURIComponent(def.name)}`,
    };
  }

  const { error: advanceErr } = await supabase.rpc("complete_check", {
    p_instance_id: instanceId,
    p_completed_on: completedOnIso,
    p_evidence_id: result.evidenceId,
    p_next_due: nextDue,
    p_expiry_date: expiry,
  });
  if (advanceErr) {
    return { error: `Evidence was saved, but the check could not be advanced: ${advanceErr.message}` };
  }

  // Completing the Care Plan Review fulfils any booking, so clear the Planned Review
  // Date; Review Status then derives from the new New Review Due date.
  if (def.key === "care_plan_review") {
    await supabase
      .from("service_user_trackers")
      .update({
        planned_review_date: null,
        planned_reviewer_id: null,
        planned_review_booked_at: null,
        updated_by: user.id,
      })
      .eq("service_user_id", instance.service_user_id as string);
  }

  /* The Setup Visit is where the office finds out who is paying, and the one moment somebody
     definitely knows. Private and Continuing Healthcare are the two funding types we invoice
     ourselves, so the payer goes onto the Invoicing books now rather than being carried across
     by hand later — which is how a package runs for months unbilled. Idempotent and best
     effort: the Evidence must not fail because the billing side did. */
  if (def.key === "setup") {
    const billing = await ensurePrivateInvoicingFromSetup({
      companyId: instance.company_id as string,
      serviceUserId: instance.service_user_id as string,
      answers,
    });
    /* The calls asked for at the visit ARE the weekly Care Plan, and the Care Plan is what
       Invoicing bills from. Written from the completion date so the plan bills from the day
       care actually started, and never written over a plan that already exists. */
    const plan = await seedCarePlanFromSetup({
      companyId: instance.company_id as string,
      serviceUserId: instance.service_user_id as string,
      answers,
      effectiveFrom: completedOnIso,
    });
    if (plan.seeded > 0) {
      await writeAudit({
        companyId: instance.company_id as string,
        actorId: user.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        action: "service_user.care_plan_seeded",
        entityType: "service_user",
        entityId: instance.service_user_id as string,
        summary: `Care Plan created from the Setup Visit: ${plan.summary}`,
        metadata: { rows: plan.seeded, calls: plan.summary, evidence_id: result.evidenceId },
      });
    }

    if (billing.turnedOn) {
      await writeAudit({
        companyId: instance.company_id as string,
        actorId: user.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        action: "service_user.private_invoicing_on",
        entityType: "service_user",
        entityId: instance.service_user_id as string,
        summary: `Private invoicing switched on from the Setup Visit (${billing.fundingLabel})`,
        metadata: { funding: billing.fundingLabel, evidence_id: result.evidenceId },
      });
    }
  }

  // The work was booked; it has now been done. Turn the planner task green rather than
  // leaving a month of appointments on the whiteboard that all already happened.
  await closeBookingsForCheck(supabase, instanceId, user.id);

  await writeAudit({
    companyId: instance.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "check.completed",
    entityType: "check_instance",
    entityId: instanceId,
    summary: `Completed ${def.name}`,
    metadata: { evidence_id: result.evidenceId, next_due: nextDue, definition_id: def.id, record_type: "service_user" },
  });

  revalidatePath(`/service-users/${instance.service_user_id}`);
  revalidatePath("/service-users");
  // Navigate client-side (see ActionState.redirectTo): a Server Action redirect() to a
  // URL with a query string trips Next.js issue #78396 (React #310).
  return {
    ok: "completed",
    redirectTo: `/service-users/${instance.service_user_id}?completed=${encodeURIComponent(def.name)}`,
  };
}

/* updateComplexReviewInterval is gone (2026-09-04). Complex and Simple differ only in
   how the register draws the review, so the cadence is the Care Plan Review's own
   interval, set with the other checks in Settings, Service users. */

/** Set a branch's Service User type (Simple or Complex). Company Admin only, enforced
 *  by the branches_update RLS policy. */
export async function setBranchServiceUserType(formData: FormData): Promise<void> {
  const { user, profile } = await requireCompany();
  const branchId = String(formData.get("branch_id") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!branchId || !["simple", "complex"].includes(type)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ service_user_type: type })
    .eq("id", branchId);
  if (error) return;

  // Re-anchor every Service User's Care Plan Review due date in this branch. Both modes
  // now run on the SAME cadence - the Care Plan Review's own interval - so switching type
  // changes only how the register draws it. The re-anchor stays because the register
  // slots recompute from the completion history and this keeps the RAG rollup correct.
  const { data: def } = await supabase
    .from("check_definitions")
    .select("interval")
    .eq("company_id", profile.company_id ?? "")
    .eq("population", "service_users")
    .eq("key", "care_plan_review")
    .maybeSingle();
  const intervalDays = (def?.interval as number | null) ?? 90;
  await supabase.rpc("reschedule_branch_reviews", {
    p_branch_id: branchId,
    p_interval_days: intervalDays,
  });

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "branch.service_user_type_set",
    entityType: "branch",
    entityId: branchId,
    summary: `Set Service User type to ${type}`,
    metadata: { type, interval_days: intervalDays },
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
}

/** Save the per-company shorthand labels for the Service User register columns. */
export async function updateServiceUserColumnLabels(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const labels: Record<string, string> = {};
  for (const col of SU_REGISTER_COLUMNS) {
    const v = String(formData.get(`col_${col.key}`) ?? "").trim();
    // Store your own wording only; matching the default (or blank) reverts.
    if (v && v !== col.name) labels[col.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ service_user_column_labels: labels })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.su_column_labels_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated Service User register column names",
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users");
  return { ok: "Saved" };
}

/** Upload (or replace) a Service User's Care Plan document. */
export async function uploadCarePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const suId = String(formData.get("service_user_id") ?? "");
  const file = formData.get("care_plan");
  if (!suId) return { error: "Missing record." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a Care Plan file to upload." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, company_id")
    .eq("id", suId)
    .maybeSingle();
  if (!su) return { error: "That record could not be found." };

  const up = await uploadCarePlanFile(su.company_id as string, su.id as string, file);
  if (!up.ok) return { error: up.error };

  const { data, error } = await supabase
    .from("service_users")
    .update({ care_plan_path: up.path, care_plan_uploaded_at: new Date().toISOString() })
    .eq("id", suId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: su.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_uploaded",
    entityType: "service_user",
    entityId: suId,
    summary: "Uploaded a care plan document",
  });

  revalidatePath(`/service-users/${suId}`);
  return { ok: "Care plan uploaded." };
}

/** Signed URL to view a Service User's Care Plan (RLS-checked read, then service-role sign). */
export async function getCarePlanUrl(
  serviceUserId: string,
): Promise<{ url?: string; error?: string }> {
  const { user, profile } = await requireCompany();
  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("company_id, care_plan_path")
    .eq("id", serviceUserId)
    .maybeSingle();
  const path = (su?.care_plan_path as string | null) ?? null;
  if (!su || !path) return { error: "No care plan on file." };
  const res = await signCarePlan(path);
  if (!res.ok) return { error: res.error };
  await writeAudit({
    companyId: su.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_plan_downloaded",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Viewed a care plan document",
  });
  return { url: res.url };
}

/**
 * Put a Service User's records on, or take them off, a RETENTION HOLD (item 18).
 * The People twin carries the full reasoning; kept as its own function rather than one
 * generic helper because each population has its own RLS path and its own audit verbs.
 * ADMIN ONLY, and the reason is required.
 */
export async function setServiceUserRetentionHold(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const id = String(formData.get("service_user_id") ?? "");
  const hold = String(formData.get("hold") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { error: "Missing record." };
  if (hold && reason === "") {
    return { error: "Give a reason for holding these records." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_users")
    .update({
      retention_hold: hold,
      retention_hold_reason: hold ? reason.slice(0, 500) : null,
      retention_hold_set_at: hold ? new Date().toISOString() : null,
      retention_hold_set_by: hold ? user.id : null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id ?? "",
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: hold ? "service_user.retention_held" : "service_user.retention_hold_lifted",
    entityType: "service_user",
    entityId: id,
    summary: hold ? `Held records beyond retention: ${reason}` : "Lifted the retention hold",
    metadata: { hold, reason: hold ? reason : null },
  });

  revalidatePath(`/service-users/${id}`);
  revalidatePath("/settings/retention");
  return { ok: hold ? "Records held." : "Hold lifted." };
}

/**
 * Which ways of paying for care this company accepts.
 *
 * Phil, 2026-09-09: "in the actual company settings, when admin sets the company account up,
 * they can choose what funding options they accept so the whole list isnt visible in the
 * Service user setup form."
 *
 * REFUSES AN EMPTY LIST. "Care package funded by" is a required question on the Setup Visit,
 * so a company that accepts nothing has a form that cannot be completed and no way to see why
 * from the screen it is stuck on. Turning them all off is not a state worth supporting.
 *
 * The chosen set is then BAKED into the stored forms. It has to be: form-validate checks a
 * chosen option against the stored published schema, so an option that exists only in the
 * browser is refused on save.
 */
export async function setFundingOptions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." };

  const keys = [...new Set(formData.getAll("options").map((v) => String(v)).filter(Boolean))];
  if (keys.length === 0) {
    return { error: "Choose at least one. The Setup Visit has to offer something." };
  }

  /* "We invoice this ourselves" is meaningless about funding the company does not take, so an
     unaccepted key can never carry the billing flag — enforced here as well as greyed out on
     screen, because the screen is not the enforcement. */
  const billed = new Set(
    formData.getAll("bills").map((v) => String(v)).filter((k) => keys.includes(k)),
  );

  const supabase = await createClient();

  // Every key must be one the catalogue actually holds, so a hand-made request cannot write
  // a funding type nothing else in the product knows about.
  const { data: catalogue } = await supabase.from("funding_option_catalogue").select("key");
  const known = new Set(((catalogue as Array<{ key: string }> | null) ?? []).map((c) => c.key));
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length > 0) return { error: "That is not a funding option we recognise." };

  const { error: delErr } = await supabase
    .from("company_funding_options")
    .delete()
    .eq("company_id", companyId)
    .not("option_key", "in", `(${keys.join(",")})`);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase
    .from("company_funding_options")
    .upsert(
      keys.map((option_key) => ({
        company_id: companyId,
        option_key,
        bills_privately: billed.has(option_key),
      })),
      { onConflict: "company_id,option_key" },
    );
  if (insErr) return { error: insErr.message };

  await rebakeFormFieldOptions(companyId);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.funding_options_set",
    entityType: "company",
    entityId: companyId,
    summary: `Accepts ${keys.length} funding ${keys.length === 1 ? "option" : "options"}, invoicing ${billed.size} directly`,
    metadata: { options: keys, bills_privately: [...billed] },
  });

  revalidatePath("/settings/service-users");
  return { ok: "Saved." };
}
