/**
 * Be Care Compliant — Incidents & Safeguarding shared types (THE LIST item 21).
 * Isomorphic: no side effects, no server imports, safe in a client component.
 *
 * ONE RECORD, NOT TWO. A safeguarding referral is an incident that was escalated,
 * so it lives on the same row via the safeguarding_* fields. That is what makes
 * "14 incidents, of which 3 were notifiable and 2 were referred to safeguarding"
 * reconcile every time — two tables would be entered twice and drift apart, which
 * is exactly how a Reg 80 aggregate stops adding up.
 */

export type IncidentStatus = "open" | "under_review" | "closed";

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  under_review: "Under review",
  closed: "Closed",
};

export const INCIDENT_STATUSES: IncidentStatus[] = ["open", "under_review", "closed"];

/**
 * The categories offered when logging an incident.
 *
 * Stored as free text in the database on purpose, so a company can be given its own
 * list later without a migration and without orphaning historic records. This list is
 * the starting point: it covers the events an English or Welsh provider is most often
 * required to record, and it maps onto what CQC (Regulation 18 notifications) and CIW
 * (Regulation 60 notifications) ask about, so the Reg 80 aggregate can be grouped by it.
 *
 * "Notifiable to the regulator" is deliberately NOT a category — it is a flag on the
 * record. The same category can be notifiable in one case and not in another, and a
 * provider who has to choose between "Fall" and "Notifiable" will pick one and lose
 * the other.
 */
export const INCIDENT_CATEGORIES = [
  "Fall",
  "Medication error",
  "Injury to a service user",
  "Injury to a member of staff",
  "Pressure ulcer",
  "Choking or swallowing difficulty",
  "Behaviour that challenges",
  "Allegation of abuse or neglect",
  "Missed or late call",
  "Missing person or unexplained absence",
  "Death of a service user",
  "Infection or outbreak",
  "Medical emergency or hospital admission",
  "Property damage, loss or theft",
  "Data or confidentiality breach",
  "Fire, flood or utility failure",
  "Vehicle or road traffic incident",
  "Near miss",
  "Other",
] as const;

export type IncidentRecord = {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_name?: string | null;

  occurred_on: string;
  /** HH:MM:SS from Postgres `time`, or null when the time was not recorded. */
  occurred_at: string | null;
  category: string;

  service_user_id: string | null;
  service_user_name?: string | null;
  person_id: string | null;
  person_name?: string | null;

  description: string;
  immediate_action: string | null;

  notifiable: boolean;
  notified_on: string | null;
  regulator_reference: string | null;

  safeguarding: boolean;
  safeguarding_referred_on: string | null;
  local_authority: string | null;
  local_authority_reference: string | null;
  safeguarding_outcome: string | null;

  status: IncidentStatus;
  closed_on: string | null;
  lessons_learnt: string | null;

  created_at: string;
};
