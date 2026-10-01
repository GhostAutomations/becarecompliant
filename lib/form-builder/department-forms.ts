/**
 * Be Care Compliant — which forms belong to a department rather than a check (Phil,
 * 2026-10-01: the Forms page has two tiles, Check forms and Department forms).
 *
 * A DEPARTMENT form is one a department or tracker runs on: Holiday, Absence, Return to Work,
 * Complaints, Incidents, the DBS, Right to Work and Probation columns, policy signing and money
 * records. It is never pointed at a register column, so it shows where it is used in text.
 * Everything else is a CHECK form, completed against a Person or Service User check, and keeps
 * its column dropdown.
 *
 * IMPORTLESS ON PURPOSE: the unit test target.
 */

const BY_KEY: Record<string, string> = {
  holiday_requests: "Holiday",
  holiday_response: "Holiday",
  absence_back_office: "Absence",
  absence_management_meeting: "Absence",
  return_to_work: "Absence, Return to Work",
  complaints_concerns: "Complaints",
  complaint_response: "Complaints",
  incident_report: "Incidents",
  incident_investigation: "Incidents",
  incident_outcome: "Incidents",
  dbs_renewal: "People register, DBS",
  right_to_work: "People register, Right to Work",
  probation_review: "People register, Probation",
  policy_acknowledgement: "Briefings, policy signing",
  financial_transaction: "Team Member area, money records",
  training_request: "Training",
};

const BY_POPULATION: Record<string, string> = {
  complaints: "Complaints",
  incidents: "Incidents",
};

/** Where a department form is used, or null for a check form. The library key wins over the
 *  company's own key, so a renamed copy of a department form is still recognised. */
export function departmentFor(form: { key: string; sourceTemplateKey?: string | null; population: string }): string | null {
  return (
    (form.sourceTemplateKey ? BY_KEY[form.sourceTemplateKey] : undefined) ??
    BY_KEY[form.key] ??
    BY_POPULATION[form.population] ??
    null
  );
}
