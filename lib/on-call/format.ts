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

/**
 * The rota weeks (Current / +1 / +2 / +3), each Monday->Sunday, from a YYYY-MM-DD "today".
 *
 * FOUR SINCE 2026-09-17 (Phil: "on the oncall rota, we need to add a 4th week, called +3").
 * Three weeks is under a month of visible rota, and an on-call rota is agreed further out than
 * that: somebody asking in the first week of the month to swap a weekend at the end of it was
 * asking about a week the screen did not draw.
 *
 * The count is a constant and the labels are derived from it, so a fifth week is one number.
 * The label was a hand written array beside a hand written length, which is how a grid comes to
 * draw four weeks and label three.
 *
 * Pure date maths in UTC so it round-trips the wall-clock.
 */
export const ROTA_WEEKS = 4;

export function rotaWeekGrid(todayIso: string): { label: string; days: string[] }[] {
  const [y, m, d] = todayIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0 Sun .. 6 Sat
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const labels = Array.from({ length: ROTA_WEEKS }, (_, w) => (w === 0 ? "Current" : `+${w}`));
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

/** A civil date (YYYY-MM-DD) as DD/MM/YYYY. */
export function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** A shift label, e.g. "AM: 23/07/2026". */
export function shiftLabel(dateIso: string | null, slot: "am" | "pm" | null): string {
  if (!dateIso || !slot) return "—";
  return `${slot.toUpperCase()}: ${ukDate(dateIso)}`;
}

/** Shift options for the "Shift" dropdown: AM/PM for yesterday, today, tomorrow.
 *  Value is `${slot}|${date}`. Newest shift first. */
export function shiftOptions(todayIso: string): Array<{ value: string; label: string }> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const out: Array<{ value: string; label: string }> = [];
  for (const off of [1, 0, -1]) {
    const date = new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10);
    for (const slot of ["pm", "am"] as const) {
      out.push({ value: `${slot}|${date}`, label: shiftLabel(date, slot) });
    }
  }
  return out;
}

/** Start/end UTC instants for a date + AM/PM slot (AM 00:00-12:00, PM 12:00-24:00). */
export function slotInstants(dateIso: string, slot: "am" | "pm"): { startsAt: string; endsAt: string } {
  if (slot === "am") return { startsAt: `${dateIso}T00:00:00Z`, endsAt: `${dateIso}T12:00:00Z` };
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { startsAt: `${dateIso}T12:00:00Z`, endsAt: `${next}T00:00:00Z` };
}

/**
 * Who completed a finalised handover, from the logins that saved it (DEF-074, Phil 2026-09-24:
 * "it should be logged by the the login"). The finaliser is who completed it; the handler (the
 * last login to save) stands in for a handover finalised before finalised_by was kept. When
 * someone else started it, both names are given, because two people wrote it.
 */
export function completedByLine(log: {
  finalised_by_name: string | null;
  created_by_name: string | null;
  handler_person_name: string | null;
}): string {
  const completer = log.finalised_by_name || log.handler_person_name;
  if (!completer) return "Who completed it was not recorded.";
  if (log.created_by_name && log.created_by_name !== completer) {
    return `Started by ${log.created_by_name}, completed by ${completer}`;
  }
  return `Completed by ${completer}`;
}

/** An urgent follow up still open 24 hours after its handover was saved (Phil, 2026-09-24: "if it
 *  is over 24 hours, it should be flashing red"). Exactly 24 hours counts as over. */
export const URGENT_OVERDUE_MS = 24 * 60 * 60 * 1000;

export function urgentIsOverdue(savedAtIso: string, nowMs: number): boolean {
  const t = Date.parse(savedAtIso);
  return Number.isFinite(t) && nowMs - t >= URGENT_OVERDUE_MS;
}
