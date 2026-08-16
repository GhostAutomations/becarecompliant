import { ukShortDate } from "@/lib/dates";
import { requireCompany } from "@/lib/auth/guards";
import { canBookInBranch } from "@/lib/auth/manage-scope";
import { callerBranchIds } from "@/lib/auth/branches";
import { featureEnabled } from "@/lib/billing/tier";
import { listRecordBookings, getPlannerRecordForm } from "@/lib/planner/data";
import BookingForm from "./booking-form";

function fmt(iso: string): string {
  // ukShortDate, not toLocaleDateString: "Sept" versus "Sep" changed between this panel and the
  // Planner week heading, on the same booking. See lib/dates.ts.
  return ukShortDate(iso);
}

/**
 * The Planner panel on a record page: shows the tasks booked in for this record
 * and a "Book a task" button pre-scoped to it. Renders nothing when the company
 * is not on a tier with the Planner. Booked check tasks complete automatically
 * when the check is completed (DB trigger).
 */
export default async function RecordPlanner({
  companyId,
  population,
  recordId,
  recordName,
  branchId,
}: {
  companyId: string;
  population: "people" | "service_users";
  recordId: string;
  recordName: string;
  branchId: string | null;
}) {
  if (!(await featureEnabled(companyId, "planner"))) return null;

  const { user, profile } = await requireCompany();
  /*
   * CAN THIS VIEWER ACTUALLY BOOK HERE (review, 2026-08-15)?
   *
   * This card sits OUTSIDE the manage gate, on purpose: seeing what is booked in for somebody is
   * not the same as being able to change their record. But the Book a task button inside it was
   * not gated at all, and with a preset the form hides its own branch and subject pickers, so
   * there was no dropdown to narrow. A manager opening the record of a carer he is booked with,
   * in a branch he does not run (0183), could choose a check, a conductor and a date and be
   * refused by planner_bookings_insert at the last step, with no field he could have set
   * differently. The list stays; the button goes.
   */
  const canBook = canBookInBranch({
    role: profile.role,
    branchIds: await callerBranchIds(profile.id),
    recordBranchId: branchId,
  });

  const [bookings, form] = await Promise.all([
    listRecordBookings(population === "people" ? "person" : "service_user", recordId),
    getPlannerRecordForm(companyId, population, recordId, recordName, branchId),
  ]);

  return (
    <section className="glass-card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Planner</h2>
        {canBook ? (
          <BookingForm data={form.data} currentUserId={user.id} preset={form.preset} buttonLabel="Book a task" />
        ) : null}
      </div>
      {bookings.length === 0 ? (
        <p className="text-sm text-white/50">Nothing booked in.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-1.5 first:border-t-0 first:pt-0">
              <span className="text-white/85">
                <span className="font-medium text-white">{b.label}</span>
                {b.conductorName ? <span className="text-white/50"> · {b.conductorName}</span> : null}
              </span>
              <span className="text-white/70">
                Planned: {fmt(b.scheduledDate)}{b.startTime ? `, ${b.startTime}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
