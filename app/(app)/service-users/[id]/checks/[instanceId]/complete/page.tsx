import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import CompleteCheck from "@/components/service-users/complete-check";
import { getServiceUser, getPublishedFormVersion } from "@/lib/service-users/data";
import { listBranches } from "@/lib/people/data";
import { recordFormPresets } from "@/lib/forms/record-presets";
import { isFormSchema, removeField, type Answers, type FormSchema } from "@/lib/form-schema";
import type { CheckDefinition } from "@/lib/people/types";

export const metadata: Metadata = { title: "Complete check" };

const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];

export default async function CompleteServiceUserCheckPage({
  params,
}: {
  params: Promise<{ id: string; instanceId: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, instanceId } = await params;
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
  // The Care Plan Review slot (Review 1-4) is derived positionally from the completion
  // history, so the "which review" field is never shown; a completion just adds the
  // next review.
  if (def.key === "care_plan_review") {
    schema = removeField(schema, "review_number");
  }

  // Pre-fill the service user's own details (name + branch) into whatever form this
  // check uses, so it never re-asks who it is for. Presets only (no schema change),
  // so client and server validate the same form. Works for any form, new or old.
  const branches = await listBranches(profile.company_id ?? "");
  const suBranchName = branches.find((b) => b.id === serviceUser?.branch_id)?.name ?? null;
  const presetAnswers: Answers = recordFormPresets(schema, {
    fullName: serviceUser?.full_name ?? null,
    branchName: suBranchName,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href={`/service-users/${id}`} label={`Back to ${serviceUser?.full_name ?? "record"}`} />
        <h1 className="page-title mt-1">{def.name}</h1>
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
