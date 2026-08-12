/**
 * Be Care Compliant — Whistleblowing display helpers. Pure and isomorphic.
 */

import { formatCivilDate, todayInLondon } from "@/lib/recurrence";

/** Today's Europe/London date as YYYY-MM-DD. */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** An ISO date as DD/MM/YYYY. "" for null/invalid. */
export function formatUkDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
