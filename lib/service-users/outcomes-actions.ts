"use server";

/**
 * Personal outcomes actions for a Service User (Birdie-style, rebuilt). Manager+ via
 * RLS. Each outcome is a rich record (title, detail, target date) tracked over time
 * with immutable progress updates. The outcome's status is derived from the latest
 * update; completing it moves it to the Achieved list; archiving soft-removes it.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import type { OutcomeProgress } from "./outcome-consts";
import { isOutcomeClosed } from "./outcome-consts";
import {
  closeDateError,
  enteredLaterLine,
  historicWindowOpen,
  londonDate,
  middayOf,
  outcomeFrom,
  pastOutcomeError,
  pastUpdateError,
  pastUpdateIsLatest,
  ukDate,
  type TimelineUpdate,
} from "./outcome-history";

const PROGRESS: OutcomeProgress[] = ["progressing", "no_change", "regressing"];

function nowIso(): string {
  return new Date().toISOString();
}

function londonToday(): string {
  return londonDate(nowIso());
}

/** The database's own refusals (0449) are written for people; anything else stays generic. */
function refusal(error: { code?: string; message: string } | null, fallback: string): string {
  if (error && (error.code === "23514" || error.code === "42501") && !/row-level security/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

const DISCHARGED_PAST_ONLY =
  "This person has been discharged, so only past entries can be added. Tick the past option and give its date.";

/**
 * Resolve + authorise the service user for an outcome action. Returns its company, whether the
 * person has been discharged (their discharge date), and whether the company's window for past
 * outcomes and updates is open today (docs/decisions/historic-outcomes.md).
 */
async function loadServiceUser(serviceUserId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("company_id, service_status, discharge_date, companies(historic_outcomes_until)")
    .eq("id", serviceUserId)
    .maybeSingle<{
      company_id: string;
      service_status: string;
      discharge_date: string | null;
      companies: { historic_outcomes_until: string | null } | null;
    }>();
  const until = data?.companies?.historic_outcomes_until ?? null;
  const discharged = data?.service_status === "cancelled";
  return {
    supabase,
    companyId: data?.company_id ?? null,
    discharged,
    dischargeDate: discharged ? (data?.discharge_date ?? null) : null,
    windowOpen: historicWindowOpen(until, londonToday()),
    until,
  };
}

function windowClosedError(until: string | null): string {
  return until
    ? `Adding past outcomes and updates closed at the end of ${ukDate(until)}.`
    : "Adding past outcomes and updates is not open for your company.";
}

/** Create a new outcome (title required, optional detail + target date). */
export async function createOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const detail = (String(formData.get("detail") ?? "").trim().slice(0, 2000)) || null;
  const targetRaw = String(formData.get("target_date") ?? "").trim();
  const target_date = /^\d{4}-\d{2}-\d{2}$/.test(targetRaw) ? targetRaw : null;
  if (!serviceUserId) return { error: "Missing service user." };
  if (!title) return { error: "Give the outcome a title." };
  if (targetRaw && !target_date) return { error: "That target date is not a date the calendar recognises." };

  const { supabase, companyId, discharged, dischargeDate, windowOpen, until } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  /* A PAST OUTCOME (Phil, 2026-10-13): one that began before today, added while the Founder has
     the company's window open. From is when it began, To is its target date. Marked as entered
     later on screen, in exports and in the audit log. */
  const past = formData.get("entered_later") === "1";
  const from = String(formData.get("start_date") ?? "").trim();
  if (past) {
    if (!windowOpen) return { error: windowClosedError(until) };
    const bad = pastOutcomeError({ from, to: target_date, todayIso: londonToday(), dischargeDate });
    if (bad) return { error: bad };
  } else if (discharged && windowOpen) {
    return { error: DISCHARGED_PAST_ONLY };
  }
  const by = profile.full_name || profile.email;
  const at = nowIso();

  const { data: last } = await supabase
    .from("service_user_outcomes")
    .select("position")
    .eq("service_user_id", serviceUserId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("service_user_outcomes").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    title,
    detail,
    target_date,
    status: "working_towards",
    position,
    created_by: profile.id,
    updated_by: profile.id,
    updated_at: at,
    ...(past ? { start_date: from, entered_later: true, entered_by_name: by } : {}),
  });
  if (error) return { error: refusal(error, "Could not add the outcome. Please try again.") };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_added",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: past
      ? `Added a past personal outcome: ${title}. ${enteredLaterLine(at, by, from)}${target_date ? `, To ${ukDate(target_date)}` : ""}`
      : `Added personal outcome: ${title}`,
    ...(past ? { metadata: { entered_later: true, start_date: from, target_date } } : {}),
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath(`/service-users/${serviceUserId}`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Outcome added" };
}

/**
 * Set just the target date, from the outcome card itself.
 *
 * Phil, 2026-09-15: "i was in outcomes and it didnt look like the date was editable".
 * It was — behind an Edit button, three clicks from where the date is printed. A date shown
 * as grey text with no control near it reads as something the system worked out, not
 * something you can change, so nobody tried. The card now carries the date itself, and this
 * is what it saves to. Clearing the box removes the target, which is a real thing to want:
 * an outcome with no date is open ended, not broken.
 */
export async function setOutcomeTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const targetRaw = String(formData.get("target_date") ?? "").trim();
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  if (targetRaw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(targetRaw)) {
    return { error: "That is not a date the calendar recognises." };
  }
  const target_date = targetRaw === "" ? null : targetRaw;

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const { data: row, error } = await supabase
    .from("service_user_outcomes")
    .update({ target_date, updated_by: profile.id, updated_at: nowIso() })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId)
    .select("title")
    .maybeSingle<{ title: string }>();
  if (error) return { error: refusal(error, "Could not save the target date. Please try again.") };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_target_set",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: target_date
      ? `Target date set to ${target_date} for outcome: ${row?.title ?? outcomeId}`
      : `Target date removed from outcome: ${row?.title ?? outcomeId}`,
  });

  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath(`/service-users/${serviceUserId}`);
  revalidatePath("/service-users/outcomes");
  return { ok: target_date ? "Target date saved." : "Target date removed." };
}

