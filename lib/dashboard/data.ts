import "server-only";

/**
 * Be Care Compliant — Dashboard summary data.
 *
 * All reads go through the RLS-scoped user client, so every figure already
 * respects the caller's role and branch scope (a Branch Manager sees their
 * branch, an Admin/Registered role sees the whole company). Leavers, archived
 * people and cancelled/discharged service users are excluded because the
 * rollup views used to define the "active" set already exclude them.
 */

import { createClient } from "@/lib/supabase/server";
import {
  listAbsenceRegister,
  listOpenBookings,
  listActivePeople,
} from "@/lib/absence/data";

/** Today in Europe/London as an ISO yyyy-mm-dd string (dates compare lexically). */
function londonTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DueBuckets = { overdue: number; due14: number; due30: number };

/**
 * Bucket active records by their MOST URGENT check's due date, into fixed 14 and
 * 30 day windows (independent of the amber setting). Nested: due30 includes
 * due14. A record with an overdue check counts as overdue only.
 */
async function bucketPopulation(
  statusView: "person_check_status" | "service_user_check_status",
  rollupView: "person_rollup" | "service_user_rollup",
  idCol: "person_id" | "service_user_id",
  companyId: string,
): Promise<DueBuckets> {
  const supabase = await createClient();
  const [{ data: active }, { data: checks }] = await Promise.all([
    supabase.from(rollupView).select(idCol).eq("company_id", companyId),
    supabase.from(statusView).select(`${idCol}, due_date, rag`).eq("company_id", companyId),
  ]);

  const activeSet = new Set<string>(
    ((active as Array<Record<string, string>> | null) ?? []).map((r) => r[idCol]),
  );

  const today = londonTodayIso();
  const in14 = addDaysIso(today, 14);
  const in30 = addDaysIso(today, 30);

  // Aggregate per active record: is it overdue (any red check), and the soonest
  // FUTURE due date. Overdue is authoritative from the view's rag, NOT from a raw
  // date compare (a completed one-off check keeps a historical due_date but is
  // green, so it must not read as overdue).
  const agg = new Map<string, { red: boolean; minFuture: string | null }>();
  for (const c of (checks as Array<Record<string, string | null>> | null) ?? []) {
    const id = c[idCol] as string | null;
    if (!id || !activeSet.has(id)) continue;
    let a = agg.get(id);
    if (!a) {
      a = { red: false, minFuture: null };
      agg.set(id, a);
    }
    if (c.rag === "red") a.red = true;
    const due = c.due_date as string | null;
    if (due && due >= today && (!a.minFuture || due < a.minFuture)) a.minFuture = due;
  }

  const buckets: DueBuckets = { overdue: 0, due14: 0, due30: 0 };
  for (const a of agg.values()) {
    if (a.red) {
      buckets.overdue += 1;
      continue;
    }
    if (!a.minFuture) continue;
    if (a.minFuture <= in14) {
      buckets.due14 += 1;
      buckets.due30 += 1;
    } else if (a.minFuture <= in30) {
      buckets.due30 += 1;
    }
  }
  return buckets;
}

export async function getComplianceBuckets(
  companyId: string,
): Promise<{ people: DueBuckets; serviceUsers: DueBuckets }> {
  const [people, serviceUsers] = await Promise.all([
    bucketPopulation("person_check_status", "person_rollup", "person_id", companyId),
    bucketPopulation(
      "service_user_check_status",
      "service_user_rollup",
      "service_user_id",
      companyId,
    ),
  ]);
  return { people, serviceUsers };
}

/** Count of pending holiday requests the caller may see (RLS-scoped). */
export async function getHolidayPendingCount(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("holiday_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");
  return count ?? 0;
}

export type AbsenceMeetingLine = { name: string; stage: string };
export type AbsenceMeetingSoon = AbsenceMeetingLine & { date: string };

/**
 * Absence meetings needing attention:
 *  - toBook: people whose derived stage is past their last recorded meeting AND
 *    who have no scheduled (unrecorded) meeting yet.
 *  - next7: scheduled, not-yet-held meetings within the next 7 days.
 */
export async function getAbsenceMeetingSummary(
  companyId: string,
): Promise<{ toBook: AbsenceMeetingLine[]; next7: AbsenceMeetingSoon[] }> {
  const [{ rows }, openBookings, people] = await Promise.all([
    listAbsenceRegister(companyId, null),
    listOpenBookings(companyId),
    listActivePeople(companyId),
  ]);

  const nameById = new Map<string, string>();
  for (const p of people) nameById.set(p.id, p.full_name);
  for (const r of rows) nameById.set(r.personId, r.fullName);

  const stageLabel = (stage: number | null, label: string | null) =>
    label ?? (stage ? `Stage ${stage}` : "Meeting");

  const bookedPersonIds = new Set(openBookings.map((b) => b.person_id));
  const toBook: AbsenceMeetingLine[] = rows
    .filter((r) => r.status.meetingDue && !bookedPersonIds.has(r.personId))
    .map((r) => ({
      name: r.fullName,
      stage: stageLabel(r.status.derivedStage, r.status.derivedLabel),
    }));

  const today = londonTodayIso();
  const in7 = addDaysIso(today, 7);
  const next7: AbsenceMeetingSoon[] = openBookings
    .filter((b) => b.meeting_date && b.meeting_date >= today && b.meeting_date <= in7)
    .map((b) => ({
      name: nameById.get(b.person_id) ?? "A team member",
      stage: b.stage ? `Stage ${b.stage}` : "Meeting",
      date: b.meeting_date as string,
    }));

  return { toBook, next7 };
}
