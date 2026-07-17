import "server-only";

/**
 * Be Care Compliant — bulk onboarding import: CSV template generation.
 *
 * The template is generated per company from its OWN active check definitions, so
 * custom checks and company-specific frequencies produce the right columns. For
 * each recurring check we emit up to HISTORY_CAP dated "completed date" columns
 * (most recent first) so a takeover company can enter roughly the last two years
 * of supervisions / reviews; the recurrence engine calculates every next-due, so
 * only completed dates are collected. Document/expiry fields on the register
 * (DBS, Right to Work, probation) come from the tracker and are added as fixed
 * columns. Dates are DD/MM/YYYY.
 */

import { createClient } from "@/lib/supabase/server";

export const HISTORY_CAP = 8;

/** Convert a recurrence frequency + interval to a rough day count. */
function intervalDays(frequency: string | null, interval: number | null): number {
  const n = interval && interval > 0 ? interval : 0;
  switch (frequency) {
    case "week":
      return n * 7;
    case "month":
      return n * 30;
    case "year":
      return n * 365;
    default:
      return n; // "day"
  }
}

/** Dated columns for one check: up to 8 for a recurring check, else a single date. */
function historyColumns(name: string, recurring: boolean, days: number): string[] {
  if (!recurring || days <= 0) return [`${name} completed date`];
  const per2yr = Math.max(1, Math.ceil(730 / days));
  const n = Math.min(per2yr, HISTORY_CAP);
  if (n === 1) return [`${name} completed date`];
  // 1 = most recent.
  return Array.from({ length: n }, (_, i) => `${name} ${i + 1}`);
}

const PEOPLE_IDENTITY = [
  "Full name*",
  "Branch*",
  "Job title",
  "Team",
  "Start date",
  "Work email",
  "Mobile",
  "SCW number",
];

// Fixed tracker/document columns shown on the People register matrix.
const PEOPLE_DOCUMENTS = [
  "DBS date",
  "Enhanced DBS date",
  "Right to Work expiry",
  "Right to Work limits",
  "Probation end due",
  "Probation end actual",
  "Probation status",
];

const SU_IDENTITY = ["Full name*", "Branch*", "SSID", "Package start date"];

export type ImportTemplate = { columns: string[]; csv: string; filename: string };

export async function buildImportTemplate(
  companyId: string,
  population: "people" | "service_users",
): Promise<ImportTemplate> {
  const supabase = await createClient();
  const { data: defs } = await supabase
    .from("check_definitions")
    .select("name, recurring, frequency, interval, sort_order")
    .eq("company_id", companyId)
    .eq("population", population)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const checkColumns: string[] = [];
  for (const d of (defs as Array<{
    name: string;
    recurring: boolean;
    frequency: string | null;
    interval: number | null;
  }> | null) ?? []) {
    checkColumns.push(...historyColumns(d.name, d.recurring, intervalDays(d.frequency, d.interval)));
  }

  const identity = population === "people" ? PEOPLE_IDENTITY : SU_IDENTITY;
  const documents = population === "people" ? PEOPLE_DOCUMENTS : [];
  const columns = [...identity, ...checkColumns, ...documents];

  const csv = `${columns.map(csvCell).join(",")}\r\n`;
  const filename = `bcc-${population === "people" ? "people" : "service-users"}-import-template.csv`;
  return { columns, csv, filename };
}

function csvCell(v: string): string {
  return /["\r\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
