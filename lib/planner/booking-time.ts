/**
 * Be Care Compliant — Planner booking times.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the rule can be unit tested and so the picker and the
 * server action share ONE definition of what a bookable time is.
 *
 * Why this file exists. On 2026-08-12 Phil's own dashboard showed "THU 13 Aug 01:54 Care
 * Plan Review". Nobody books a care plan review for two in the morning. The Planner's time
 * picker has only ever offered a sensible grid, but it is a CLIENT-side dropdown, and
 * createBooking / updateBooking took `start_time` straight off the form and wrote it:
 *
 *     const startTime = String(formData.get("start_time") ?? "").trim();
 *     ...
 *     start_time: startTime || null,
 *
 * Nine rows from 22 July hold times typed before that picker existed. A dropdown is not a
 * validator, in exactly the way a hidden nav item is not a permission.
 *
 * The window is 06:00 to 22:00 (Phil, 2026-08-12), widened from the picker's old 08:00 to
 * 20:00 so that an early medication call or a spot check on a night carer can be planned.
 * A quarter hour grid, because people book on the quarter and 01:54 is the shape of a
 * mistake.
 */

export const BOOKING_FIRST_HOUR = 6;
export const BOOKING_LAST_HOUR = 22;
export const BOOKING_MINUTES = [0, 15, 30, 45] as const;

const FIRST_MINUTE_OF_DAY = BOOKING_FIRST_HOUR * 60;
const LAST_MINUTE_OF_DAY = BOOKING_LAST_HOUR * 60;

/** The hours the picker offers, "06" through "22". */
export function bookingHours(): string[] {
  const out: string[] = [];
  for (let h = BOOKING_FIRST_HOUR; h <= BOOKING_LAST_HOUR; h += 1) {
    out.push(String(h).padStart(2, "0"));
  }
  return out;
}

/** The minutes selectable for a given hour. 22:00 is the last bookable moment, so the
 *  final hour offers only "00" rather than letting somebody pick 22:45. */
export function bookingMinutes(hour: string): string[] {
  const all = BOOKING_MINUTES.map((m) => String(m).padStart(2, "0"));
  return Number(hour) === BOOKING_LAST_HOUR ? ["00"] : all;
}

export type StartTimeResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Validate and normalise a submitted start time.
 *
 * An EMPTY value is valid and means "no time set". That is not a loophole: a great many
 * bookings are deliberately untimed, the Planner renders them on their day without a time,
 * and forcing a time would make people invent one.
 *
 * Accepts "H:MM", "HH:MM" and "HH:MM:SS" (Postgres hands back the last of those), and
 * always returns "HH:MM".
 */
export function normaliseStartTime(raw: unknown): StartTimeResult {
  /* ONLY absent or blank means "no time set". Anything else that is not a string is
     REFUSED rather than quietly treated as blank: formData.get() can hand back a File, and
     a File turning into "no time" is the same class of silent coercion this whole file
     exists to stop. Caught by its own test, which expected 930 to be refused and got a
     cheerful null. */
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Enter a time as HH:MM." };
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return { ok: false, error: "Enter a time as HH:MM." };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59) return { ok: false, error: "That is not a real time." };
  if (second !== 0) return { ok: false, error: "Book on the minute, without seconds." };

  if (!(BOOKING_MINUTES as readonly number[]).includes(minute)) {
    return { ok: false, error: "Book on the quarter hour: 00, 15, 30 or 45 minutes past." };
  }

  const total = hour * 60 + minute;
  if (total < FIRST_MINUTE_OF_DAY || total > LAST_MINUTE_OF_DAY) {
    return {
      ok: false,
      error: `Book between ${String(BOOKING_FIRST_HOUR).padStart(2, "0")}:00 and ${BOOKING_LAST_HOUR}:00.`,
    };
  }

  return { ok: true, value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

/** True when a stored value would be accepted today. Used to decide whether a legacy time
 *  can still be shown in the picker. */
export function isBookableTime(raw: unknown): boolean {
  const result = normaliseStartTime(raw);
  return result.ok && result.value !== null;
}
