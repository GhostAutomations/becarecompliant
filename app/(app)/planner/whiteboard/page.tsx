import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listBoardBookings, getPlannerFormData, getWhiteboardBoard } from "@/lib/planner/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import BookingForm from "@/components/planner/booking-form";
import WhiteboardCalendar from "@/components/planner/whiteboard-calendar";
import WhiteboardBoard from "@/components/planner/whiteboard-board";

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
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { month: monthParam, view } = await searchParams;
  // Whiteboard board is the default view; the month calendar is opt-in.
  const isCalendar = view === "calendar";

  const [formData, branchTypes] = await Promise.all([
    getPlannerFormData(profile.company_id),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);
  const branches = branchTypes.map((b) => ({ id: b.id, name: b.name }));

  const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const [yearStr, monthStr] = match.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

  const calendarBookings = isCalendar ? await listBoardBookings(monthStart, monthEnd) : [];
  const board = isCalendar ? null : await getWhiteboardBoard(profile.company_id, todayIso);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Whiteboard</h1>
          <p className="page-subtitle">
            What needs booking in over the next 28 days, and everything booked in on the board.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/15 text-xs">
            <Link href="/planner/whiteboard" className={`px-3 py-1.5 ${!isCalendar ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}>Whiteboard</Link>
            <Link href="/planner/whiteboard?view=calendar" className={`px-3 py-1.5 ${isCalendar ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10"}`}>Calendar</Link>
          </div>
          <BookingForm data={formData} currentUserId={user.id} />
        </div>
      </div>

      {isCalendar ? (
        <WhiteboardCalendar
          year={year}
          month={month}
          todayIso={todayIso}
          bookings={calendarBookings}
          branches={branches}
          basePath="/planner/whiteboard?view=calendar"
        />
      ) : (
        <WhiteboardBoard board={board!} branches={branches} todayIso={todayIso} />
      )}
    </div>
  );
}
