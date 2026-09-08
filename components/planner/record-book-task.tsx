import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { getPlannerRecordForm } from "@/lib/planner/data";
import BookingForm from "./booking-form";

/**
 * Book a task, from a record, without a panel around it.
 *
 * WHY (Phil, 2026-09-08): "remove the planner tile and put the book a task button in the top
 * right corner". The Planner panel was a whole card whose usual state was one button and the
 * words "Nothing booked in" -- a section heading, a border and a line of empty text, taking a
 * full row of a record that had eight other things on it, to say nothing. The button is the
 * part people use, so the button is what stays, in the corner where the actions live.
 *
 * What is booked for this record is still on the Planner itself and on the whiteboard, which
 * is where somebody looks when the question is "what is coming up".
 *
 * Renders NOTHING when the company is not on a tier with the Planner, exactly as the panel
 * did, so the corner is empty rather than teasing a feature they do not have.
 */
export default async function RecordBookTask({
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
  const form = await getPlannerRecordForm(companyId, population, recordId, recordName, branchId, profile);

  /* Anyone who can use the Planner can book a task on this record. What they cannot do is put
     THEMSELVES down for a carer outside the branches they run, and the form enforces that on
     the Carried out by list. See migration 0191. */
  return (
    <BookingForm
      data={form.data}
      currentUserId={user.id}
      preset={form.preset}
      buttonLabel="Book a task"
    />
  );
}
