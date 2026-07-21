import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import OutcomesEditor from "@/components/service-users/outcomes-editor";
import OutcomesReviewPanel from "@/components/service-users/outcomes-review-panel";
import { getServiceUser, getServiceUserOutcomes, getOutcomesReviewData } from "@/lib/service-users/data";
import { outcomesReviewRag, isOutcomeInScope } from "@/lib/service-users/outcome-consts";

export const metadata: Metadata = { title: "Personal outcomes" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function ServiceUserOutcomesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);
  const outcomes = await getServiceUserOutcomes(id);
  const reviewData = await getOutcomesReviewData(id, profile.company_id!);
  const inScope = outcomes.filter((o) => isOutcomeInScope(o.status)).length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const review = outcomesReviewRag(reviewData.latest, reviewData.intervalMonths, today, inScope > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div>
        <h1 className="page-title">Personal outcomes</h1>
        <p className="page-subtitle">{su.full_name}</p>
      </div>
      <p className="text-sm text-white/55">
        What matters to this person, and how they are progressing. These feed the well-being outcomes in your PQS return.
      </p>

      <section className="glass-card space-y-5 p-5">
        <OutcomesReviewPanel
          serviceUserId={id}
          rag={review.rag}
          ragLabel={review.label}
          dueIso={review.dueIso}
          intervalMonths={reviewData.intervalMonths}
          reviews={reviewData.reviews}
          hasOutcomes={inScope > 0}
        />

        <div className="border-t border-white/10" />

        <OutcomesEditor serviceUserId={id} initial={outcomes} />
      </section>
    </div>
  );
}
