import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { getPlannerFormData, getWhiteboardBoard } from "@/lib/planner/data";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";
import BookingForm from "@/components/planner/booking-form";
import BranchSelect from "@/components/planner/branch-select";
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

export default async function WhiteboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { branch } = await searchParams;
  const branchId = branch ?? "";

  const [formData, branchTypes] = await Promise.all([
    getPlannerFormData(profile.company_id, profile),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);
  const branches = branchTypes.map((b) => ({ id: b.id, name: b.name }));

  const board = await getWhiteboardBoard(profile.company_id, todayIso);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Whiteboard</h1>
          <p className="page-subtitle">
            What needs booking in over the next 28 days, and everything booked in on the board.
          </p>
        </div>
        {/* THE CALENDAR IS GONE FROM HERE (Phil, 2026-08-17). The Whiteboard answers one
            question — what needs booking in and what is booked — and the month grid answered a
            different one badly, in a cell too small to hold a name without truncating it. The
            calendar lives on My Planner. */}
        <div className="flex items-center gap-2">
          {branches.length > 1 ? (
            <BranchSelect branches={branches} value={branchId} basePath="/planner/whiteboard" />
          ) : null}
          <BookingForm data={formData} currentUserId={user.id} />
        </div>
      </div>

      <WhiteboardBoard
        board={board}
        branchId={branchId}
        conductors={formData.conductors}
        currentUserId={user.id}
        todayIso={todayIso}
      />
    </div>
  );
}
