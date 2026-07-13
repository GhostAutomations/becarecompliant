import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";

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
  role: "company_admin" | "manager" | "supervisor";
  /** Branches a manager covers (empty for admins: they cover the company). */
  branchIds: string[];
  /** Supervisor caseload record ids. */
  personIds: string[];
  serviceUserIds: string[];
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

const DEFAULT_SETTINGS = {
  emailDigestEnabled: true,
  smsEnabled: false,
  chaserFirstDays: 7,
  chaserSecondDays: 14,
  smsOverdueDays: 14,
};

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
 * the whole company, Managers get their branches (user_branches), Supervisors
 * get their assigned caseload. Team Members are never compliance recipients.
 * Only active profiles with an email qualify.
 */
export async function getRecipients(companyId: string): Promise<Recipient[]> {
  const supabase = createServiceClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("role", ["company_admin", "manager", "supervisor"]);
  if (error) throw new Error(error.message);
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const [branchesRes, peopleRes, susRes] = await Promise.all([
    supabase.from("user_branches").select("user_id, branch_id").in("user_id", ids),
    supabase.from("person_assignments").select("user_id, person_id").in("user_id", ids),
    supabase
      .from("service_user_assignments")
      .select("user_id, service_user_id")
      .in("user_id", ids),
  ]);

  const branchByUser = groupBy(branchesRes.data ?? [], "user_id", "branch_id");
  const peopleByUser = groupBy(peopleRes.data ?? [], "user_id", "person_id");
  const susByUser = groupBy(susRes.data ?? [], "user_id", "service_user_id");

  return profiles
    .filter((p) => Boolean(p.email))
    .map((p) => ({
      profileId: p.id,
      fullName: p.full_name || p.email,
      email: p.email,
      phone: (p.phone as string | null) || null,
      role: p.role as Recipient["role"],
      branchIds: branchByUser.get(p.id) ?? [],
      personIds: peopleByUser.get(p.id) ?? [],
      serviceUserIds: susByUser.get(p.id) ?? [],
    }));
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
 * Checks due on or before today + 14 days (so overdue AND due soon), per
 * population, plus whether the company has active records of each population.
 * The overdue / due soon split is done in the pure logic layer.
 */
export async function getReportingData(companyId: string): Promise<ReportingData> {
  const supabase = createServiceClient();
  const horizon = addDaysIso(formatCivilDate(todayInLondon()), REPORTING_HORIZON_DAYS);

  const [peopleChecks, suChecks, people, sus, branches, activePeople, activeSus] =
    await Promise.all([
      supabase
        .from("person_check_status")
        .select("person_id, branch_id, check_name, due_date")
        .eq("company_id", companyId)
        .not("due_date", "is", null)
        .lte("due_date", horizon),
      supabase
        .from("service_user_check_status")
        .select("service_user_id, branch_id, check_name, due_date")
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

  const peopleOut: ReportingCheck[] = (peopleChecks.data ?? [])
    .filter((r) => r.due_date)
    .map((r) => ({
      population: "people" as const,
      recordId: r.person_id,
      recordName: personName.get(r.person_id) ?? "Unknown",
      branchId: r.branch_id,
      branchName: branchName.get(r.branch_id) ?? "",
      checkName: r.check_name,
      dueDate: r.due_date as string,
    }));
  const suOut: ReportingCheck[] = (suChecks.data ?? [])
    .filter((r) => r.due_date)
    .map((r) => ({
      population: "service_users" as const,
      recordId: r.service_user_id,
      recordName: suName.get(r.service_user_id) ?? "Unknown",
      branchId: r.branch_id,
      branchName: branchName.get(r.branch_id) ?? "",
      checkName: r.check_name,
      dueDate: r.due_date as string,
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
