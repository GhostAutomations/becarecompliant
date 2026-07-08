import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import CompleteCheck from "@/components/people/complete-check";
import { getPerson, getPublishedFormVersion } from "@/lib/people/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import type { CheckDefinition } from "@/lib/people/types";

export const metadata: Metadata = { title: "Complete check" };

const COMPLETE_ROLES = ["company_admin", "manager", "supervisor", "platform_admin"];

export default async function CompleteCheckPage({
  params,
}: {
  params: Promise<{ id: string; instanceId: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, instanceId } = await params;
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/people/${id}`} className="text-xs text-white/50 hover:text-white/80">
          {person?.full_name ?? "Record"}
        </Link>
        <h1 className="page-title mt-1">{def.name}</h1>
        <p className="page-subtitle">
          Completing this form stores it as inspection evidence and schedules the
          next due date automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CompleteCheck schema={version.schema as FormSchema} instanceId={instanceId} />
      </div>
    </div>
  );
}
