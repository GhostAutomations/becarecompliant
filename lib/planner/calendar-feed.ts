import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { bookingHref } from "@/lib/planner/booking-link";
import { calendarClientFrom, tidyAgent } from "@/lib/planner/calendar-client";
import type { PlannerFeedEvent } from "@/lib/planner/ics";

/**
 * The subscribable planner calendar: making a link, revoking it, and reading it back.
 *
 * Phil, 2026-09-15: office members want their planner bookings in their own Outlook. He chose
 * the SUBSCRIBED FEED over calendar invites or a Microsoft Graph integration, knowing Outlook
 * refreshes a subscribed calendar on its own schedule (roughly three hours, sometimes far
 * longer) and that nothing can make it go faster.
 *
 * THE TOKEN IS THE PASSWORD. Outlook fetches with no login and no cookie, so possession of the
 * URL is the whole of the authentication. Everything here is shaped by that:
 *
 *  - the token is 32 random bytes from a CSPRNG, not a uuid and not derived from anything;
 *  - it is never logged, never put in an audit summary and never sent in an email;
 *  - a feed only ever answers for ONE conductor, resolved from the token itself, so there is no
 *    parameter a caller could tamper with to read a colleague's diary;
 *  - rotating it is the revoke, and it is one button away.
 */

/** 64 hex characters. Long enough that guessing is not a threat model. */
function newToken(): string {
  return randomBytes(32).toString("hex");
}

export type CalendarFeed = {
  token: string;
  createdAt: string;
  rotatedAt: string | null;
  lastFetchedAt: string | null;
};

/** The subscribe URL for a token. */
export function feedUrl(token: string): string {
  return `${siteUrl()}/calendar/${token}/planner.ics`;
}

/**
 * The same URL as webcal://, which is what a PHONE should be given.
 *
 * WHY BOTH FORMS EXIST. Open an https link to a .ics and the browser DOWNLOADS it, which on a
 * phone means a one-off import of today's bookings that never updates again. Open the webcal
 * form and the calendar app offers to SUBSCRIBE. That is the same trap Phil hit on the Mac with
 * Outlook's "Upload from file", and a QR code pointing at the https form would walk every member
 * of staff straight back into it.
 *
 * https stays the copyable one, because Outlook on the web wants a pasted https URL.
 */
export function feedWebcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:\/\//, "webcal://");
}

/**
 * The caller's own feed, or null if they have never made one.
 *
 * RLS on planner_calendar_feeds allows only `profile_id = auth.uid()`, so this cannot return
 * somebody else's row even if the query were wrong.
 */
export async function getMyFeed(): Promise<CalendarFeed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_calendar_feeds")
    .select("token, created_at, rotated_at, last_fetched_at")
    .maybeSingle();
  if (!data) return null;
  return {
    token: data.token as string,
    createdAt: data.created_at as string,
    rotatedAt: (data.rotated_at as string | null) ?? null,
    lastFetchedAt: (data.last_fetched_at as string | null) ?? null,
  };
}

/** Create the caller's feed if they have none, and hand back whichever they now have. */
export async function ensureMyFeed(profileId: string, companyId: string): Promise<CalendarFeed> {
  const existing = await getMyFeed();
  if (existing) return existing;
  const supabase = await createClient();
  const token = newToken();
  const { data, error } = await supabase
    .from("planner_calendar_feeds")
    .insert({ profile_id: profileId, company_id: companyId, token })
    .select("token, created_at, rotated_at, last_fetched_at")
    .single();
  if (error || !data) throw new Error("Could not create the calendar link.");
  return {
    token: data.token as string,
    createdAt: data.created_at as string,
    rotatedAt: null,
    lastFetchedAt: null,
  };
}

/**
 * Replace the token. THE OLD LINK STOPS WORKING IMMEDIATELY.
 *
 * This is the revoke. Anyone still subscribed to the old URL, including the owner's own
 * Outlook, starts getting a 404 at their next refresh and has to re-subscribe, which is
 * exactly what should happen to a link that leaked.
 */
export async function rotateMyFeed(): Promise<CalendarFeed> {
  const supabase = await createClient();
  const token = newToken();
  const { data, error } = await supabase
    .from("planner_calendar_feeds")
    .update({ token, rotated_at: new Date().toISOString(), last_fetched_at: null })
    .select("token, created_at, rotated_at, last_fetched_at")
    .single();
  if (error || !data) throw new Error("Could not change the calendar link.");
  return {
    token: data.token as string,
    createdAt: data.created_at as string,
    rotatedAt: (data.rotated_at as string | null) ?? null,
    lastFetchedAt: null,
  };
}

/** Delete the feed entirely, so the link dies and no new one is served. */
export async function deleteMyFeed(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("planner_calendar_feeds").delete().neq("token", "");
}

export type FeedSubject = {
  profileId: string;
  companyId: string;
  ownerName: string | null;
};

/**
 * Resolve a token to the one person it belongs to, and their bookings.
 *
 * SERVICE ROLE, because the fetch carries no session: Outlook is not signed in and never will
 * be. That makes this the highest-risk read in the feature, so it is deliberately narrow.
 * Every filter below is derived from the TOKEN, never from anything the caller sent:
 *
 *  - conductor_profile_id is the profile the token resolves to, so only that person's own
 *    bookings are ever selected;
 *  - company_id is pinned as well, so a profile moved between companies cannot drag its old
 *    company's bookings along;
 *  - cancelled bookings are dropped here rather than in the writer, so a cancelled job leaves
 *    the diary at the next refresh (Phil's choice, 2026-09-15) and completed ones stay put;
 *  - the window is bounded, so the file stays small and an ancient booking does not reappear.
 *
 * An unknown token returns null and the route answers 404 with no detail. A wrong token must
 * not be distinguishable from a revoked one, or the 404 becomes an oracle.
 */
