/**
 * Be Care Compliant — who may work Complaints and Incidents. Pure, importless, ONE copy.
 *
 * WHY IT EXISTS (Phil, 2026-09-17: "supervisors need access to complaints and incidents").
 * Adding the Supervisor meant editing the same list in eleven places: five Complaints pages, four
 * Incidents pages and the two server action modules, with the nav entries making thirteen. Every
 * one of them had to be found, and the RLS policy underneath had to agree with all of them.
 *
 * That is the fault this file removes, and it is not hypothetical. It is the third time today
 * the same shape has bitten: Training was gated by three lists and a Supervisor was let past two
 * of them onto a blank page. A list kept in one place cannot disagree with itself.
 *
 * These are ROLE lists, answering "should this page exist for this person at all". WHICH records
 * they then see is RLS, scoped to their branches, and what they may change on one is RLS again.
 * Neither question is answered here.
 */

/**
 * Complaints. On Call is in because an out of hours caller takes complaints: that is most of what
 * an out of hours call is.
 */
export const COMPLAINTS_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "on_call",
];

/**
 * Incidents. NO On Call, deliberately and long standing: an out of hours caller records the call
 * in the Handover, and an incident is written up by the branch, with the notifiable and
 * safeguarding decisions on it.
 */
export const INCIDENTS_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

/**
 * The two REGISTERS: People and Service Users, and everything that hangs off a record.
 *
 * Phil, 2026-09-21: "supervisor and above need to be able to add people, service users and update
 * training." A Supervisor runs the branches she is assigned to, so she belongs on the same list as
 * a Manager, and RLS (0309, is_branch_lead) says exactly the same thing. This list had been copied
 * into NINE page files, which is the fault module-roles.ts exists to stop.
 *
 * Which records she then sees, and which she may change, is RLS and is her branches only.
 */
export const REGISTER_ROLES: readonly string[] = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];
