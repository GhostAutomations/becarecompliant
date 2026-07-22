import { featureEnabled } from "@/lib/billing/tier";
import { listRecordBookings, getPlannerRecordForm } from "@/lib/planner/data";
import BookingForm from "./booking-form";

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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

  const [bookings, form] = await Promise.all([
    listRecordBookings(population === "people" ? "person" : "service_user", recordId),
    getPlannerRecordForm(companyId, population, recordId, recordName, branchId),
  ]);

  return (
    <section className="glass-card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Planner</h2>
        <BookingForm data={form.data} preset={form.preset} buttonLabel="Book a task" />
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
