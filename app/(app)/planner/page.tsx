import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listMyBookings, getPlannerFormData } from "@/lib/planner/data";
import BookingForm from "@/components/planner/booking-form";
import MyPlannerList from "@/components/planner/my-planner-list";

export const metadata: Metadata = { title: "My Planner" };

const ALLOWED = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

export default async function PlannerPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const [bookings, formData] = await Promise.all([
    listMyBookings(user.id),
    getPlannerFormData(profile.company_id),
  ]);
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">My Planner</h1>
          <p className="page-subtitle">
            The tasks you have booked in to carry out. Book a new one or manage what
            is coming up.
          </p>
        </div>
        <Link href="/planner/whiteboard" className="btn-ghost text-sm">Whiteboard</Link>
      </div>

      <BookingForm data={formData} currentUserId={user.id} />
      <MyPlannerList bookings={bookings} todayIso={todayIso} />
    </div>
  );
}
