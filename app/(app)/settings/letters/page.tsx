import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { listLetters } from "@/lib/letters/data";
import { saveLetterTemplate, resetLetterTemplate } from "@/lib/letters/actions";
import LetterEditor from "@/components/settings/letter-editor";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Letters" };

export default async function SettingsLettersPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const letters = await listLetters(profile.company_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Letters</h1>
        <p className="page-subtitle">
          The wording of the formal letters we send on your behalf. Every letter starts on our
          standard wording, so you only need to change the ones you want in your own words.
          Previous wording is kept, because a letter that has already gone out was sent under
          the wording that was live at the time.
        </p>
      </div>

      <div className="space-y-3">
        {letters.map((letter) => (
          <LetterEditor
            key={letter.key}
            letter={{
              key: letter.key,
              subject: letter.subject,
              body: letter.body,
              customised: letter.customised,
              updatedAt: letter.updatedAt,
              definition: letter.definition,
            }}
            save={saveLetterTemplate}
            reset={resetLetterTemplate}
          />
        ))}
      </div>
    </div>
  );
}
