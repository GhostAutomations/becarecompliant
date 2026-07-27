"use client";

/**
 * Be Care Compliant — what a Team Member has been asked to do.
 *
 * A policy: ONE button opens the document and the signature together, side by
 * side (Phil, 2026-07-26: "clicking 2 seperate buttons to read and sign a
 * document is clunky"). Phil, same day: "think docusign / adobe", so this is a
 * signature, not a tick. Whether they draw it or type their name is the company's
 * setting, applied by filtering the acknowledgement form's render, and the
 * signature is stored as real Evidence with the policy version it was given for.
 * Afterwards they can download the SIGNED COPY: the document itself with a
 * signature page on the end (Phil, 2026-07-27), not a certificate about it.
 *
 * A form: complete it in the same slide-over the rest of the app uses, so the
 * staff and the internal experience never drift apart.
 */

import Link from "next/link";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import ReadAndSign from "@/components/staff/read-and-sign";
import MySection from "@/components/staff/my-section";
import type { FormSchema } from "@/lib/form-schema";
import type { AssignmentRow, PolicyConfig } from "@/lib/assignments/types";
import { completeAssignedForm } from "@/lib/assignments/actions";
import { signingSchema, type SignatureMode } from "@/lib/assignments/signing";

function fmtSigned(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

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
  ackSchema,
  policyConfig,
}: {
  assignments: AssignmentRow[];
  /** Published schema per form id, for the ones that are forms. */
  schemas: Record<string, FormSchema>;
  /** The Policy Acknowledgement form, for signing. */
  ackSchema: FormSchema | null;
  policyConfig: PolicyConfig;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const open = assignments.filter((a) => a.status === "assigned");
  const signed = assignments.filter((a) => a.status === "completed" && a.kind === "policy");

  // Per policy now (0137): two briefings on the same screen can legitimately want
  // different signing methods, so the schema is filtered per row rather than once.
  const modeFor = (a: AssignmentRow): SignatureMode =>
    (a.policy_signature_mode as SignatureMode | null) ??
    (policyConfig.signature_mode as SignatureMode);

  return (
    <div className="space-y-6">
      {open.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          Nothing to do at the moment. When your manager sends you a policy to sign or a
          form to complete, it will appear here.
        </div>
      ) : (
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
                      {a.kind === "policy"
                        ? `Read and sign${a.policy_version ? `, version ${a.policy_version}` : ""}`
                        : "Form to complete"}
                    </p>
                  </div>
                  {a.due_date ? (
                    <span className={overdue ? "pill pill-red" : "pill pill-amber"}>
                      {overdue ? "Overdue" : `By ${fmtDue(a.due_date)}`}
                    </span>
                  ) : null}
                </div>

                {a.kind === "policy" && a.policy_id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {ackSchema ? (
                      // ONE button, one panel: the document and the signature together
                      // (Phil, 2026-07-26: two buttons was clunky).
                      <ReadAndSign
                        assignmentId={a.id}
                        policyId={a.policy_id}
                        title={a.title}
                        version={a.policy_version}
                        writtenBody={a.policy_source === "text" ? a.policy_body : null}
                        schema={signingSchema(ackSchema, modeFor(a))}
                        mode={modeFor(a)}
                      />
                    ) : (
                      <p className="text-xs text-amber-300">
                        Signing is not set up for your company yet. Please tell your manager.
                      </p>
                    )}
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
                    This form is not published at the moment, so it cannot be completed.
                    Please tell your manager.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Signed history: same rows as "Forms I have sent in", and folded away, so
          what is still to do owns the screen (Phil, 2026-07-27). */}
      <MySection title="Policies I have signed" count={signed.length}>
        {signed.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">
            You have not signed any policies yet.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {signed.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                  <p className="text-xs text-white/45">
                    {a.policy_version ? `Version ${a.policy_version}` : "Signed"}
                    {a.completed_at ? ` · Signed ${fmtSigned(a.completed_at)}` : ""}
                  </p>
                </div>
                <Link
                  href={`/api/assignments/${a.id}/certificate`}
                  target="_blank"
                  className="btn-outline px-3 py-2 text-xs"
                >
                  Signed copy
                </Link>
              </div>
            ))}
          </div>
        )}
      </MySection>
    </div>
  );
}
