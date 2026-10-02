"use client";

/**
 * Be Care Compliant — give a library form to companies that do not have it (Phil, 2 Oct 2026:
 * "i want to be able to send a single company if required"). Nothing is ticked to start with, so
 * a form only reaches the companies the founder picks. Each one gets version 1, exactly as a new
 * company would, and later library changes reach it through the list above.
 */

import ActionForm from "@/components/action-form";
import { giveLibraryForm } from "@/lib/forms/library-push-actions";

export default function LibraryGive({
  templateId,
  templateName,
  archived,
  companies,
}: {
  templateId: string;
  templateName: string;
  archived: boolean;
  companies: Array<{ id: string; name: string }>;
}) {
  if (archived) {
    return <p className="text-sm text-white/55">{templateName} is archived. Restore it in the library before giving it to a company.</p>;
  }
  if (companies.length === 0) {
    return <p className="text-sm text-white/55">Every company already has {templateName}.</p>;
  }
  return (
    <ActionForm
      action={giveLibraryForm}
      hidden={{ template_id: templateId }}
      label="Add to the ticked companies"
      savingLabel="Adding…"
      savedLabel="Added"
      showOk
      className="space-y-4"
    >
      <div className="space-y-2">
        {companies.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5">
            <input type="checkbox" name="company_ids" value={c.id} className="shrink-0" />
            <span className="text-sm font-medium text-white/85">{c.name}</span>
          </label>
        ))}
      </div>
      <p className="form-hint">
        Each ticked company gets {templateName} as a new form, version 1, the same as a new company would.
        Nothing they already have is changed.
      </p>
    </ActionForm>
  );
}
