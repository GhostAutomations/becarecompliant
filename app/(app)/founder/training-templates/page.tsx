import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import TrainingTemplateManager, {
  type TrainingTemplate,
} from "@/components/founder/training-template-manager";

export const metadata: Metadata = { title: "Training templates" };

export default async function FounderTrainingTemplatesPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_course_templates")
    .select(
      "id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order, active",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const templates = (data ?? []) as TrainingTemplate[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Training course templates</h1>
        <p className="page-subtitle">
          The master training catalogue seeded into every new company. Only active
          courses seed. Editing here does not change companies already set up.
        </p>
      </div>

      <TrainingTemplateManager templates={templates} />
    </div>
  );
}
