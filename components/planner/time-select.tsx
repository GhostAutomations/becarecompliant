"use client";

import { useState } from "react";

/** Two dropdowns for a booking time: hours 08–20 and minutes 00/15/30/45.
 *  Blank until both are chosen. Submits the combined value (HH:MM) as a hidden
 *  `name` field; stays empty until an hour AND minute are selected. */
const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 8).padStart(2, "0")); // 08..20
const MINUTES = ["00", "15", "30", "45"];

function initialParts(defaultValue?: string): [string, string] {
  if (defaultValue && /^\d{1,2}:\d{2}$/.test(defaultValue)) {
    const [h, m] = defaultValue.split(":");
    const hn = Math.min(20, Math.max(8, parseInt(h, 10)));
    const mn = parseInt(m, 10);
    const nearest = [0, 15, 30, 45].reduce((a, b) => (Math.abs(b - mn) < Math.abs(a - mn) ? b : a), 0);
    return [String(hn).padStart(2, "0"), String(nearest).padStart(2, "0")];
  }
  return ["", ""];
}

export default function TimeSelect({ name = "start_time", defaultValue }: { name?: string; defaultValue?: string }) {
  const [initHour, initMinute] = initialParts(defaultValue);
  const [hour, setHour] = useState(initHour);
  const [minute, setMinute] = useState(initMinute);
  const value = hour && minute ? `${hour}:${minute}` : "";
  return (
    <div className="flex items-center gap-1">
      <select className="w-full min-w-0" value={hour} onChange={(e) => setHour(e.target.value)} aria-label="Hour">
        <option value="" />
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-white/50">:</span>
      <select className="w-full min-w-0" value={minute} onChange={(e) => setMinute(e.target.value)} aria-label="Minute">
        <option value="" />
        {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
