import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { trainingStatus, daysUntilRenewal } from "@/lib/training/renewal";
import { REPORTING_HORIZON_DAYS, type ReportingCheck } from "@/lib/notifications/data";

/**
 * Training expiry for the daily People report.
 *
 * WHY THIS EXISTS (Phil, 2026-08-01). Training was an expiry driven feature with NO reminders of
 * any kind: the word did not appear anywhere in lib/notifications. A carer's fire training could
 * lapse and the first anyone knew was somebody happening to open the matrix.
 *
 * IT RIDES IN THE PEOPLE REPORT, not a third email. Phil consolidated to exactly two emails a
 * morning on 2026-07-22 and that decision stands. Emitting ReportingCheck rows means training
 * flows through the scoping, the overdue/due soon split, the dedupe key and the template that
 * already exist, and a Manager sees only her own branches without a line of new code.
 *
 * "NEVER RECORDED" IS DELIBERATELY NOT CHASED. A new company has every course missing for every
 * carer: thirty three courses across forty staff is 1,320 rows, which as an email on day one is
 * not a reminder, it is a reason to turn reminders off. A gap in the setup belongs on the matrix
 * and in the report. What is chased here is training that WAS recorded and has lapsed or is
 * about to, which is the thing that changes without anyone doing anything.
 *
 * THE LEAD TIME IS THE SHORTER of the course's own amber_days and the report's own horizon.
 *
 * Caught by review. The matrix turns a cell amber on amber_days, which defaults to 30, but the
 * email this rides in is headed "Records due in the next 14 days" and its subject counts to the
 * same figure. Sending a certificate that expires in 29 days under that heading would have put a
 * line in front of a manager every morning for a fortnight under a promise the email does not
 * keep. The matrix keeps the longer window; the email keeps its word.
 *
 * Service role, like the rest of lib/notifications: the cron has no user, so this module is the
 * authorisation boundary and it filters leavers and archived people itself.
 */

const PAGE = 1000;

type Row = {
  person_id: string;
  branch_id: string | null;
  completed_on: string | null;
  expiry_on: string | null;
  status: string;
  people: { full_name: string; employment_status: string | null; archived_at: string | null } | null;
  training_courses: { name: string; amber_days: number; renewal_months: number | null; active: boolean } | null;
};

export async function getTrainingAttention(companyId: string): Promise<ReportingCheck[]> {
  const supabase = createServiceClient();
  const today = formatCivilDate(todayInLondon());

  const branchNames = new Map<string, string>();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId);
  for (const b of branches ?? []) branchNames.set(b.id as string, b.name as string);

  /*
   * PAGED, because training records are people TIMES courses and PostgREST caps a response at
   * 1000 rows. The same cap silently understated the PQS training measure before it was found;
   * here it would silently drop carers off the reminder, which is worse.
   *
   * Only rows that HAVE an expiry date are read: a one off course cannot lapse, and a record
   * with no renewal date has nothing to count down to.
   */
  const out: ReportingCheck[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("person_training")
      .select(
        "person_id, branch_id, completed_on, expiry_on, status, people(full_name, employment_status, archived_at), training_courses(name, amber_days, renewal_months, active)",
      )
      .eq("company_id", companyId)
      .eq("status", "completed")
      .not("expiry_on", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      /*
       * THROW, do not return what was gathered so far.
       *
       * Caught by review: returning a partial list sent an email that looked complete while
       * quietly leaving out everyone past the failed page. A reminder nobody got is
       * indistinguishable from nothing to remind about. The caller records the failure and still
       * sends the compliance half of the report.
       */
      throw new Error(`training records could not be read: ${error.message}`);
    }
    const rows = (data as unknown as Row[] | null) ?? [];
    for (const r of rows) {
      const person = r.people;
      const course = r.training_courses;
      if (!person || !course || !course.active) continue;
      // Leavers and archived people are nobody's problem any more.
      if (person.employment_status === "leaver" || person.archived_at) continue;
      if (!r.expiry_on) continue;

      const state = trainingStatus({
        // The query already filters to status 'completed' and a non null expiry.
        recorded: true,
        expiryOn: r.expiry_on,
        amberDays: course.amber_days,
        oneOff: course.renewal_months == null,
        todayIso: today,
      });
      if (state !== "expired" && state !== "due_soon") continue;
      // The email's own horizon wins for anything not yet due. Expired always goes.
      const days = daysUntilRenewal(r.expiry_on, today);
      if (state === "due_soon" && days !== null && days > REPORTING_HORIZON_DAYS) continue;

      out.push({
        population: "people",
        recordId: r.person_id,
        recordName: person.full_name,
        branchId: r.branch_id,
        branchName: r.branch_id ? branchNames.get(r.branch_id) ?? "Unassigned" : "Unassigned",
        // Named so a manager reading the report can tell a course from a compliance check.
        checkName: `Training: ${course.name}`,
        dueDate: r.expiry_on,
      });
    }
    if (rows.length < PAGE) break;
  }

  return out;
}
