import "server-only";

/**
 * Be Care Compliant — "What was reported" on the incident case (Phil, 2026-10-14, from Thistle:
 * "opening an incident doesn't show the answers that were given").
 *
 * Every question with its answer, in two columns, near the top of the case. Phil's popup: "A What
 * was reported card": the report's questions and answers, then what is on the case (the type
 * of event, the kind, notifiable, safeguarding, RIDDOR and the outcome), then the Investigation
 * and the Outcome once filed. A question nobody answered says Not recorded; nothing is
 * backfilled. The edit form below is unchanged.
 *
 * WHICH QUESTIONS. The same rule the Evidence page and the PDF use (shouldShowInEvidence): a
 * conditional question nobody was asked (another type's kinds, say) is left out, and anything
 * actually answered is always shown. A question that was asked and left blank says Not recorded.
 *
 * READS ARE AUDITED, as on the Evidence page (evidence.viewed): Service User data is special
 * category, and access is logged as well as change.
 */

import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { isFormSchema, isPresentational, type Answers, type AnswerValue, type FormSchema } from "@/lib/form-schema";
import { shouldShowInEvidence, standDown } from "@/lib/form-validate";
import { formatAnswerForDisplay } from "@/lib/form-format";
import {
  INCIDENT_INVESTIGATION_FORM,
  INCIDENT_OUTCOME_FORM,
  INCIDENT_REPORT_FORM,
} from "@/lib/incidents/form-keys";
import type { IncidentRecord } from "@/lib/incidents/types";
import { formatUkDate } from "@/lib/incidents/logic";
import {
  NOT_RECORDED,
  categoryLabel,
  eventTypeLabel,
  orNotRecorded,
  regulatorShortName,
  yesNoLabel,
  type RegulatorCode,
} from "@/lib/incidents/case-display";

type Row = { label: string; value: string; wide?: boolean };

type EvidenceRow = {
  id: string;
  answers: Answers;
  schema_snapshot: unknown;
  submitted_at: string;
  author_name: string | null;
  anonymised_at: string | null;
  forms: { key: string } | { key: string }[] | null;
};

function isBlank(value: AnswerValue | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Every question the form asked, with its answer or Not recorded. */
function formRows(schema: FormSchema, answers: Answers): Row[] {
  const stoodDown = standDown(schema, answers);
  const rows: Row[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (isPresentational(field.type)) continue;
      if (!shouldShowInEvidence(field, answers, stoodDown)) continue;
      const value = answers[field.key];
      rows.push({
        label: field.label,
        value: isBlank(value) ? NOT_RECORDED : formatAnswerForDisplay(field, value),
        wide: field.type === "long_text",
      });
    }
  }
  return rows;
}

