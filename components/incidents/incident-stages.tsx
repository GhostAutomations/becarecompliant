"use client";

/**
 * Be Care Compliant — the two stages that follow an incident report.
 *
 * One row: Investigation, then Outcome. Both are the shared FormEvidenceDialog, so they get the
 * one renderer, the one validator, the 12-hour draft and the AI assist for nothing.
 *
 * WHAT IS OFFERED IS THE POINT. The Outcome appears only when the Investigation has said
 * further action IS required (lib/incidents/stages.ts). An investigation that found nothing to
 * do finishes the case, and offering an Outcome form after it would be asking a manager to
 * write a finding for something already settled.
 */

import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import type { Answers, FormSchema } from "@/lib/form-schema";
import {
  submitIncidentEvidence,
  draftIncidentQuestions,
  draftIncidentOutcome,
  INCIDENT_INVESTIGATION_FORM,
  INCIDENT_OUTCOME_FORM,
} from "@/lib/incidents/report-actions";
import { outcomeDue, investigationDue, type IncidentCaseState } from "@/lib/incidents/stages";

export default function IncidentStages({
  incidentId,
  caseState,
  investigationSchema,
  outcomeSchema,
  presetAnswers,
}: {
  incidentId: string;
  caseState: IncidentCaseState;
  investigationSchema: FormSchema | null;
  outcomeSchema: FormSchema | null;
  presetAnswers?: Answers;
}) {
  const investigationDone = !investigationDue(caseState);
  const wantsOutcome = outcomeDue(caseState);
  const outcomeDone = !!caseState.outcomeRecordedOn;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {investigationSchema ? (
        <FormEvidenceDialog
          title="Incident Investigation"
          schema={investigationSchema}
          action={submitIncidentEvidence}
          extraFields={{ incident_id: incidentId, form_key: INCIDENT_INVESTIGATION_FORM }}
          presetAnswers={presetAnswers}
          triggerLabel={investigationDone ? "Investigation filed" : "Investigate"}
          triggerClassName={`${investigationDone ? "btn-saved" : "btn-primary"} px-3 py-2 text-sm`}
          submitLabel="Save the investigation"
          aiDraft={{
            action: draftIncidentQuestions,
            label: "Draft the lines of enquiry",
            hint: "Reads the report and writes the questions to work through. One credit.",
            extraFields: { incident_id: incidentId },
            // lines_of_enquiry is a real field; ai_questions is not. See FormEvidenceDialog.
            questions: { dataKey: "ai_questions", answerKey: "lines_of_enquiry" },
          }}
        />
      ) : null}

      {outcomeSchema && (wantsOutcome || outcomeDone) ? (
        <FormEvidenceDialog
          title="Incident Outcome"
          schema={outcomeSchema}
          action={submitIncidentEvidence}
          extraFields={{ incident_id: incidentId, form_key: INCIDENT_OUTCOME_FORM }}
          presetAnswers={presetAnswers}
          triggerLabel={outcomeDone ? "Outcome recorded" : "Record the outcome"}
          triggerClassName={`${outcomeDone ? "btn-saved" : "btn-primary"} px-3 py-2 text-sm`}
          submitLabel="Save the outcome"
          aiDraft={{
            action: draftIncidentOutcome,
            label: "Draft the outcome",
            hint: "Reads the report and the investigation and drafts the finding and recommendations. One credit.",
            extraFields: { incident_id: incidentId },
          }}
        />
      ) : null}

      {investigationDone && caseState.noFurtherAction === true ? (
        <span className="pill-neutral">No further action — no outcome needed</span>
      ) : null}
    </div>
  );
}
