import "server-only";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications/defaults";
import { createServiceClient } from "@/lib/supabase/admin";
import { COMPLIANCE_RECIPIENT_ROLES, normaliseRecipientRole } from "@/lib/notifications/roles";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { reportableCheck } from "@/lib/notifications/reportable";
import { plannedFor, plannedIndex, type PlannedSource, type PlannedVisit } from "@/lib/notifications/planned";

/**
 * Service-role reads for the notification cron. RLS is bypassed here (the cron
 * has no user), so this module is the authorisation boundary: it only reads
 * through the same status views the app uses (person_check_status /
 * service_user_check_status), which already exclude leavers, archived people,
 * and non-active or archived Service Users. Callers run behind the CRON_SECRET
 * gate, never from user requests.
 */

export type NotificationSettings = {
  companyId: string;
  emailDigestEnabled: boolean;
  smsEnabled: boolean;
  chaserFirstDays: number;
  chaserSecondDays: number;
  smsOverdueDays: number;
};

export type DigestCompany = {
  id: string;
  name: string;
  tier: string;
  settings: NotificationSettings;
};

export type Recipient = {
  profileId: string;
  fullName: string;
  email: string;
  phone: string | null;
  /** Normalised: see normaliseRecipientRole in ./roles.ts, which is where the
   *  rule and its tests live. */
  role: "company_admin" | "manager" | "supervisor";
  /** The role actually on the profile, before the normalisation above. */
  trueRole: string;
  /** Branches a manager covers (empty for admins: they cover the company). */
  branchIds: string[];
  /*
   * NO personIds / serviceUserIds. They were read from person_assignments and
   * service_user_assignments to scope a Supervisor's digest to a caseload. Migration 0078 made
   * Supervisors branch based and abandoned both tables, which now hold zero rows, so every
   * Supervisor was scoped to nothing and their digest never arrived. Scoping is by branch for
   * Managers and Supervisors alike; carrying the fields would invite the same mistake back.
   */
};

export type AttentionItem = {
  instanceId: string;
  population: "people" | "service_users";
  recordId: string;
  recordName: string;
  branchId: string | null;
  branchName: string;
  checkName: string;
  dueDate: string; // ISO date
  rag: "red" | "amber";
};

const DEFAULT_SETTINGS = DEFAULT_NOTIFICATION_SETTINGS;

/** Active companies with their notification settings (defaults if no row). */
export async function getDigestCompanies(): Promise<DigestCompany[]> {
  const supabase = createServiceClient();
  const [companiesRes, settingsRes] = await Promise.all([
    supabase.from("companies").select("id, name, tier").eq("status", "active"),
    supabase.from("notification_settings").select("*"),
  ]);
  if (companiesRes.error) throw new Error(companiesRes.error.message);
  const settingsByCompany = new Map(
    (settingsRes.data ?? []).map((s) => [s.company_id as string, s]),
  );
  return (companiesRes.data ?? []).map((c) => {
    const s = settingsByCompany.get(c.id);
    return {
      id: c.id,
      name: c.name,
      tier: (c as { tier?: string }).tier ?? "business",
      settings: {
        companyId: c.id,
        emailDigestEnabled: s?.email_digest_enabled ?? DEFAULT_SETTINGS.emailDigestEnabled,
        smsEnabled: s?.sms_enabled ?? DEFAULT_SETTINGS.smsEnabled,
        chaserFirstDays: s?.chaser_first_days ?? DEFAULT_SETTINGS.chaserFirstDays,
        chaserSecondDays: s?.chaser_second_days ?? DEFAULT_SETTINGS.chaserSecondDays,
        smsOverdueDays: s?.sms_overdue_days ?? DEFAULT_SETTINGS.smsOverdueDays,
      },
    };
  });
}

/**
 * Digest recipients for one company, per the agreed rules: Company Admins get
 * the whole company, Managers and Supervisors get their branches (user_branches).
 * Team Members are never compliance recipients.
 * Only active profiles with an email qualify.
 */
