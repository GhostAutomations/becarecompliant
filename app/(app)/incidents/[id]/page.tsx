import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import EditIncidentForm from "@/components/incidents/edit-incident-form";
import IncidentStatusControl from "@/components/incidents/incident-status-control";
import IncidentStages from "@/components/incidents/incident-stages";
import { getCompanyFormByKey } from "@/lib/people/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { INCIDENT_INVESTIGATION_FORM, INCIDENT_OUTCOME_FORM } from "@/lib/incidents/form-keys";

import { whatIsOutstanding, type IncidentCaseState } from "@/lib/incidents/stages";
import {
  getIncident,
  listServiceUsersLite,
  listPeopleLite,
} from "@/lib/incidents/data";
import { INCIDENT_STATUS_LABELS } from "@/lib/incidents/types";
import { formatUkDate, formatTime, todayIso } from "@/lib/incidents/logic";
import { INCIDENTS_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";

export const metadata: Metadata = { title: "Incident" };


export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const { id } = await params;
  // RLS decides this, not the page: an incident in a branch this user cannot see
  // comes back null and is a 404, the same as one that does not exist.
  const incident = await getIncident(id);
  if (!incident) notFound();

  const [serviceUsers, people, investigationForm, outcomeForm] = await Promise.all([
    listServiceUsersLite(profile.company_id),
    listPeopleLite(profile.company_id),
    getCompanyFormByKey(profile.company_id, INCIDENT_INVESTIGATION_FORM),
    getCompanyFormByKey(profile.company_id, INCIDENT_OUTCOME_FORM),
  ]);

  /* THE CASE'S OWN STATE, read once and handed to the one module that decides what a case is
     waiting for. The screen and the server action must not each have their own idea of it. */
  const caseState: IncidentCaseState = {
    investigationCompleted: incident.investigation_completed ?? null,
    noFurtherAction: incident.no_further_action ?? null,
    outcomeRecordedOn: incident.outcome_recorded_on ?? null,
  };
  const waitingFor = whatIsOutstanding(caseState);

  const outstanding: string[] = [];
  if (waitingFor) {
    outstanding.push(
      waitingFor === "Investigation"
        ? "Reported, and not yet investigated."
        : "Investigated, and the outcome has not been recorded.",
    );
  }
  if (incident.notifiable && !incident.notified_on) {
    outstanding.push("Flagged as notifiable to the regulator, but no notification date recorded.");
  }
  if (incident.safeguarding && !incident.safeguarding_referred_on) {
    outstanding.push("Raised as a safeguarding matter, but no referral date recorded.");
  }

  const who = [incident.service_user_name, incident.person_name].filter(Boolean).join(" and ");

  return (
    <div className="page-shell space-y-6">
      <div>
        <BackLink href="/incidents" label="Back to Incidents" />
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="page-title">{incident.category}</h1>
          <span className="text-sm text-white/50">
            {formatUkDate(incident.occurred_on)}
            {incident.occurred_at ? ` at ${formatTime(incident.occurred_at)}` : ""}
          </span>
        </div>
        <p className="page-subtitle">
          {incident.branch_name ?? "No branch"}
          {who ? ` — ${who}` : ""} — {INCIDENT_STATUS_LABELS[incident.status]}
          {incident.closed_on ? ` on ${formatUkDate(incident.closed_on)}` : ""}
        </p>
      </div>

      {outstanding.length > 0 ? (
        <div className="glass-card border border-red-400/30 p-4">
          <p className="text-sm font-medium text-red-200">Outstanding</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {outstanding.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-white/50">
            Closing the incident does not clear this. The duty is on the record until a date
            is entered.
          </p>
        </div>
      ) : null}

      {/* THE CASE, IN ORDER. Reported (the form that opened it), investigated, answered. The
          Outcome is offered only when the investigation asked for it. */}
      <section className="glass-card space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">The case</h2>
          <span className="text-xs text-white/45">
            Reported {formatUkDate(incident.reported_on ?? incident.occurred_on)}
            {incident.investigation_completed ? ` · investigated ${formatUkDate(incident.investigation_completed)}` : ""}
            {incident.outcome_recorded_on ? ` · answered ${formatUkDate(incident.outcome_recorded_on)}` : ""}
          </span>
        </div>
        <IncidentStages
          incidentId={incident.id}
          caseState={caseState}
          investigationSchema={
            investigationForm && isFormSchema(investigationForm.schema)
              ? (investigationForm.schema as FormSchema)
              : null
          }
          outcomeSchema={
            outcomeForm && isFormSchema(outcomeForm.schema) ? (outcomeForm.schema as FormSchema) : null
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="glass-card p-6">
          <EditIncidentForm
            incident={incident}
            serviceUsers={serviceUsers}
            people={people}
            todayIso={todayIso()}
          />
        </div>

        <div className="space-y-6">
          <div className="glass-card p-5">
            <IncidentStatusControl
              incidentId={incident.id}
              status={incident.status}
              closedOn={incident.closed_on}
              todayIso={todayIso()}
            />
          </div>
          <div className="glass-card p-5 text-xs text-white/50">
            <p className="mb-1 font-medium text-white/70">Why this is one record</p>
            <p>
              A safeguarding referral is this incident, escalated — not a second record. Kept
              together, the six monthly review always reconciles: incidents, of which so many
              notifiable and so many referred.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
