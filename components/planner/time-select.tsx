"use client";

/**
 * Be Care Compliant — the booking time picker.
 *
 * The grid and the window live in lib/planner/booking-time.ts, which the SERVER ACTION also
 * uses. Before 2026-08-12 this dropdown was the only thing stopping a nonsense time, and it
 * was not stopping anything: the action wrote whatever it was posted, which is how
 * "01:54 Care Plan Review" reached the dashboard. A dropdown is not a validator.
 */

import { useState } from "react";
import {
  bookingHours,
  bookingMinutes,
  isBookableTime,
  BOOKING_LAST_HOUR,
} from "@/lib/planner/booking-time";

const HOURS = bookingHours();

function initialParts(defaultValue?: string): [string, string] {
  // A legacy value outside the grid (there are rows from before it existed) opens BLANK
  // rather than being silently rounded to something nobody chose.
  if (!defaultValue || !isBookableTime(defaultValue)) return ["", ""];
  const [h, m] = defaultValue.split(":");
  return [h.padStart(2, "0"), m];
}

export default function TimeSelect({
  name = "start_time",
  defaultValue,
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [initHour, initMinute] = initialParts(defaultValue);
  const [hour, setHour] = useState(initHour);
  const [minute, setMinute] = useState(initMinute);

  const minutes = hour ? bookingMinutes(hour) : bookingMinutes("09");
  // Moving to the last hour after picking, say, :45 would otherwise leave an impossible
  // pair on screen that the server then refuses.
  const effectiveMinute = minute && minutes.includes(minute) ? minute : "";
  const value = hour && effectiveMinute ? `${hour}:${effectiveMinute}` : "";

  return (
    <div className="flex items-center gap-1">
      <select
        className="w-full min-w-0"
        value={hour}
        onChange={(e) => {
          const next = e.target.value;
          setHour(next);
          if (next && !bookingMinutes(next).includes(minute)) setMinute("");
        }}
        aria-label="Hour"
      >
        <option value="" />
        {HOURS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="text-white/50">:</span>
      <select
        className="w-full min-w-0"
        value={effectiveMinute}
        onChange={(e) => setMinute(e.target.value)}
        aria-label="Minute"
      >
        <option value="" />
        {minutes.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <input type="hidden" name={name} value={value} />
      {hour === String(BOOKING_LAST_HOUR) ? (
        <span className="sr-only">{BOOKING_LAST_HOUR}:00 is the last bookable time.</span>
      ) : null}
    </div>
  );
}
