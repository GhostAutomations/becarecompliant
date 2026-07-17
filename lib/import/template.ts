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

// Only these checks collect a multi-date back-history (roughly 2 years, most recent
// first). Every other recurring check just needs its single most recent completed
// date (the recurrence engine calculates the next due from it). Phil, 2026-07-17.
const HISTORY_KEYS = new Set(["supervision", "care_plan_review"]);

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

/**
 * Dated columns for one check. Supervision and Care Plan Review collect up to 8
 * historical dates (1 = most recent, then work backwards); every other check gets
 * a single most-recent completed date.
 */
function historyColumns(key: string, name: string, recurring: boolean, days: number): string[] {
  if (recurring && days > 0 && HISTORY_KEYS.has(key)) {
    const per2yr = Math.max(1, Math.ceil(730 / days));
    const n = Math.min(per2yr, HISTORY_CAP);
    if (n > 1) return Array.from({ length: n }, (_, i) => `${name} ${i + 1}`);
  }
  return [`${name} completed date`];
}

const PEOPLE_IDENTITY = [
  "Full name*",
  "Branch*",
  "Job title",
  "Team",
  "Start date",
  "Email",
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
    .select("key, name, recurring, frequency, interval, sort_order")
    .eq("company_id", companyId)
    .eq("population", population)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const checkColumns: string[] = [];
  for (const d of (defs as Array<{
    key: string;
    name: string;
    recurring: boolean;
    frequency: string | null;
    interval: number | null;
  }> | null) ?? []) {
    checkColumns.push(
      ...historyColumns(d.key, d.name, d.recurring, intervalDays(d.frequency, d.interval)),
    );
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
