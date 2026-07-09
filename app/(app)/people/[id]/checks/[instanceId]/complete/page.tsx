import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import CompleteCheck from "@/components/people/complete-check";
import {
  getPerson,
  getPublishedFormVersion,
  getPersonChecks,
  getPersonTracker,
  getSupervisionComps,
} from "@/lib/people/data";
import { supervisionSlots, annotateSupervisionOptions } from "@/lib/people/logic";
import { isFormSchema, removeField, type Answers, type FormSchema } from "@/lib/form-schema";
import type { CheckDefinition } from "@/lib/people/types";

export const metadata: Metadata = { title: "Complete check" };

const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];

export default async function CompleteCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; instanceId: string }>;
  searchParams: Promise<{ sup?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, instanceId } = await params;
  const { sup } = await searchParams;
  if (!COMPLETE_ROLES.includes(profile.role)) redirect(`/people/${id}`);

  const supabase = await createClient();
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, person_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || instance.person_id !== id || !def) redirect(`/people/${id}`);
  if (!def.form_id) redirect(`/people/${id}`);

  const person = await getPerson(id);
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

  // Supervision: which supervision (1/2/3) is set by the Complete button clicked on
  // the record, passed as ?sup=. We hide the "Which supervision" field and supply the
  // value automatically. (Fallback for a missing sup: keep the annotated dropdown.)
  let schema = version.schema as FormSchema;
  let presetAnswers: Answers | undefined;
  let heading = def.name;
  if (def.key === "supervision") {
    if (sup === "1" || sup === "2" || sup === "3") {
      schema = removeField(schema, "supervision_type");
      presetAnswers = { supervision_type: sup };
      heading = `Supervision ${sup}`;
    } else {
      const [supComps, tracker, statuses] = await Promise.all([
        getSupervisionComps(id, def.form_id),
        getPersonTracker(id),
        getPersonChecks(id),
      ]);
      const appraisalCompletedOn = statuses.find((s) => s.check_key === "appraisal")?.last_completed_on ?? null;
      const slots = supervisionSlots(
        def.interval,
        supComps,
        def.amber_days ?? 30,
        appraisalCompletedOn,
        tracker?.probation_end_actual ?? null,
      );
      schema = annotateSupervisionOptions(schema, slots);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href={`/people/${id}`} label={`Back to ${person?.full_name ?? "record"}`} />
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="page-subtitle">
          Completing this form stores it as inspection evidence and schedules the
          next due date automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CompleteCheck schema={schema} instanceId={instanceId} presetAnswers={presetAnswers} />
      </div>
    </div>
  );
}
