import type { Metadata } from "next";
import { requirePolicyWriter } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import PolicyWriteForm from "@/components/policies/write-form";
import { companyFacts, listTopics } from "@/lib/policies/data";

export const metadata: Metadata = { title: "Write a policy" };
// The AI takes up to a minute to write a full policy.
export const maxDuration = 300;

export default async function WritePolicyPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { profile } = await requirePolicyWriter();
  const { topic } = await searchParams;
  const [topics, facts] = await Promise.all([listTopics(), companyFacts(profile.company_id as string)]);
  return (
    <div className="page-form space-y-6">
      <BackLink href="/policies" label="Back to Policies" />
      <div>
        <h1 className="page-title">Write a policy with AI</h1>
        <p className="page-subtitle">
          Choose the policy, tell us a little about how your service works, and get a draft written from current
          legislation and guidance (Care Inspectorate Wales, Social Care Wales, CQC, Acas, NICE and others), with
          every source shown. You edit it and approve it before anyone sees it.
        </p>
      </div>
      <p>
        <span className="pill pill-neutral">
          {facts.regulator === "ciw"
            ? "Written for Wales: Care Inspectorate Wales and Welsh legislation"
            : facts.regulator === "cqc"
              ? "Written for England: CQC and English legislation"
              : "Regulator not set: ask Be Care Compliant support before writing"}
        </span>
      </p>
      {topics.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">The policy library is still being set up. Please try again shortly.</div>
      ) : (
        <div className="glass-card p-5">
          <PolicyWriteForm topics={topics} initial={topic ?? null} />
        </div>
      )}
    </div>
  );
}