export async function getRecipients(companyId: string): Promise<Recipient[]> {
  const supabase = createServiceClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("role", COMPLIANCE_RECIPIENT_ROLES);
  if (error) throw new Error(error.message);
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const branchesRes = await supabase
    .from("user_branches")
    .select("user_id, branch_id")
    .in("user_id", ids);

  const branchByUser = groupBy(branchesRes.data ?? [], "user_id", "branch_id");

  return profiles
    .filter((p) => Boolean(p.email))
    .map((p) => ({
      profileId: p.id,
      fullName: p.full_name || p.email,
      email: p.email,
      phone: (p.phone as string | null) || null,
      // The rule and its nine role table live in ./roles.ts, where a test can
      // reach them. It returns null for anybody who is not a compliance
      // recipient, so a widened query above still cannot email a Viewer.
      role: normaliseRecipientRole(p.role as string),
      trueRole: p.role as string,
      branchIds: branchByUser.get(p.id) ?? [],
    }))
    .filter((r): r is Recipient => r.role !== null);
}

/**
 * Everything amber or red for one company, from the existing status views (the
 * server-side RAG is reused, never recomputed; exclusions are the views' own).
 */
export async function getAttentionItems(companyId: string): Promise<AttentionItem[]> {
  const supabase = createServiceClient();
  const [peopleChecks, suChecks, people, sus, branches] = await Promise.all([
    supabase
      .from("person_check_status")
      .select("instance_id, person_id, branch_id, check_name, due_date, rag")
      .eq("company_id", companyId)
      .in("rag", ["red", "amber"]),
    supabase
      .from("service_user_check_status")
      .select("instance_id, service_user_id, branch_id, check_name, due_date, rag")
      .eq("company_id", companyId)
      .in("rag", ["red", "amber"]),
    supabase.from("people").select("id, full_name").eq("company_id", companyId),
    supabase.from("service_users").select("id, full_name").eq("company_id", companyId),
    supabase.from("branches").select("id, name").eq("company_id", companyId),
  ]);
  for (const res of [peopleChecks, suChecks]) {
    if (res.error) throw new Error(res.error.message);
  }

  const personName = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));
  const suName = new Map((sus.data ?? []).map((s) => [s.id, s.full_name]));
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));

  const items: AttentionItem[] = [];
  for (const row of peopleChecks.data ?? []) {
    if (!row.due_date) continue;
    items.push({
      instanceId: row.instance_id,
      population: "people",
      recordId: row.person_id,
      recordName: personName.get(row.person_id) ?? "Unknown",
      branchId: row.branch_id,
      branchName: branchName.get(row.branch_id) ?? "",
      checkName: row.check_name,
      dueDate: row.due_date,
      rag: row.rag as "red" | "amber",
    });
  }
  for (const row of suChecks.data ?? []) {
    if (!row.due_date) continue;
    items.push({
      instanceId: row.instance_id,
      population: "service_users",
      recordId: row.service_user_id,
      recordName: suName.get(row.service_user_id) ?? "Unknown",
      branchId: row.branch_id,
      branchName: branchName.get(row.branch_id) ?? "",
      checkName: row.check_name,
      dueDate: row.due_date,
      rag: row.rag as "red" | "amber",
    });
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return items;
}

/**
 * A single check on a Record, for the daily People / Service User reporting
 * emails. Records overdue, and records with a check due in the next 14 days.
 * Read from the SAME check status views (server side RAG, active records only,
 * leavers / archived / discharged already excluded). Compliance checks ONLY:
 * holiday and absence are deliberately NOT in these views, so the People report
 * never includes holiday or absence (Phil, 2026-07-13).
 */
export type ReportingCheck = {
  population: "people" | "service_users";
  recordId: string;
  recordName: string;
  branchId: string | null;
  branchName: string;
  checkName: string;
  dueDate: string; // ISO date
  /**
   * The next visit booked for this check on the Planner, or null where nothing is in the diary
   * (Phil, 2026-09-22). The report has always said what is due; this is what says whether
   * anybody has been sent to do it.
   */
  planned?: PlannedVisit | null;
};

/** Horizon for the "due soon" section of the reporting emails: the next N days. */
export const REPORTING_HORIZON_DAYS = 14;

export type ReportingData = {
  people: ReportingCheck[];
  serviceUsers: ReportingCheck[];
  /** The company has at least one active person / service user (so the report
   *  is worth sending even on an all clear day; a people only company gets no
   *  Service User report). */
  hasPeople: boolean;
  hasServiceUsers: boolean;
};