/** Edit an outcome's title / detail. The target date is edited on the card itself. */
export async function editOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const detail = (String(formData.get("detail") ?? "").trim().slice(0, 2000)) || null;
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  if (!title) return { error: "Give the outcome a title." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  // The target date is NOT written here (2026-10-13): the edit form stopped sending it when the
  // date moved onto the card, so writing it from this form erased the target on every edit.
  const { data: saved, error } = await supabase
    .from("service_user_outcomes")
    .update({ title, detail, updated_by: profile.id, updated_at: nowIso() })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId)
    .select("id");
  if (error || !saved?.length) return { error: "Could not save the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_edited",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Edited personal outcome: ${title}`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  return { ok: "Saved" };
}

/** Log a progress update against an outcome (progressing / no change / regressing).
 *  Sets the outcome's status and last-update stamp, and stores the update as evidence. */
export async function logOutcomeUpdate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const progress = String(formData.get("progress") ?? "") as OutcomeProgress;
  const note = (String(formData.get("note") ?? "").trim().slice(0, 2000)) || null;
  const past = formData.get("entered_later") === "1";
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  // A past update may also mark the outcome achieved on its day (Phil, 2026-10-13).
  const marksAchieved = past && String(formData.get("progress") ?? "") === "achieved";
  if (!marksAchieved && !PROGRESS.includes(progress)) return { error: "Choose progressing, no change or regressing." };

  const ctx = await loadServiceUser(serviceUserId);
  const { supabase, companyId } = ctx;
  if (!companyId) return { error: "Service user not found." };
  if (past) {
    return logPastUpdate({
      ctx: { ...ctx, companyId },
      profile,
      serviceUserId,
      outcomeId,
      progress: marksAchieved ? null : progress,
      note,
      date: String(formData.get("dated_on") ?? "").trim(),
    });
  }
  if (ctx.discharged && ctx.windowOpen) return { error: DISCHARGED_PAST_ONLY };

  const at = nowIso();
  const { error: insErr } = await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: "progress",
    progress,
    note,
    created_by: profile.id,
    author_name: profile.full_name || profile.email,
    created_at: at,
  });
  if (insErr) return { error: "Could not record the update. Please try again." };

  // F83 (audit 2026-10-10): this used to ignore its own error, so a status the database refused
  // left the outcome showing its old status under a new update. Now it is said.
  const { data: moved, error: upErr } = await supabase
    .from("service_user_outcomes")
    .update({ status: progress, last_update_at: at, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId)
    .select("id");
  if (upErr || !moved?.length) {
    return { error: "The update is recorded, but the outcome's status could not be changed. Please try again or tell us." };
  }

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_updated",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: `Logged an outcome progress update (${progress})`,
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Update recorded" };
}

/**
 * A PAST UPDATE (Phil, 2026-10-13): progress, or Achieved, dated on a day before today, added while
 * the company's window is open. Never before the outcome began, never in the future, never after
 * it was achieved. It sets the outcome's status only when nothing on the outcome speaks for a later
 * day, so filling in history never overwrites where an outcome stands now.
 */
async function logPastUpdate(i: {
  ctx: Awaited<ReturnType<typeof loadServiceUser>> & { companyId: string };
  profile: Awaited<ReturnType<typeof requireCompany>>["profile"];
  serviceUserId: string;
  outcomeId: string;
  /** Null when the past update marks the outcome achieved. */
  progress: OutcomeProgress | null;
  note: string | null;
  date: string;
}): Promise<ActionState> {
  const { supabase, companyId } = i.ctx;
  if (!i.ctx.windowOpen) return { error: windowClosedError(i.ctx.until) };

  const [{ data: outcome }, { data: existing }] = await Promise.all([
    supabase
      .from("service_user_outcomes")
      .select("id, title, status, start_date, created_at, achieved_at, last_update_at")
      .eq("id", i.outcomeId)
      .eq("service_user_id", i.serviceUserId)
      .is("archived_at", null)
      .maybeSingle<{
        id: string;
        title: string | null;
        status: string;
        start_date: string | null;
        created_at: string;
        achieved_at: string | null;
        last_update_at: string | null;
      }>(),
    supabase
      .from("service_user_outcome_updates")
      .select("kind, progress, dated_on, created_at")
      .eq("outcome_id", i.outcomeId),
  ]);
  if (!outcome) return { error: "Outcome not found." };
  const timeline = (existing as TimelineUpdate[] | null) ?? [];
  // Closed, Achieved or Not achieved (2026-10-14): past updates only up to the day it closed.
  const achieved = isOutcomeClosed(outcome.status);
  const achievedStamp = outcome.achieved_at ?? outcome.last_update_at;
  const marksAchieved = i.progress === null;

  const bad = pastUpdateError({
    date: i.date,
    todayIso: londonToday(),
    outcomeFromIso: outcomeFrom(outcome),
    achievedOn: achieved && achievedStamp ? londonDate(achievedStamp) : null,
    dischargeDate: i.ctx.dischargeDate,
    marksAchieved,
    existing: timeline,
    closedAs: outcome.status === "not_achieved" ? "not_achieved" : "achieved",
  });
  if (bad) return { error: bad };

  const by = i.profile.full_name || i.profile.email;
  const at = nowIso();
  const { error: insErr } = await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: i.serviceUserId,
    outcome_id: i.outcomeId,
    kind: marksAchieved ? "completed" : "progress",
    progress: i.progress,
    note: i.note,
    created_by: i.profile.id,
    author_name: by,
    created_at: at,
    dated_on: i.date,
    entered_later: true,
  });
  if (insErr) return { error: refusal(insErr, "Could not record the update. Please try again.") };

  if (pastUpdateIsLatest(timeline, i.date, achieved)) {
    const stamp = middayOf(i.date);
    const { data: moved, error: upErr } = await supabase
      .from("service_user_outcomes")
      .update(
        marksAchieved
          ? { status: "achieved", achieved_at: stamp, last_update_at: stamp, updated_by: i.profile.id, updated_at: at }
          : { status: i.progress, last_update_at: stamp, updated_by: i.profile.id, updated_at: at },
      )
      .eq("id", i.outcomeId)
      .eq("service_user_id", i.serviceUserId)
      .select("id");
    if (upErr || !moved?.length) {
      return { error: "The update is recorded, but the outcome's status could not be changed. Please try again or tell us." };
    }
  }

  await writeAudit({
    companyId,
    actorId: i.profile.id,
    actorEmail: i.profile.email,
    actorRole: i.profile.role,
    action: marksAchieved ? "service_user.outcome_achieved" : "service_user.outcome_updated",
    entityType: "service_user",
    entityId: i.serviceUserId,
    summary: `${marksAchieved ? "Marked a personal outcome achieved, as a past update" : `Logged a past outcome update (${i.progress})`}: ${outcome.title ?? "outcome"}. ${enteredLaterLine(at, by, i.date)}`,
    metadata: { entered_later: true, dated_on: i.date, outcome_id: i.outcomeId },
  });
  revalidatePath(`/service-users/${i.serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: marksAchieved ? "Recorded as achieved" : "Update recorded" };
}

