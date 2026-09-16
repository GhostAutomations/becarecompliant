import "server-only";

/**
 * Be Care Compliant — bulk onboarding import: CSV template generation.
 * The columns come from the shared column plan (lib/import/columns) so the template
 * and the parser stay in lock-step. Every check contributes a (due, completed) pair per
 * remembered completion (DD/MM/YYYY), and a recurring one also a "next due date". A due
 * date left blank is calculated by the recurrence engine, which is how this behaved
 * before the due columns existed.
 */

import { buildColumnPlan } from "./columns";

export type ImportTemplate = { columns: string[]; csv: string; filename: string };

export async function buildImportTemplate(
  companyId: string,
  population: "people" | "service_users",
): Promise<ImportTemplate> {
  const { headers } = await buildColumnPlan(companyId, population);
  const csv = `${headers.map(csvCell).join(",")}\r\n`;
  const filename = `bcc-${population === "people" ? "people" : "service-users"}-import-template.csv`;
  return { columns: headers, csv, filename };
}

function csvCell(v: string): string {
  return /["\r\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
