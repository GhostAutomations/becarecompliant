import type { Metadata } from "next";
import { requirePolicyWriter } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import PolicyImproveForm from "@/components/policies/improve-form";
import { listTopics } from "@/lib/policies/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Improve a policy" };
export const maxDuration = 300;

export default async function ImprovePolicyPage({ searchParams }: { searchParams: Promise<{ policy?: string }> }) {
  const { profile } = await requirePolicyWriter();
  const { policy } = await searchParams;
  const supabase = await createClient();
  const [topics, { data: mine }] = await Promise.all([
    listTopics(),
    supabase
      .from("company_policies")
      .select("id, title, topic_key")
      .eq("company_id", profile.company_id as string)
      .eq("status", "active")
      .order("title"),
  ]);
  return (
    <div className="page-form space-y-6">
      <BackLink href="/policies" label="Back to Policies" />
      <div>
        <h1 className="page-title">Improve a policy with AI</h1>
        <p className="page-subtitle">
          We check your policy against current legislation and guidance, list what is missing or out of date with the
          source for each, and suggest new wording you can accept section by section.
        </p>
      </div>
      {topics.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">The policy library is still being set up. Please try again shortly.</div>
      ) : (
        <div className="glass-card p-5">
          <PolicyImproveForm
            topics={topics}
            policies={(mine as Array<{ id: string; title: string; topic_key: string | null }> | null) ?? []}
            initial={policy ?? null}
          />
        </div>
      )}
    </div>
  );
}
