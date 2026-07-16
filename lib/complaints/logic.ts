/**
 * Be Care Compliant — Complaints response-deadline logic. Pure, no side effects,
 * safe on server and client. Reuses the shared recurrence primitives so the RAG
 * thresholds and date maths match the rest of the app (Europe/London).
 */

import {
  addDays,
  formatCivilDate,
  parseCivilDate,
  ragStatus,
  todayInLondon,
} from "@/lib/recurrence";
import { formatDisplayDate } from "@/lib/people/logic";
import type { ComplaintRag } from "./types";

export { formatDisplayDate };

/** Format an ISO date (or the date part of a timestamp) as DD/MM/YYYY, matching the
 *  rest of the Complaints section. Returns "" for null/invalid input. */
export function formatUkDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** The response-deadline RAG for a complaint. Closed complaints are resolved;
 *  a complaint with no response due date has no RAG. Otherwise red when the
 *  response is overdue, amber within the amber window, else green. */
export function responseRag(
  status: string,
  responseDue: string | null,
  amberDays: number,
): ComplaintRag {
  if (status === "closed") return "closed";
  if (!responseDue) return "none";
  return ragStatus(parseCivilDate(responseDue), todayInLondon(), amberDays);
}

/** Add a number of days to an ISO date, skipping Saturdays and Sundays when
 *  working days are used (bank holidays are not modelled, so the due dates stay
 *  editable). Returns an ISO date string. */
export function addBusinessOrCalendarDays(
  iso: string,
  days: number,
  workingDays: boolean,
): string {
  if (!workingDays) return formatCivilDate(addDays(parseCivilDate(iso), days));
  let d = parseCivilDate(iso);
  let added = 0;
  while (added < days) {
    d = addDays(d, 1);
    const dow = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return formatCivilDate(d);
}

/** Today as an ISO date string in Europe/London. */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** A complaint only needs a formal investigation + response (25 working day deadline
 *  and the investigation/response forms) when it is a Complaint AND Formal. Everything
 *  else is acknowledged and logged, but has no response deadline. */
export function isFormalComplaint(concernType: string | null, formality: string | null): boolean {
  return concernType === "Complaint" && formality === "Formal";
}
