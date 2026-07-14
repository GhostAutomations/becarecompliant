"use client";

/**
 * Be Care Compliant — complete a complaint form as immutable Evidence. Reuses the
 * shared FormEvidenceDialog (one renderer, one validator, one evidence pipeline)
 * with record_type = 'complaint'. The action re-fetches the form by key server
 * side, so the client only supplies the schema for rendering.
 */

import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import { submitComplaintEvidence } from "@/lib/complaints/actions";
import type { FormSchema } from "@/lib/form-schema";

export default function ComplaintForms({
  complaintId,
  forms,
}: {
  complaintId: string;
  forms: Array<{ key: string; name: string; schema: FormSchema }>;
}) {
  if (forms.length === 0) {
    return (
      <p className="text-sm text-white/60">
        No complaint forms are available yet. An Admin can import the latest templates from
        Settings, Templates.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {forms.map((f) => (
        <FormEvidenceDialog
          key={f.key}
          title={f.name}
          schema={f.schema}
          action={submitComplaintEvidence}
          extraFields={{ complaint_id: complaintId, form_key: f.key }}
          triggerLabel={f.name}
          triggerClassName="btn-outline px-3 py-2 text-sm"
          submitLabel="Save as evidence"
        />
      ))}
    </div>
  );
}
