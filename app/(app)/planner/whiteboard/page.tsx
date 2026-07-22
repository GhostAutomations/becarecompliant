import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listBoardBookings, getPlannerFormData } from "@/lib/planner/data";
import BookingForm from "@/components/planner/booking-form";
import WhiteboardCalendar from "@/components/planner/whiteboard-calendar";

export const metadata: Metadata = { title: "Whiteboard" };

const ALLOWED = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

const pad = (n: number) => String(n).padStart(2, "0");

export default async function WhiteboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { month: monthParam } = await searchParams;
  const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const [yearStr, monthStr] = match.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

  const [bookings, formData] = await Promise.all([
    listBoardBookings(monthStart, monthEnd),
    getPlannerFormData(profile.company_id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Whiteboard</h1>
          <p className="page-subtitle">
            Everything booked in across the branch, on a month calendar.
          </p>
        </div>
        <Link href="/planner" className="btn-ghost text-sm">My Planner</Link>
      </div>

      <BookingForm data={formData} currentUserId={user.id} />
      <WhiteboardCalendar
        year={year}
        month={month}
        todayIso={todayIso}
        bookings={bookings}
        branches={formData.branches}
      />
    </div>
  );
}
