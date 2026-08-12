/**
 * Be Care Compliant — Incidents display helpers. Pure and isomorphic: safe in a
 * client component and on the server. The counting rules live in summary.ts; this
 * file is only about how a date or a time is shown.
 */

import { formatCivilDate, todayInLondon } from "@/lib/recurrence";

/** Today's Europe/London date as YYYY-MM-DD. The server runs in UTC, and between
 *  midnight and 01:00 BST that is yesterday. */
export function todayIso(): string {
  return formatCivilDate(todayInLondon());
}

/** An ISO date (or the date part of a timestamp) as DD/MM/YYYY. "" for null/invalid. */
export function formatUkDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Postgres `time` arrives as HH:MM:SS. Show HH:MM. "" for null/invalid. */
export function formatTime(value: string | null): string {
  if (!value) return "";
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : "";
}
