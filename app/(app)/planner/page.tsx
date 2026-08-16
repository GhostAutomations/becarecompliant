import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/billing/tier";
import { listMyBookings, getPlannerFormData, PLANNER_ROLES } from "@/lib/planner/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import BookingForm from "@/components/planner/booking-form";
import PlannerViewToggle from "@/components/planner/view-toggle";
import MyPlannerList from "@/components/planner/my-planner-list";
import WhiteboardCalendar from "@/components/planner/whiteboard-calendar";

export const metadata: Metadata = { title: "My Planner" };

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string }>;
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
  const saved = (pref?.planner_view as string | null) ?? "month";
  const view: "month" | "week" | "list" =
    saved === "list" ? "list" : saved === "week" ? "week" : "month";

  const { month: monthParam, week: weekParam } = await searchParams;
  const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const [yearStr, monthStr] = match.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Defaults to the week containing today, which is the one somebody opening this page wants.
  const weekStartIso = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : todayIso;

  return (
    <div className={`flex h-full min-h-0 flex-col gap-6 ${view === "list" ? "mx-auto max-w-3xl" : "w-full"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">My Planner</h1>
          <p className="page-subtitle">
            The tasks you have booked in to carry out. Book a new one or manage what
            is coming up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlannerViewToggle current={view} />
          <BookingForm data={formData} currentUserId={user.id} />
        </div>
      </div>

      {view === "list" ? (
        <MyPlannerList bookings={bookings} todayIso={todayIso} />
      ) : (
        <WhiteboardCalendar
          span={view}
          year={year}
          month={month}
          weekStartIso={weekStartIso}
          todayIso={todayIso}
          bookings={bookings}
          branches={branches}
          basePath="/planner"
        />
      )}
    </div>
  );
}
