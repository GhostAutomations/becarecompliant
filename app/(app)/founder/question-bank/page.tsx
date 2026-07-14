import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAllQuestionTemplates } from "@/lib/form-builder/data";
import QuestionBankManager from "@/components/form-builder/question-bank-manager";

export const metadata: Metadata = { title: "Question bank" };

export default async function FounderQuestionBankPage() {
  await requirePlatformAdmin();
  const questions = await listAllQuestionTemplates();

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Question bank</h1>
        <p className="page-subtitle">
          Reusable questions authors can drop into any form from the builder. Scope each
          to People forms, Service User forms, or any form.
        </p>
      </div>

      <QuestionBankManager questions={questions} />
    </div>
  );
}
