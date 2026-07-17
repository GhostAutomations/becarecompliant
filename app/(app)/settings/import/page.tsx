import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { listBranches } from "@/lib/people/data";
import BackLink from "@/components/back-link";

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
          Bulk add existing staff and service users, with their compliance history,
          when a company comes on board. Records added one at a time on the registers
          are for new starters: this is for setting up a whole team at once.
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
            className="btn-outline px-4 py-2 text-sm"
          >
            Download Service Users template
          </a>
        </div>
      </section>

      <section className="glass-card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white/80">How to fill it in</h2>
        <ul className="space-y-2 text-sm text-white/70">
          <li>One row per person or service user. Columns marked * are required.</li>
          <li>Dates are day/month/year, for example 04/03/2026.</li>
          <li>
            For a recurring check with several dated columns, put the most recent
            completed date in column 1, the one before it in column 2, and so on. Leave
            the rest blank.
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

      <section className="glass-card space-y-2 p-6">
        <h2 className="text-sm font-semibold text-white/80">Step 2. Upload your sheet</h2>
        <p className="text-sm text-white/60">
          Uploading, checking and committing the filled sheet is the next part of this
          feature. Prepare your templates now and you will be able to upload them here
          shortly, with a preview to check everything before anything is saved.
        </p>
      </section>
    </div>
  );
}
