import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches } from "@/lib/people/data";
import { getTrainingMatrix } from "@/lib/training/data";
import TrainingMatrix from "@/components/training/training-matrix";

export const metadata: Metadata = { title: "Training" };

const ALLOWED = ["platform_admin", "company_admin", "manager"];

export default async function TrainingPage() {
  const { profile } = await requireCompany();
  if (!ALLOWED.includes(profile.role)) redirect("/people");

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink href="/people" label="Back to People" />
        <h1 className="page-title mt-1">Training</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view training.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const [branches, matrix] = await Promise.all([
    listBranches(companyId),
    getTrainingMatrix(companyId, null),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh tables={["person_training", "training_courses"]} channel="training" />
      <BackLink href="/people" label="Back to People" />
      <div className="mt-1 min-h-0 flex-1">
        <TrainingMatrix
          courses={matrix.courses}
          people={matrix.people}
          branches={branches}
          canManage={["platform_admin", "company_admin", "manager"].includes(profile.role)}
        />
      </div>
    </div>
  );
}
