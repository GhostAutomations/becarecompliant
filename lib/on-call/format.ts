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

/** The three rota weeks (Current / +1 / +2), each Monday->Sunday, from a
 *  YYYY-MM-DD "today". Pure date maths in UTC so it round-trips the wall-clock. */
export function threeWeekGrid(todayIso: string): { label: string; days: string[] }[] {
  const [y, m, d] = todayIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0 Sun .. 6 Sat
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const labels = ["Current", "+1", "+2"];
  return labels.map((label, w) => ({
    label,
    days: Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday);
      dd.setUTCDate(monday.getUTCDate() + w * 7 + i);
      return dd.toISOString().slice(0, 10);
    }),
  }));
}

/** A short day heading for a rota cell, e.g. "Mon 28". */
export function dayHeading(iso: string): { dow: string; dom: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    dom: String(d.getUTCDate()),
  };
}

/** Start/end UTC instants for a date + AM/PM slot (AM 00:00-12:00, PM 12:00-24:00). */
export function slotInstants(dateIso: string, slot: "am" | "pm"): { startsAt: string; endsAt: string } {
  if (slot === "am") return { startsAt: `${dateIso}T00:00:00Z`, endsAt: `${dateIso}T12:00:00Z` };
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { startsAt: `${dateIso}T12:00:00Z`, endsAt: `${next}T00:00:00Z` };
}
