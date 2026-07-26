"use client";

/**
 * Be Care Compliant — what a Team Member has been asked to do.
 *
 * A policy: open the document (short-lived signed URL, and the open is audited),
 * then tick to confirm. The tick writes real Evidence through the seeded Policy
 * Acknowledgement form, so an inspector can see who read which version and when.
 *
 * A form: complete it in the same slide-over the rest of the app uses, so the
 * public and the internal experience never drift apart.
 */

import ActionForm from "@/components/action-form";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import type { FormSchema } from "@/lib/form-schema";
import type { AssignmentRow } from "@/lib/assignments/types";
import { acknowledgePolicy, completeAssignedForm } from "@/lib/assignments/actions";

function fmtDue(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default function AssignedToMe({
  assignments,
  schemas,
}: {
  assignments: AssignmentRow[];
  /** Published schema per form id, for the ones that are forms. */
  schemas: Record<string, FormSchema>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const open = assignments.filter((a) => a.status === "assigned");

  if (open.length === 0) {
    return (
      <div className="glass-card p-5 text-sm text-white/60">
        Nothing is assigned to you at the moment. When your manager assigns a form or a
        policy, it will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {open.map((a) => {
        const overdue = a.due_date != null && a.due_date < today;
        const schema = a.form_id ? schemas[a.form_id] : undefined;
        return (
          <li key={a.id} className="glass-card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">{a.title}</p>
                <p className="text-xs text-white/50">
                  {a.kind === "policy" ? "Read and confirm" : "Form to complete"}
                </p>
              </div>
              {a.due_date ? (
                <span className={overdue ? "pill pill-red" : "pill pill-amber"}>
                  {overdue ? "Overdue" : `By ${fmtDue(a.due_date)}`}
                </span>
              ) : null}
            </div>

            {a.kind === "policy" && a.policy_id ? (
              <div className="space-y-3">
                <a
                  href={`/api/policies/${a.policy_id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline inline-block px-3 py-2 text-xs"
                >
                  Open the policy
                </a>
                <ActionForm
                  action={acknowledgePolicy}
                  hidden={{ assignment_id: a.id }}
                  label="Confirm"
                  savedLabel="Confirmed"
                  buttonClassName="btn-primary px-3 py-1.5 text-xs"
                >
                  <label className="flex items-center gap-2 text-sm text-white/85">
                    <input type="checkbox" name="confirmed" />
                    I have read and understood this policy
                  </label>
                </ActionForm>
              </div>
            ) : schema ? (
              <FormEvidenceDialog
                title={a.title}
                schema={schema}
                action={completeAssignedForm}
                extraFields={{ assignment_id: a.id }}
                triggerLabel="Complete this form"
                triggerClassName="btn-primary px-3 py-2 text-sm"
                submitLabel="Send"
              />
            ) : (
              <p className="text-xs text-amber-300">
                This form is not published at the moment, so it cannot be completed. Please
                tell your manager.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
