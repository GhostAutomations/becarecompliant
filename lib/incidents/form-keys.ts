/**
 * Be Care Compliant — the three incident form keys.
 *
 * In their own plain module, NOT in report-actions.ts. That file is "use server", and a
 * "use server" module may export async functions and nothing else: Next refuses to build it
 * otherwise ("Only async functions are allowed to be exported in a 'use server' file").
 * TypeScript does not know that rule, so tsc passed and the Vercel build did not.
 */

export const INCIDENT_REPORT_FORM = "incident_report";
export const INCIDENT_INVESTIGATION_FORM = "incident_investigation";
export const INCIDENT_OUTCOME_FORM = "incident_outcome";