/** Mark an outcome achieved (moves it to the Achieved list). */
export async function completeOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return closeOutcome(formData, "achieved");
}

/** Close an outcome as NOT achieved, with a required reason (Phil, 2026-10-14; 0466). */
export async function notAchieveOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return closeOutcome(formData, "not_achieved");
}

/**
 * CLOSING AN OUTCOME, Achieved or Not achieved (Phil, 2026-10-14). Without the past box the close
 * date is today, exactly as before. With the past box ticked (only while the company's window is
 * open) the person gives the date it closed: never in the future, never before the outcome began or
 * its latest dated update (closeDateError). The date is stored as the close update's dated_on and
 * the outcome's achieved_at at midday, as a past Achieved update already was, so it never shifts a
 * day. Not achieved needs its reason, which is the update's note (the database refuses one without).
 */
async function closeOutcome(formData: FormData, as: "achieved" | "not_achieved"): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  const note = (String(formData.get("note") ?? "").trim().slice(0, 2000)) || null;
  const past = formData.get("entered_later") === "1";
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };
  if (as === "not_achieved" && !note) return { error: "Give the reason it was not achieved." };

  const ctx = await loadServiceUser(serviceUserId);
  const { supabase, companyId, discharged, windowOpen } = ctx;
  if (!companyId) return { error: "Service user not found." };
  if (past && !windowOpen) return { error: windowClosedError(ctx.until) };
  if (!past && discharged && windowOpen) return { error: DISCHARGED_PAST_ONLY };

  const [{ data: outcome }, { data: existing }] = await Promise.all([
    supabase
      .from("service_user_outcomes")
      .select("id, title, status, start_date, created_at")
      .eq("id", outcomeId)
      .eq("service_user_id", serviceUserId)
      .is("archived_at", null)
      .maybeSingle<{ id: string; title: string | null; status: string; start_date: string | null; created_at: string }>(),
    supabase.from("service_user_outcome_updates").select("kind, progress, dated_on, created_at").eq("outcome_id", outcomeId),
  ]);
  if (!outcome) return { error: "Outcome not found." };
  if (isOutcomeClosed(outcome.status)) return { error: "This outcome is already closed. Reopen it first." };

  const today = londonToday();
  const date = past ? String(formData.get("closed_on") ?? "").trim() : today;
  if (past) {
    const bad = closeDateError({
      date,
      todayIso: today,
      outcomeFromIso: outcomeFrom(outcome),
      dischargeDate: ctx.dischargeDate,
      existing: (existing as TimelineUpdate[] | null) ?? [],
    });
    if (bad) return { error: bad };
  }

  const by = profile.full_name || profile.email;
  const at = nowIso();
  const stamp = past ? middayOf(date) : at;
  const { error: insErr } = await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: as === "achieved" ? "completed" : "not_achieved",
    progress: null,
    note,
    created_by: profile.id,
    author_name: by,
    created_at: at,
    ...(past ? { dated_on: date, entered_later: true } : {}),
  });
  if (insErr) return { error: refusal(insErr, "Could not close the outcome. Please try again.") };

  const { data: moved, error } = await supabase
    .from("service_user_outcomes")
    .update({ status: as, achieved_at: stamp, last_update_at: stamp, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId)
    .select("id");
  if (error || !moved?.length) {
    return { error: as === "achieved" ? "Could not complete the outcome. Please try again." : "Could not close the outcome. Please try again." };
  }

  const what = as === "achieved" ? "Marked a personal outcome achieved" : "Closed a personal outcome as not achieved";
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: as === "achieved" ? "service_user.outcome_achieved" : "service_user.outcome_not_achieved",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: past
      ? `${what}: ${outcome.title ?? "outcome"}. ${enteredLaterLine(at, by, date)}`
      : as === "achieved"
        ? what
        : `${what}: ${outcome.title ?? "outcome"}`,
    ...(past || as === "not_achieved"
      ? { metadata: { outcome_id: outcomeId, ...(past ? { entered_later: true, dated_on: date } : {}), ...(as === "not_achieved" ? { reason: note } : {}) } }
      : {}),
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: as === "achieved" ? "Marked achieved" : "Closed as not achieved" };
}

