import "server-only";

/**
 * Be Care Compliant — what a Team Member sees in their own area.
 *
 * Phil's scope, 2026-07-26: "they can only see any forms or policies assigned to
 * them and past forms they have submitted and current holday bookings to ament or
 * change". So exactly three things, and nothing else. Assignments (forms and
 * policies) are the next increment; this covers the record, the holidays and the
 * submissions.
 *
 * Every read here goes through the normal RLS client. A staff login is limited by
 * the policies themselves, not by these queries being careful: people_select
 * matches profile_id = auth.uid(), holiday_requests_select matches their own
 * person, and evidence_select gives them what they authored.
 */

import { createClient } from "@/lib/supabase/server";
import type { HolidayRequestRow } from "@/lib/holidays/data";

export type MyRecord = {
  id: string;
  full_name: string;
  job_title: string | null;
  branch_name: string | null;
  start_date: string | null;
};

/** The Person record this login belongs to, or null when it was never linked. */
export async function getMyRecord(): Promise<MyRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("people")
    .select("id, full_name, job_title, start_date, branches:branch_id(name)")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return null;

  const branch = data.branches as { name: string } | { name: string }[] | null;
  return {
    id: data.id as string,
    full_name: data.full_name as string,
    job_title: (data.job_title as string | null) ?? null,
    branch_name: (Array.isArray(branch) ? branch[0]?.name : branch?.name) ?? null,
    start_date: (data.start_date as string | null) ?? null,
  };
}

/** Their holidays: everything still to come, plus anything decided recently. */
export async function getMyHolidays(personId: string): Promise<HolidayRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("holiday_requests")
    .select("*")
    .eq("person_id", personId)
    .order("start_date", { ascending: false })
    .limit(50);
  return (data as HolidayRequestRow[] | null) ?? [];
}

export type MySubmission = {
  id: string;
  form_name: string;
  submitted_at: string;
};

/**
 * Forms they have submitted themselves. Keyed on author_id, so it is their own
 * work only: a supervision their manager wrote about them is not in here, which
 * is exactly the scope Phil set.
 */
export async function getMySubmissions(): Promise<MySubmission[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("evidence")
    .select("id, submitted_at, forms:form_id(name)")
    .eq("author_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(100);

  return ((data ?? []) as Array<{
    id: string;
    submitted_at: string;
    forms: { name: string } | { name: string }[] | null;
  }>).map((r) => {
    const form = Array.isArray(r.forms) ? r.forms[0] : r.forms;
    return {
      id: r.id,
      form_name: form?.name ?? "Form",
      submitted_at: r.submitted_at,
    };
  });
}
