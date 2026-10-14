/**
 * Be Care Compliant: the homepage scenes' dates, worked out from the day the page is viewed
 * (Phil, 2026-10-14: "Dates always current"). Each scene says how many days before or after today
 * a date falls, so "today" is always today and an overdue check is always recently overdue,
 * however long after the page was written somebody reads it. The homepage is rendered per
 * request, so these are fresh on every view. London's day, as everywhere in the app.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Today in London as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A civil date some days from another, as YYYY-MM-DD (calendar arithmetic, no clock). */
export function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** As the registers show a date: "14 Oct 26" (lib/people/logic.ts formatDisplayDate). */
export function matrixDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${String(y).slice(-2)}`;
}

/** As forms and the Evidence page show it: "14/10/2026". */
export function slashDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** As an answer and the audit trail show it: "14 October 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${d} ${LONG[m - 1]} ${y}`;
}

/** A small helper for a scene: dates relative to today, in each of the app's formats. */
export function sceneDates(now: Date = new Date()) {
  const today = londonToday(now);
  const at = (days: number) => shift(today, days);
  return {
    today,
    at,
    matrix: (days: number) => matrixDate(at(days)),
    slash: (days: number) => slashDate(at(days)),
    long: (days: number) => longDate(at(days)),
  };
}
