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
 * "Notifiable to the regulator" is deliberately NOT a category. It is a flag on the record. The
 * same category can be notifiable in one case and not in another, and a provider forced to
 * choose between "Fall" and "Notifiable" will pick one and lose the other.
 *
 * PROVISIONAL FOR THE THISTLE SOFT LAUNCH (Phil, 2026-08-17). The list was written by Claude and
 * then rebuilt against the instruments themselves; Phil has left it whole for now rather than
 * cutting it, so that a real provider using it is what decides what comes out. Expect to shorten
 * it once Thistle has filed a month of records.
 */
export const INCIDENT_CATEGORIES = [
  /*
   * NAMED BY A REGULATOR. Every one of these is an event a provider is required to notify, and
   * the wording follows the instrument rather than our own: CIW Schedule 3 Part 1 of the
   * Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017,
   * and CQC Regulation 18 of the Care Quality Commission (Registration) Regulations 2009. The
   * number in brackets is the paragraph, so the next person can check it rather than trust it.
   */
  "Abuse or allegation of abuse",                       // CIW Sch 3 (13), CQC 18(2)(c)
  "Allegation of misconduct by a member of staff",      // CIW Sch 3 (15)
  "Serious accident or injury",                         // CIW Sch 3 (17), CQC 18(2)(a),(b)
  "Pressure damage, category 3, 4 or unstageable",      // CIW Sch 3 (16)
  "Infection or outbreak",                              // CIW Sch 3 (18)
  "Reported to the police",                             // CIW Sch 3 (19), CQC 18(2)(d)
  "Death of a service user",                            // CIW Sch 3 (21), CQC notifies separately
  "Deprivation of Liberty request or authorisation",    // CIW Sch 3 (22), CQC 18(2)(g)
  // CQC names what this covers: staffing, utilities lost for more than 24 hours, damage to the
  // premises, and a fire alarm or safety device out for more than 24 hours.
  "Something that stops us running the service safely", // CIW Sch 3 (20), CQC 18(2)(e)

  /*
   * NOT NAMED BY A REGULATOR, and recorded by every provider anyway. These are what somebody
   * actually types at half past six, and several of them become one of the above once the
   * outcome is known: a fall becomes a serious injury, a missed call becomes staffing.
   */
  "Fall",
  "Medication error",
  "Choking or swallowing difficulty",
  "Behaviour that challenges",
  "Missing person or unexplained absence",  // CIW names this for children only, Sch 3 Pt 2 (31)
  "Missed or late call",
  "Medical emergency or hospital admission",
  "Injury to a member of staff",            // RIDDOR, not CQC or CIW
  "Fire, flood or utility failure",
  "Vehicle or road traffic incident",
  "Property damage, loss or theft",
  "Data or confidentiality breach",         // the ICO, not CQC or CIW
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
