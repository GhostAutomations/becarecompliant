import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { listBranches } from "@/lib/people/data";
import BackLink from "@/components/back-link";
import ImportUploader from "@/components/settings/import-uploader";

export const metadata: Metadata = { title: "Import records" };

export default async function ImportPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const branches = await listBranches(profile.company_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Import records</h1>
        <p className="page-subtitle">
          Bulk add existing staff and service users with their compliance history, and load a
          whole training matrix, when a company comes on board. Records added one at a time on
          the registers are for new starters: this is for setting up a whole team at once.
        </p>
      </div>

      <section className="glass-card space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-white/80">Step 1. Download a template</h2>
          <p className="mt-1 text-sm text-white/60">
            The template is built from your own checks, with a column for each of the
            last completed dates. You only enter completed dates: every next due date
            is calculated for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/import/template?population=people"
            className="btn-primary px-4 py-2 text-sm"
          >
            Download People template
          </a>
          <a
            href="/api/import/template?population=service_users"
            className="btn-primary px-4 py-2 text-sm"
          >
            Download Service Users template
          </a>
          <a
            href="/api/import/template?population=training"
            className="btn-primary px-4 py-2 text-sm"
          >
            Download Training template
          </a>
        </div>
      </section>

      <section className="glass-card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white/80">The Training sheet</h2>
        <p className="text-sm text-white/60">
          A column for every course you have set up, one row per carer, which is the shape a
          training matrix usually comes in already.
        </p>
        <ul className="space-y-2 text-sm text-white/70">
          <li>
            A recurring course asks for the <span className="text-white/90">renewal date</span>,
            because that is the date a matrix is normally kept in. We work the completion back
            from it and the course renewal.
          </li>
          <li>
            A one off course takes <span className="text-white/90">Completed</span>, or the date
            it was done if you have it.
          </li>
          <li>
            Leave a course blank if it has never been done. A blank column is left alone, so an
            import cannot wipe a date somebody has already entered.
          </li>
          <li>
            A course that IS filled in replaces whatever was recorded for that carer on that
            course.
          </li>
          <li>
            The carer must already be on the register, matched on name within their branch.
            Training will never create a person.
          </li>
          <li>
            If a course is renamed after you download the template, the old column no longer
            matches. The preview names any column it does not recognise before anything is saved,
            so nothing goes missing quietly.
          </li>
        </ul>
      </section>

      <section className="glass-card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white/80">How to fill it in</h2>
        <ul className="space-y-2 text-sm text-white/70">
          <li>One row per person or service user. Columns marked * are required.</li>
          <li>Dates are day/month/year, for example 04/03/2026.</li>
          <li>
            Most checks have a single column: enter the most recent completed date.
          </li>
          <li>
            Supervision and Care Plan Review have several columns for their history.
            Put the most recent in column 1, then work backwards (2, 3 and so on).
            Leave the rest blank.
          </li>
          <li>Leave a check blank if it has never been done: it will start as due.</li>
          <li>
            The Branch column must exactly match one of your branches:{" "}
            <span className="text-white/90">
              {branches.map((b) => b.name).join(", ") || "no branches set up yet"}
            </span>
            .
          </li>
        </ul>
      </section>

      <ImportUploader />
    </div>
  );
}
