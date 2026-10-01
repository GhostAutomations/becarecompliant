"use client";

import { useState } from "react";
import { scwRenewalFromIssue } from "@/lib/people/scw";

/**
 * THE TWO SOCIAL CARE WALES DATES (0362, Phil 2026-10-01). Type when they were registered or last
 * renewed and the renewal date fills in three years later, the way a training renewal follows its
 * completion date. Change the renewal date by hand (SCWonline shows something different) and it
 * stops following, so a later edit to the issue date can never quietly overwrite it. A stored
 * renewal date that does not match its issue date counts as typed by hand for the same reason.
 *
 * Used by the Training matrix popup, Manage record and Add person, so the three cannot drift.
 */
export default function ScwDates({
  idPrefix,
  defaultIssue,
  defaultRenewal,
}: {
  idPrefix: string;
  defaultIssue?: string | null;
  defaultRenewal?: string | null;
}) {
  const [issue, setIssue] = useState(defaultIssue ?? "");
  const [renewal, setRenewal] = useState(defaultRenewal ?? "");
  const [renewalTyped, setRenewalTyped] = useState(
    Boolean(defaultRenewal) && defaultRenewal !== scwRenewalFromIssue(defaultIssue ?? null),
  );

  const onIssue = (value: string) => {
    setIssue(value);
    if (renewalTyped) return;
    setRenewal(scwRenewalFromIssue(value) ?? "");
  };

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}_issued`} className="form-label">
          Social Care Wales: registered or last renewed on
        </label>
        <input
          id={`${idPrefix}_issued`}
          name="scw_registered_on"
          type="date"
          value={issue}
          onChange={(e) => onIssue(e.target.value)}
          className="max-w-[10rem]"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}_renewal`} className="form-label">
          Social Care Wales renewal date
        </label>
        <input
          id={`${idPrefix}_renewal`}
          name="scw_renewal_date"
          type="date"
          value={renewal}
          onChange={(e) => {
            setRenewal(e.target.value);
            setRenewalTyped(e.target.value !== "");
          }}
          className="max-w-[10rem]"
        />
        <p className="form-hint">
          {renewalTyped
            ? "Typed by hand, so it no longer follows the registered date."
            : "Worked out as 3 years after the registered date. Change it if SCWonline shows a different date."}
        </p>
      </div>
    </>
  );
}
