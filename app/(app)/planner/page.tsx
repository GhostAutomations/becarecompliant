import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listMyBookings, getPlannerFormData } from "@/lib/planner/data";
import BookingForm from "@/components/planner/booking-form";
import MyPlannerList from "@/components/planner/my-planner-list";
import WhiteboardCalendar from "@/components/planner/whiteboard-calendar";

export const metadata: Metadata = { title: "My Planner" };

const ALLOWED = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const [bookings, formData] = await Promise.all([
    listMyBookings(user.id),
    getPlannerFormData(profile.company_id),
  ]);
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const { month: monthParam, view } = await searchParams;
  // Calendar is the default view; the list is opt-in via ?view=list.
  const isCalendar = view !== "list";
  const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const [yearStr, monthStr] = match.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  return (
    <div className={`flex h-full min-h-0 flex-col gap-6 ${isCalendar ? "w-full" : "mx-auto max-w-3xl"}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">My Planner</h1>
          <p className="page-subtitle">
            The tasks you have booked in to carry out. Book a new one or manage what
            is coming up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/15 text-xs">
            <Link href="/planner" className={`px-3 py-1.5 ${isCalendar ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}>Calendar</Link>
            <Link href="/planner?view=list" className={`px-3 py-1.5 ${!isCalendar ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}>List</Link>
          </div>
          <Link href="/planner/whiteboard" className="btn-ghost text-sm">Whiteboard</Link>
        </div>
      </div>

      <BookingForm data={formData} currentUserId={user.id} />

      {isCalendar ? (
        <WhiteboardCalendar
          year={year}
          month={month}
          todayIso={todayIso}
          bookings={bookings}
          branches={[]}
          basePath="/planner"
        />
      ) : (
        <MyPlannerList bookings={bookings} todayIso={todayIso} />
      )}
    </div>
  );
}