const PAST_DAYS = 90;
const FUTURE_DAYS = 365;

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type FeedRow = {
  id: string;
  population: "people" | "service_users" | null;
  subject_person_id: string | null;
  subject_service_user_id: string | null;
  check_instance_id: string | null;
  tracker_form_key: string | null;
  check_kind: string | null;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  status: "planned" | "completed" | "cancelled";
  notes: string | null;
  updated_at: string | null;
  person: { full_name: string } | { full_name: string }[] | null;
  service_user: { full_name: string } | { full_name: string }[] | null;
  branch: { name: string } | { name: string }[] | null;
};

function one<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function loadFeedByToken(
  token: string,
  userAgent?: string | null,
): Promise<{ subject: FeedSubject; events: PlannerFeedEvent[] } | null> {
  // A token of the wrong shape never reaches the database.
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const service = createServiceClient();
  const { data: feed } = await service
    .from("planner_calendar_feeds")
    .select("profile_id, company_id")
    .eq("token", token)
    .maybeSingle();
  if (!feed) return null;

  const profileId = feed.profile_id as string;
  const companyId = feed.company_id as string;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    service.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    service
      .from("planner_bookings")
      .select(
        "id, population, subject_person_id, subject_service_user_id, check_instance_id, tracker_form_key, check_kind, title, scheduled_date, start_time, duration_minutes, status, notes, updated_at, person:people(full_name), service_user:service_users(full_name), branch:branches(name)",
      )
      .eq("conductor_profile_id", profileId)
      .eq("company_id", companyId)
      .neq("status", "cancelled")
      .gte("scheduled_date", isoOffset(-PAST_DAYS))
      .lte("scheduled_date", isoOffset(FUTURE_DAYS))
      .order("scheduled_date", { ascending: true }),
  ]);

  const base = siteUrl();
  const events: PlannerFeedEvent[] = ((rows as FeedRow[] | null) ?? []).map((r) => {
    const person = one(r.person);
    const su = one(r.service_user);
    const href = bookingHref({
      population: r.population,
      subjectId: r.subject_person_id ?? r.subject_service_user_id,
      checkInstanceId: r.check_instance_id,
      trackerFormKey: r.tracker_form_key,
      status: r.status,
    });
    return {
      id: r.id,
      label: r.title?.trim() || r.check_kind?.trim() || "Planner task",
      subjectName: person?.full_name ?? su?.full_name ?? null,
      branchName: one(r.branch)?.name ?? null,
      scheduledDate: r.scheduled_date,
      startTime: r.start_time ? r.start_time.slice(0, 5) : null,
      durationMinutes: r.duration_minutes,
      status: r.status,
      // NOTES ARE LEFT OUT ON PURPOSE. They are free text a manager wrote about a visit, they
      // can name anyone and say anything, and this file travels to a URL with no login on it.
      // The title says what and where; the detail stays behind the login, one click away.
      notes: null,
      /*
       * STRAIGHT TO THE JOB, not to the Planner.
       *
       * Phil, 2026-09-15: "in their outlook will they have a link to the task they need to
       * complete?" bookingHref is the same rule the Planner list already uses, so the link in
       * the diary and the link on the screen can never drift apart: a planned task with a check
       * opens that check's form ready to complete, a tracker task opens its form, and anything
       * else (ad-hoc, or already completed) opens the record. Null means there is genuinely
       * nothing to open, and the Planner is the honest fallback.
       *
       * The URL carries record ids, which are uuids and not names, and it opens nothing without
       * a login. That is the deliberate trade: a leaked link gives away that a record exists,
       * which it already did, and in exchange the person doing the work gets one click instead
       * of a hunt through a register.
       */
      url: href ? `${base}${href}` : `${base}/planner`,
      updatedAt: r.updated_at,
    };
  });

  /*
   * AWAITED, NOT FIRE AND FORGET (migration 0275, fixing a bug I shipped the same day).
   *
   * This started as `void recordFetch(...)`. On a serverless function the process is frozen the
   * moment the response is returned, so work still in flight never happens: nothing was ever
   * written and the Share page told Phil no calendar had fetched while his iPhone and Outlook
   * were both fetching happily. A panel that is confidently wrong is worse than no panel.
   *
   * One RPC, awaited, doing both writes inside the database. Still never allowed to fail the
   * fetch: diagnostics are not worth withholding somebody's calendar over.
   */
  try {
    await service.rpc("record_planner_feed_fetch", {
      p_token: token,
      p_client: calendarClientFrom(userAgent),
      p_agent: tidyAgent(userAgent),
    });
  } catch {
    // Deliberately swallowed. The calendar is the deliverable; this line is a convenience.
  }

  return {
    subject: { profileId, companyId, ownerName: (profile?.full_name as string | null) ?? null },
    events,
  };
}


export type FeedClientRow = {
  client: string;
  userAgent: string | null;
  lastFetchedAt: string;
  fetchCount: number;
};

/** Which calendars have fetched the caller's own feed. RLS allows only their own rows. */
export async function getMyFeedClients(): Promise<FeedClientRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_calendar_feed_clients")
    .select("client, user_agent, last_fetched_at, fetch_count")
    .order("last_fetched_at", { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    client: r.client as string,
    userAgent: (r.user_agent as string | null) ?? null,
    lastFetchedAt: r.last_fetched_at as string,
    fetchCount: (r.fetch_count as number) ?? 0,
  }));
}
