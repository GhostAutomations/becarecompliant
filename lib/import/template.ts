import "server-only";

/**
 * Be Care Compliant — bulk onboarding import: CSV template generation.
 * The columns come from the shared column plan (lib/import/columns) so the template
 * and the parser stay in lock-step. Only completed dates are collected (DD/MM/YYYY);
 * the recurrence engine calculates every next-due.
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
