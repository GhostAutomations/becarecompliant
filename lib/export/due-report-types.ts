/**
 * The four due reports and the dashboard tile each one belongs to (Phil, 2026-10-05).
 * PURE, importable anywhere: the view route, the export route, the reports page and the tiles.
 */
import type { DueBand } from "@/lib/dashboard/due-preview";

export type DueReportType = "overdue" | "due-7" | "due-14" | "due-30";

export const DUE_REPORT_TYPES: DueReportType[] = ["overdue", "due-7", "due-14", "due-30"];

export function isDueReportType(v: string): v is DueReportType {
  return (DUE_REPORT_TYPES as string[]).includes(v);
}

export const DUE_REPORTS: Record<
  DueReportType,
  {
    band: DueBand;
    title: string;
    slug: string;
    ref: string;
    covers: string;
    description: string;
    emptyPeople: string;
    emptyServiceUsers: string;
  }
> = {
  overdue: {
    band: "overdue",
    title: "Overdue",
    slug: "overdue",
    ref: "OVERDUE",
    covers: "Everything past its due date",
    description: "Every overdue check for People and Service Users, oldest first, with how late each one is.",
    emptyPeople: "No People checks are overdue.",
    emptyServiceUsers: "No Service User checks are overdue.",
  },
  "due-7": {
    band: "d7",
    title: "Due in 7 days",
    slug: "due-in-7-days",
    ref: "DUE7",
    covers: "Today to day 7",
    description: "Every check falling due from today to day 7, soonest first.",
    emptyPeople: "No People checks fall due in the next 7 days.",
    emptyServiceUsers: "No Service User checks fall due in the next 7 days.",
  },
  "due-14": {
    band: "d14",
    title: "Due in 14 days",
    slug: "due-in-14-days",
    ref: "DUE14",
    covers: "Days 8 to 14",
    description: "Every check falling due in days 8 to 14, soonest first.",
    emptyPeople: "No People checks fall due in days 8 to 14.",
    emptyServiceUsers: "No Service User checks fall due in days 8 to 14.",
  },
  "due-30": {
    band: "d30",
    title: "Due in 30 days",
    slug: "due-in-30-days",
    ref: "DUE30",
    covers: "Days 15 to 30",
    description: "Every check falling due in days 15 to 30, soonest first.",
    emptyPeople: "No People checks fall due in days 15 to 30.",
    emptyServiceUsers: "No Service User checks fall due in days 15 to 30.",
  },
};

/** Who may open these four: the report roles, and Supervisors (popup, 2026-10-05). */
export const DUE_REPORT_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];