/** ISO date N days after an ISO date (civil, timezone free). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}


/**
 * What is IN THE DIARY: every check with a planned visit against it, for one company.
 *
 * Phil, 2026-09-22: the daily report says what is due; this is what says whether anybody has
 * been sent to do it. Four care plan reviews due in a fortnight reads very differently when
 * three of them are already booked.
 *
 * FOUR SMALL READS BY ID rather than one clever join. A booking carries its checks as TASK rows
 * (planner_booking_tasks), not on the booking itself, so the join would be a booking to its
 * tasks to their instances to their definitions to the conductor's profile — four embeds deep,
 * with two different foreign keys into check_instances to disambiguate. Read plainly it is four
 * indexed reads once per company per morning, and anybody can see what it does.
 *
 * ONLY WHAT IS STILL TO HAPPEN: status 'planned' (not cancelled, not completed) and dated today
 * or later. A visit that was booked for last Tuesday and never happened is not an answer to a
 * deadline, and drawing it in the Planned column would say the job was covered when it is not.
 */
async function getPlannedVisits(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  todayIso: string,
): Promise<Map<string, PlannedVisit>> {
  const { data: bookings } = await supabase
    .from("planner_bookings")
    .select("id, scheduled_date, subject_person_id, subject_service_user_id, conductor_profile_id, check_instance_id")
    .eq("company_id", companyId)
    .eq("status", "planned")
    .gte("scheduled_date", todayIso);
  const bookingRows = (bookings ?? []) as Array<{
    id: string;
    scheduled_date: string;
    subject_person_id: string | null;
    subject_service_user_id: string | null;
    conductor_profile_id: string | null;
    check_instance_id: string | null;
  }>;
  if (bookingRows.length === 0) return new Map();

  const { data: taskRows } = await supabase
    .from("planner_booking_tasks")
    .select("booking_id, check_instance_id")
    .in("booking_id", bookingRows.map((b) => b.id));

  /* The booking's own check_instance_id is the older shape, still on live rows; the tasks are
     the current one. Both are read so neither kind of booking is invisible. */
  const pairs: Array<{ bookingId: string; instanceId: string }> = [];
  for (const b of bookingRows) {
    if (b.check_instance_id) pairs.push({ bookingId: b.id, instanceId: b.check_instance_id });
  }
  for (const t of ((taskRows ?? []) as Array<{ booking_id: string; check_instance_id: string | null }>)) {
    if (t.check_instance_id) pairs.push({ bookingId: t.booking_id, instanceId: t.check_instance_id });
  }
  if (pairs.length === 0) return new Map();

  const [{ data: instances }, { data: conductors }] = await Promise.all([
    supabase
      .from("check_instances")
      .select("id, definition_id")
      .in("id", Array.from(new Set(pairs.map((p) => p.instanceId)))),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(new Set(bookingRows.map((b) => b.conductor_profile_id).filter(Boolean) as string[]))),
  ]);
  const instanceRows = (instances ?? []) as Array<{ id: string; definition_id: string }>;
  const { data: definitions } = await supabase
    .from("check_definitions")
    .select("id, name")
    .in("id", Array.from(new Set(instanceRows.map((i) => i.definition_id))));

  const defName = new Map(((definitions ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
  const instanceCheck = new Map(instanceRows.map((i) => [i.id, defName.get(i.definition_id) ?? ""]));
  const conductorName = new Map(
    ((conductors ?? []) as Array<{ id: string; full_name: string | null }>).map((c) => [c.id, c.full_name]),
  );
  const bookingById = new Map(bookingRows.map((b) => [b.id, b]));

  const sources: PlannedSource[] = [];
  for (const pair of pairs) {
    const b = bookingById.get(pair.bookingId);
    const checkName = instanceCheck.get(pair.instanceId) ?? "";
    if (!b || !checkName) continue;
    const recordId = b.subject_person_id ?? b.subject_service_user_id;
    if (!recordId) continue;
    sources.push({
      recordId,
      checkName,
      scheduledDate: b.scheduled_date,
      conductorName: b.conductor_profile_id ? conductorName.get(b.conductor_profile_id) ?? null : null,
    });
  }
  return plannedIndex(sources);
}

/**
 * Checks due on or before today + 14 days (so overdue AND due soon), per
 * population, plus whether the company has active records of each population.
 * The overdue / due soon split is done in the pure logic layer.
 *
 * SETTLED CHECKS ARE NOT REPORTED. A past due date on a check that has been done is
 * history, not an outstanding job -- see lib/notifications/reportable.ts. Without that
 * test every completed one-off Service User check (the Setup Visit) was reported overdue
 * every morning for the rest of time.
 */
export async function getReportingData(companyId: string): Promise<ReportingData> {
  const supabase = createServiceClient();
  const todayIso = formatCivilDate(todayInLondon());
  const horizon = addDaysIso(todayIso, REPORTING_HORIZON_DAYS);
  // What is already in the diary, so each row can say whether anybody has been sent to do it.
  const planned = await getPlannedVisits(supabase, companyId, todayIso);

  const [peopleChecks, suChecks, people, sus, branches, activePeople, activeSus] =
    await Promise.all([
      supabase
        .from("person_check_status")
        .select("person_id, branch_id, check_name, due_date, recurring, last_completed_on")
        .eq("company_id", companyId)
        .not("due_date", "is", null)
        .lte("due_date", horizon),
      supabase
        .from("service_user_check_status")
        .select("service_user_id, branch_id, check_name, due_date, recurring, last_completed_on")
        .eq("company_id", companyId)
        .not("due_date", "is", null)
        .lte("due_date", horizon),
      supabase.from("people").select("id, full_name").eq("company_id", companyId),
      supabase.from("service_users").select("id, full_name").eq("company_id", companyId),
      supabase.from("branches").select("id, name").eq("company_id", companyId),
      supabase
        .from("people")
        .select("id")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .neq("employment_status", "leaver")
        .limit(1),
      supabase
        .from("service_users")
        .select("id")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .neq("service_status", "cancelled")
        .limit(1),
    ]);
  for (const res of [peopleChecks, suChecks]) {
    if (res.error) throw new Error(res.error.message);
  }

  const personName = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));
  const suName = new Map((sus.data ?? []).map((s) => [s.id, s.full_name]));
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));

  /* A DATE IN THE PAST IS NOT THE SAME AS SOMETHING STILL TO DO. See
     lib/notifications/reportable.ts: a one-off that has been done, and a check whose own
     completion has already met its due date, are finished and are not reported. */
  const outstanding = (r: { recurring: boolean | null; due_date: string | null; last_completed_on: string | null }) =>
    reportableCheck({
      recurring: r.recurring === true,
      dueDate: r.due_date,
      lastCompletedOn: r.last_completed_on,
    });

  const peopleOut: ReportingCheck[] = (peopleChecks.data ?? [])
    .filter(outstanding)
    .map((r) => ({
      population: "people" as const,
      recordId: r.person_id,
      recordName: personName.get(r.person_id) ?? "Unknown",
      branchId: r.branch_id,
      branchName: branchName.get(r.branch_id) ?? "",
      checkName: r.check_name,
      dueDate: r.due_date as string,
      planned: plannedFor(planned, r.person_id, r.check_name),
    }));
  const suOut: ReportingCheck[] = (suChecks.data ?? [])
    .filter(outstanding)
    .map((r) => ({
      population: "service_users" as const,
      recordId: r.service_user_id,
      recordName: suName.get(r.service_user_id) ?? "Unknown",
      branchId: r.branch_id,
      branchName: branchName.get(r.branch_id) ?? "",
      checkName: r.check_name,
      dueDate: r.due_date as string,
      planned: plannedFor(planned, r.service_user_id, r.check_name),
    }));

  return {
    people: peopleOut,
    serviceUsers: suOut,
    hasPeople: (activePeople.data ?? []).length > 0,
    hasServiceUsers: (activeSus.data ?? []).length > 0,
  };
}

function groupBy<T extends Record<string, unknown>>(
  rows: T[],
  keyField: string,
  valueField: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const key = row[keyField] as string;
    const value = row[valueField] as string;
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  }
  return map;
}
