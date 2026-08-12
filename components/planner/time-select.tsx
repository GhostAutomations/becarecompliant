"use client";

/**
 * Be Care Compliant — the booking time picker.
 *
 * ONE dropdown of whole times, not an hour box and a minute box.
 *
 * It was two boxes until 2026-08-12, when Phil sent a screenshot captioned "cant see the
 * time": the Time field is one third of a three column row, and two selects sharing it,
 * each with its own chevron and a colon between them, left about one character of room.
 * "10:00" rendered as "1" and "0". Widening them would have been fiddling with the symptom.
 *
 * One select also deletes a whole class of bug rather than handling it: there is no longer
 * an hour-and-minute pair that can disagree, so 22:45 cannot be assembled on screen and
 * then refused on save. Every option in the list is a time the server and the database
 * both accept, because the list is generated from the same rule they enforce
 * (lib/planner/booking-time.ts).
 */

import { useState } from "react";
import { bookingTimes, isBookableTime } from "@/lib/planner/booking-time";

const TIMES = bookingTimes();

export default function TimeSelect({
  name = "start_time",
  defaultValue,
}: {
  name?: string;
  defaultValue?: string;
}) {
  // Postgres hands back "10:00:00"; the options are "10:00". A legacy value outside the
  // grid opens as no time rather than being silently rounded to something nobody chose.
  const initial =
    defaultValue && isBookableTime(defaultValue) ? defaultValue.slice(0, 5) : "";
  const [value, setValue] = useState(initial);

  return (
    <select
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="w-full min-w-0"
      aria-label="Time"
    >
      {/* Untimed is a real, common choice, so it says so rather than being a blank line. */}
      <option value="">No time</option>
      {TIMES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
