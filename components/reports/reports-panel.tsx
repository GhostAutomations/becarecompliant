/**
 * Be Care Compliant — reports chooser (Phase 8).
 * Each report opens in its own View, where the branch, dates and downloads live.
 * The cards themselves are just a title, a description and a View button, so the
 * page stays calm and there is only one place to pick a branch.
 */

type ReportCardProps = { title: string; description: string; viewHref: string };

function ReportCard({ title, description, viewHref }: ReportCardProps) {
  return (
    <div className="glass-card p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="text-sm text-white/60">{description}</p>
      <div className="mt-3">
        <a href={viewHref} className="btn-primary px-3 py-2 text-xs">
          View
        </a>
      </div>
    </div>
  );
}

export default function ReportsPanel({ isAdmin }: { entitled: boolean; isAdmin: boolean }) {
  const viewHref = (type: string) => `/reports/view/${type}`;

  return (
    <div className="space-y-6">
      <section className="glass-card p-5">
        <p className="text-xs text-white/50">
          Open any report to view it, choose a branch and date range, and download it as a PDF or
          CSV. Reports cover active records only. Leavers, archived people and cancelled or
          discharged service users are excluded, matching the registers.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <ReportCard
          title="People compliance register"
          description="Every active person with their compliance status, overdue and due soon checks, and probation history."
          viewHref={viewHref("people")}
        />
        <ReportCard
          title="Service User compliance register"
          description="Every active service user with their compliance status and the checks that need action."
          viewHref={viewHref("service_users")}
        />
        <ReportCard
          title="Compliance report"
          description="People and Service Users together: a RAG summary and the full overdue lists, for a branch or the whole company."
          viewHref={viewHref("compliance")}
        />
        <ReportCard
          title="PQS report"
          description="The Cardiff PQS headline scores (mandatory training, supervision, Social Care Wales, care plan reviews and safeguarding) with score bands, plus the on time cycle detail, for one branch."
          viewHref={viewHref("on-time")}
        />
        <ReportCard
          title="Training compliance report"
          description="Mandatory training and safeguarding compliance rates with PQS score bands, plus the list of expired or missing mandatory training to action."
          viewHref={viewHref("training")}
        />

        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-white">Audit trail</h2>
          <p className="text-sm text-white/60">
            Who changed what and when across your company. Open the log to filter, or export it for
            an inspector.
          </p>
          {isAdmin ? (
            <div className="mt-3">
              <a href="/reports/audit" className="btn-outline px-3 py-2 text-xs">
                Open audit log
              </a>
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/50">
              The company wide audit log is available to Company Admins. You can view each record's
              history on the record itself.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
