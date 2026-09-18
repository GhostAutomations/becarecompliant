import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/billing/tier";
import { listMyBookings, listCompanyBookings, getPlannerFormData, PLANNER_ROLES } from "@/lib/planner/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import BookingForm from "@/components/planner/booking-form";
import PlannerViewToggle from "@/components/planner/view-toggle";
import OverdueBookings from "@/components/planner/my-planner-list";
import WhiteboardCalendar from "@/components/planner/whiteboard-calendar";
import PlannerWhoPicker from "@/components/planner/who-picker";
import { plannerWho, whoParam, filterToWho, canViewIndividuals } from "@/lib/planner/who";

export const metadata: Metadata = { title: "My Planner" };

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; who?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!PLANNER_ROLES.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const [bookings, formData, branchTypes] = await Promise.all([
    listMyBookings(user.id),
    getPlannerFormData(profile.company_id, profile),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);
  const branches = branchTypes.map((b) => ({ id: b.id, name: b.name }));
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  /*
   * THE VIEW IS THE USER'S SAVED CHOICE, remembered across pages and sessions, so the Planner
   * opens on whatever they were last looking at. Month, Week or List; migration 0187 renamed
   * 'calendar' to 'month' and added the week, so an existing preference carries over.
   */
  const supabase = await createClient();
  const { data: pref } = await supabase.from("profiles").select("planner_view").eq("id", user.id).maybeSingle();
  // 'list' is a preference some users will still carry; it is read as 'month' rather than
  // migrated, so nobody lands on a view that no longer exists.
  const saved = (pref?.planner_view as string | null) ?? "month";
  const view: "month" | "week" = saved === "week" ? "week" : "month";

  const { month: monthParam, week: weekParam, who } = await searchParams;
  /*
   * WHOSE CALENDAR (Phil, 2026-09-15). MINE IS NOW THE DEFAULT, for everyone. It used to open on
   * the whole company, and the note here used to argue that "show me only mine for a moment is a
   * question you ask, not a way you work". That was wrong: the page is called My Planner, and
   * somebody opening it is asking where THEY are going.
   *
   * Admins, Registered Managers and the Responsible Individual can also single out one colleague,
   * because "All" answers "who is where this month" and is unreadable when the question is "what
   * has Rebecca got on". The rule lives in lib/planner/who.ts and is tested there; a role that
   * may not do this has the parameter refused as well as the control hidden.
   */
  const conductorIds = formData.conductors.map((c) => c.id);
  const selection = plannerWho(who, user.id, profile.role, conductorIds);
  const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const [yearStr, monthStr] = match.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Defaults to the week containing today, which is the one somebody opening this page wants.
  const weekStartIso = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : todayIso;

  /*
   * The calendar reads the WHOLE COMPANY, the overdue band above it reads only yours. Two
   * different questions on one page: what have I let slip, and who is where this month. The
   * range is only ever the span on screen, so a month view never pulls a year of rows.
   */
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  const weekEndIso = new Date(Date.UTC(
    Number(weekStartIso.slice(0, 4)),
    Number(weekStartIso.slice(5, 7)) - 1,
    Number(weekStartIso.slice(8, 10)) + 13,
  )).toISOString().slice(0, 10);
  const weekFromIso = new Date(Date.UTC(
    Number(weekStartIso.slice(0, 4)),
    Number(weekStartIso.slice(5, 7)) - 1,
    Number(weekStartIso.slice(8, 10)) - 7,
  )).toISOString().slice(0, 10);
  const everyone = await listCompanyBookings(
    view === "week" ? weekFromIso : monthStart,
    view === "week" ? weekEndIso : monthEnd,
    profile.company_id,
  );
  /* A FILTER, NOT A WIDENING. listCompanyBookings is already RLS scoped, so narrowing it to one
     person can never show more than All showed this viewer a moment ago. */
  const calendarBookings = filterToWho(everyone, selection, user.id);
  const viewingName =
    selection.kind === "person"
      ? (formData.conductors.find((c) => c.id === selection.personId)?.name ?? null)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">My Planner</h1>
          {/* The subtitle follows the selection. Landing on your own calendar and reading
              "everybody's work" was the old copy describing the old default. */}
          {/* SIX WORDS ABOUT WHAT A PLANNER IS (Phil, 2026-09-18). It used to run "What is
              overdue for you to carry out, and your own work on the calendar. Book a new one
              or manage what is coming up." -- a new WHAT, and managing what, beside a New
              booking button already saying it. Describing the two bands instead was no better:
              a subtitle that explains the layout is a subtitle doing the layout's job. The
              Overdue band labels itself in red, so this only has to say what the page is for,
              and follow whose diary is on screen. */}
          <p className="page-subtitle">
            {selection.kind === "all"
              ? "Where everyone is going, and when."
              : selection.kind === "person"
                ? `Where ${viewingName ?? "they"} ${viewingName ? "is" : "are"} going, and when.`
                : "Where you are going, and when."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Whose, then how long. The span toggle is saved per user; this one is not, because
              which colleague you are looking at is a question you ask, not a way you work. */}
          <PlannerWhoPicker
            who={whoParam(selection) ?? "mine"}
            people={formData.conductors.filter((c) => c.id !== user.id)}
            canViewIndividuals={canViewIndividuals(profile.role)}
            month={monthParam}
            week={weekParam}
          />
          <PlannerViewToggle current={view} />
          {/* Set up once and then forgotten, so it is a link out rather than a panel taking up
              room on a page that is mostly calendar. */}
          <Link href="/planner/calendar" className="btn-outline text-xs">
            Share
          </Link>
          <BookingForm data={formData} currentUserId={user.id} />
        </div>
      </div>

      {/* Overdue first, always, whichever span is showing: a job from last month is not on this
          month's grid, and a calendar on its own is where those go to be forgotten. */}
      <OverdueBookings
        bookings={bookings}
        todayIso={todayIso}
        formData={formData}
        currentUserId={user.id}
      />

      <WhiteboardCalendar
        span={view}
        year={year}
        month={month}
        weekStartIso={weekStartIso}
        todayIso={todayIso}
        bookings={calendarBookings}
        branches={branches}
        basePath={whoParam(selection) ? `/planner?who=${whoParam(selection)}` : "/planner"}
        currentUserId={user.id}
        formData={formData}
      />
    </div>
  );
}
