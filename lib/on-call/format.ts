/**
 * On Call datetime formatting. Shifts and calls are stored as stable UTC instants
 * that represent wall-clock time, so every display uses timeZone "UTC" to round
 * trip exactly what was entered (no DST drift on the rota). Pure, no server deps.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
};
const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
};

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", DATE_OPTS)}, ${d.toLocaleTimeString("en-GB", TIME_OPTS)}`;
}

/** A shift range, collapsing the date when start and end fall on the same day. */
export function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  const sDate = s.toLocaleDateString("en-GB", DATE_OPTS);
  const sTime = s.toLocaleTimeString("en-GB", TIME_OPTS);
  const eTime = e.toLocaleTimeString("en-GB", TIME_OPTS);
  if (sameDay) return `${sDate}, ${sTime} to ${eTime}`;
  const eDate = e.toLocaleDateString("en-GB", DATE_OPTS);
  return `${sDate}, ${sTime} to ${eDate}, ${eTime}`;
}

/** Stored UTC instant -> a value for <input type="datetime-local"> (YYYY-MM-DDTHH:MM). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}
