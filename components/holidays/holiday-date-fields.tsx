"use client";

/**
 * Be Care Compliant — the From, To and Back at work boxes for changing a holiday's dates (0440).
 * One component for the office's Edit dates and a carer's Change dates, so both behave the same:
 * Back at work starts as the date the holiday already has (while it still falls after the last
 * day) or the day after the last day, and follows the To date until somebody types their own.
 *
 * The holiday's current Back at work date also goes in a hidden field, only so the save can say
 * "no change" when nothing was changed; the database decides everything else.
 */

import { useState } from "react";
import { backAtWorkFor, nextDayIso } from "@/lib/holidays/changes";

export default function HolidayDateFields({
  idPrefix,
  start,
  end,
  returnToWork,
  min,
}: {
  idPrefix: string;
  start: string;
  end: string;
  /** What the holiday shows as Back at work now, if anything. */
  returnToWork: string | null | undefined;
  /** The earliest date allowed (a carer's change must start after today). */
  min?: string;
}) {
  const [to, setTo] = useState(end);
  const [back, setBack] = useState(backAtWorkFor(end, returnToWork));
  const [typed, setTyped] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${idPrefix}-start`} className="form-label">From</label>
          <input id={`${idPrefix}-start`} name="start_date" type="date" required min={min} defaultValue={start} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-end`} className="form-label">To</label>
          <input
            id={`${idPrefix}-end`}
            name="end_date"
            type="date"
            required
            min={min}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (!typed && e.target.value) setBack(nextDayIso(e.target.value));
            }}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-back`} className="form-label">Back at work</label>
        <input
          id={`${idPrefix}-back`}
          name="return_to_work"
          type="date"
          required
          min={to ? nextDayIso(to) : undefined}
          value={back}
          onChange={(e) => {
            setBack(e.target.value);
            setTyped(true);
          }}
        />
        <p className="form-hint">The first day back, after the last day of the holiday.</p>
      </div>
      <input type="hidden" name="current_return_to_work" value={returnToWork ?? ""} />
    </>
  );
}
