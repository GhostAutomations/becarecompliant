import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import CompleteCheck from "@/components/service-users/complete-check";
import {
  getServiceUser,
  getPublishedFormVersion,
  getReviewComps,
  getServiceUserBranchType,
  getComplexReviewInterval,
} from "@/lib/service-users/data";
import { reviewSlots, annotateReviewOptions } from "@/lib/service-users/logic";
import { isFormSchema, removeField, type Answers, type FormSchema } from "@/lib/form-schema";
import type { CheckDefinition } from "@/lib/people/types";

export const metadata: Metadata = { title: "Complete check" };

const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];

export default async function CompleteServiceUserCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; instanceId: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, instanceId } = await params;
  const { rev } = await searchParams;
  if (!COMPLETE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);

  const supabase = await createClient();
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, service_user_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || instance.service_user_id !== id || !def) redirect(`/service-users/${id}`);
  if (!def.form_id) redirect(`/service-users/${id}`);

  const serviceUser = await getServiceUser(id);
  const version = await getPublishedFormVersion(def.form_id);
  if (!version || !isFormSchema(version.schema)) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="page-title">Complete {def.name}</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          This check has no usable form version. Please contact your administrator.
        </div>
      </div>
    );
  }

  let schema = version.schema as FormSchema;
  let presetAnswers: Answers | undefined;
  let heading = def.name;

  // Care Plan Review: the "which review" (1-4) is set by the slot Complete button on a
  // Complex branch, passed as ?rev=. Hide the field and supply the value. On a Simple
  // branch (or no rev) hide the field entirely (single annual review).
  if (def.key === "care_plan_review") {
    if (rev === "1" || rev === "2" || rev === "3" || rev === "4") {
      schema = removeField(schema, "review_number");
      presetAnswers = { review_number: rev };
      heading = `Review ${rev}`;
    } else {
      const { isComplex } = await getServiceUserBranchType(id);
      if (isComplex) {
        const [comps, interval] = await Promise.all([
          getReviewComps(id, def.form_id),
          getComplexReviewInterval(profile.company_id ?? ""),
        ]);
        const slots = reviewSlots(serviceUser?.package_start_date ?? null, comps, interval);
        schema = annotateReviewOptions(schema, slots);
      } else {
        schema = removeField(schema, "review_number");
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href={`/service-users/${id}`} label={`Back to ${serviceUser?.full_name ?? "record"}`} />
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="page-subtitle">
          Completing this form stores it as inspection evidence and schedules the next
          due date automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CompleteCheck schema={schema} instanceId={instanceId} presetAnswers={presetAnswers} />
      </div>
    </div>
  );
}