/** Reopen a closed outcome (Achieved or Not achieved) back to active (status returns to working towards). */
export async function reopenOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const at = nowIso();
  await supabase.from("service_user_outcome_updates").insert({
    company_id: companyId,
    service_user_id: serviceUserId,
    outcome_id: outcomeId,
    kind: "reopened",
    progress: null,
    note: null,
    created_by: profile.id,
    author_name: profile.full_name || profile.email,
    created_at: at,
  });
  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ status: "working_towards", achieved_at: null, last_update_at: at, updated_by: profile.id, updated_at: at })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not reopen the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_reopened",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Reopened a personal outcome",
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Reopened" };
}

/** Archive (soft-remove) an outcome from all lists and counts. */
export async function archiveOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const serviceUserId = String(formData.get("service_user_id") ?? "").trim();
  const outcomeId = String(formData.get("outcome_id") ?? "").trim();
  if (!serviceUserId || !outcomeId) return { error: "Missing outcome." };

  const { supabase, companyId } = await loadServiceUser(serviceUserId);
  if (!companyId) return { error: "Service user not found." };

  const { error } = await supabase
    .from("service_user_outcomes")
    .update({ archived_at: nowIso(), updated_by: profile.id, updated_at: nowIso() })
    .eq("id", outcomeId)
    .eq("service_user_id", serviceUserId);
  if (error) return { error: "Could not remove the outcome. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.outcome_archived",
    entityType: "service_user",
    entityId: serviceUserId,
    summary: "Removed a personal outcome",
  });
  revalidatePath(`/service-users/${serviceUserId}/outcomes`);
  revalidatePath("/service-users/outcomes");
  return { ok: "Removed" };
}

/** Save the company outcomes update cadence (months). Admin-only. */
export async function updateOutcomesReviewMonths(formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const months = Number.parseInt(String(formData.get("months") ?? "").trim(), 10);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    return { error: "Enter a number of months between 1 and 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ outcomes_review_months: months })
    .eq("id", profile.company_id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.outcomes_review_months_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Set outcomes update cadence to ${months} month(s)`,
    metadata: { months },
  });

  revalidatePath("/settings/service-users");
  revalidatePath("/service-users/outcomes");
  return { ok: "Saved" };
}