/** What is on the case itself, whatever the forms said. */
function caseRows(incident: IncidentRecord, regulator: RegulatorCode | null): Row[] {
  const reg = regulatorShortName(regulator);
  const regName = regulator ? reg : "the regulator";
  const date = (iso: string | null | undefined) => (iso ? formatUkDate(iso) : NOT_RECORDED);
  const rows: Row[] = [
    { label: "Type of event", value: eventTypeLabel(incident.event_type) },
    { label: "Kind of event", value: categoryLabel(incident.category, incident.category_other) },
    { label: "What was done straight away", value: orNotRecorded(incident.immediate_action), wide: true },
    { label: `Notifiable to ${regName}`, value: yesNoLabel(incident.notifiable) },
  ];
  if (incident.notifiable) {
    rows.push(
      { label: `Date notified to ${regName}`, value: date(incident.notified_on) },
      { label: regulator ? `${reg} reference` : "Regulator reference", value: orNotRecorded(incident.regulator_reference) },
    );
  }
  rows.push({ label: "Safeguarding matter", value: yesNoLabel(incident.safeguarding) });
  if (incident.safeguarding) {
    rows.push(
      { label: "Date referred", value: date(incident.safeguarding_referred_on) },
      { label: "Local authority", value: orNotRecorded(incident.local_authority) },
      { label: "Local authority reference", value: orNotRecorded(incident.local_authority_reference) },
      { label: "Safeguarding outcome", value: orNotRecorded(incident.safeguarding_outcome) },
    );
  }
  rows.push({ label: "Reportable under RIDDOR", value: yesNoLabel(incident.riddor_reportable) });
  if (incident.riddor_reportable) {
    rows.push(
      { label: "Date reported to HSE", value: date(incident.riddor_reported_on) },
      { label: "HSE reference", value: orNotRecorded(incident.riddor_reference) },
    );
  }
  rows.push(
    { label: "Investigation completed", value: date(incident.investigation_completed) },
    {
      label: "Further action",
      value:
        incident.no_further_action === true
          ? "No further action"
          : incident.no_further_action === false
            ? "Further action required"
            : NOT_RECORDED,
    },
    { label: "Outcome recorded", value: date(incident.outcome_recorded_on) },
    { label: "Recommendations", value: orNotRecorded(incident.recommendations), wide: true },
    { label: "Lessons learnt", value: orNotRecorded(incident.lessons_learnt), wide: true },
  );
  return rows;
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className={r.wide ? "sm:col-span-2" : undefined}>
          <dt className="text-xs text-white/45">{r.label}</dt>
          <dd
            className={`mt-0.5 whitespace-pre-line break-words text-sm ${
              r.value === NOT_RECORDED ? "text-white/40" : "text-white/90"
            }`}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A form's answers, or, once anonymised under the retention policy, a sentence saying so rather
 *  than every question reading Not recorded. */
function FormAnswers({ e }: { e: EvidenceRow }) {
  if (e.anonymised_at) {
    return (
      <p className="text-sm text-white/50">
        The personal detail in this form was removed on {formatUkDate(e.anonymised_at)}, because it
        passed the retention period for evidence.
      </p>
    );
  }
  return <Rows rows={formRows(e.schema_snapshot as FormSchema, e.answers ?? {})} />;
}

function Part({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-white/80">{title}</h3>
        {note ? <span className="text-xs text-white/45">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default async function WhatWasReported({
  incident,
  regulator,
  actor,
}: {
  incident: IncidentRecord;
  regulator: RegulatorCode | null;
  actor: { id: string; email: string | null; role: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, answers, schema_snapshot, submitted_at, author_name, anonymised_at, forms(key)")
    .eq("record_type", "incident")
    .eq("record_id", incident.id)
    .order("submitted_at", { ascending: true });
  const evidence = ((data as EvidenceRow[] | null) ?? []).filter((e) => isFormSchema(e.schema_snapshot));
  const keyOf = (e: EvidenceRow) => (Array.isArray(e.forms) ? e.forms[0]?.key : e.forms?.key) ?? "";
  const report = evidence.find((e) => keyOf(e) === INCIDENT_REPORT_FORM) ?? null;
  // The latest of each, if either was filed more than once.
  const investigation = evidence.filter((e) => keyOf(e) === INCIDENT_INVESTIGATION_FORM).at(-1) ?? null;
  const outcome = evidence.filter((e) => keyOf(e) === INCIDENT_OUTCOME_FORM).at(-1) ?? null;

  const shown = [report, investigation, outcome].filter((e): e is EvidenceRow => !!e);
  for (const e of shown) {
    await writeAudit({
      companyId: incident.company_id,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "evidence.viewed",
      entityType: "evidence",
      entityId: e.id,
      summary: "Viewed evidence on the incident case",
      metadata: { incident_id: incident.id },
    });
  }

  const filed = (e: EvidenceRow) => (
    <>
      {e.author_name ? `${e.author_name}, ` : ""}
      {formatUkDate(e.submitted_at)}.{" "}
      <a href={`/evidence/${e.id}`} className="text-gold-300 underline">
        Open in full
      </a>
    </>
  );

  return (
    <section className="glass-card space-y-4 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">What was reported</h2>

      <Part title="The report" note={report ? filed(report) : undefined}>
        {report ? (
          <FormAnswers e={report} />
        ) : (
          <p className="text-sm text-white/50">
            No Incident Report form is stored for this case. It was recorded before the form was used.
          </p>
        )}
      </Part>

      <Part title="On the case">
        <Rows rows={caseRows(incident, regulator)} />
      </Part>

      {investigation ? (
        <Part title="Investigation" note={filed(investigation)}>
          <FormAnswers e={investigation} />
        </Part>
      ) : null}

      {outcome ? (
        <Part title="Outcome" note={filed(outcome)}>
          <FormAnswers e={outcome} />
        </Part>
      ) : null}
    </section>
  );
}
