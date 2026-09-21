"use client";

/**
 * "They already work here" — the history panel on Add a person.
 *
 * Phil, 2026-09-21: "in people we have add a person, this assumes that it is always a new
 * person, i want an option on the add a person page, tick it and all the column names are
 * visible with boxes for the required data to be added, along with the current boxes that are on
 * add a person, then when the add person button is pressed, it adds them to the matrix with all
 * the data just entered."
 *
 * HIDDEN UNTIL IT IS TICKED, because most adds are new starters and twenty empty date boxes in
 * front of somebody adding their first carer is a worse screen for the common case. Ticked, the
 * boxes appear in the order the matrix draws its columns and under the names this company has
 * given them, so filling it in is reading across a row of the register.
 *
 * WHICH BOXES EXIST IS DECIDED SERVER SIDE (lib/people/history-boxes.ts) from the company's own
 * checks and its supervision cycle, and the SAVE reads the same list. A box that appears is a
 * box that is saved.
 *
 * EVERY BOX IS OPTIONAL. Phil, asked and answered 2026-09-21: blank means never done, and that
 * check then schedules itself exactly as it does for a new starter. Somebody whose paperwork is
 * half there is still somebody you have to be able to add.
 */

import { useState } from "react";
import { RTW_LIMIT_LABELS, PROBATION_STATUS_LABELS } from "@/lib/people/types";

export type HistoryBoxView = { name: string; label: string };
export type TrackerBoxView = {
  name: string;
  label: string;
  kind: "date" | "rtw_limits" | "probation_status";
  /** Which date belongs in this box: a completion, an expiry or a deadline. */
  hint: string;
};

export default function AlreadyHerePanel({
  flagName,
  trackerBoxes,
  historyBoxes,
}: {
  flagName: string;
  trackerBoxes: TrackerBoxView[];
  historyBoxes: HistoryBoxView[];
}) {
  const [on, setOn] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <label className="flex items-start gap-2 text-sm text-white/85">
        <input
          type="checkbox"
          name={flagName}
          value="1"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1"
        />
        <span>
          They already work here
          <span className="block text-xs text-white/50">
            Tick this to record what they have already done. Their register row is filled in the
            moment you press Add person, and the next date for each check is worked out from your
            own cycle.
          </span>
        </span>
      </label>

      {on ? (
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Their documents</h3>
            {/* Four date boxes in a column, every one labelled with a document name, is four
                chances to put the wrong date in — and a DBS issued in March typed into a box
                that wanted an expiry is not a mistake anything downstream can catch. So each
                one says which date it wants (Phil, 2026-09-21). */}
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {trackerBoxes.map((b) => (
                <div key={b.name}>
                  <label htmlFor={b.name} className="form-label">{b.label}</label>
                  {b.kind === "date" ? (
                    <input id={b.name} name={b.name} type="date" />
                  ) : b.kind === "rtw_limits" ? (
                    <select id={b.name} name={b.name} defaultValue="">
                      <option value="">Not set</option>
                      {Object.entries(RTW_LIMIT_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <select id={b.name} name={b.name} defaultValue="">
                      <option value="">Not set</option>
                      {Object.entries(PROBATION_STATUS_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  )}
                  <p className="form-hint">{b.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">When each one was last done</h3>
            <p className="mt-1 text-xs text-white/50">
              Leave a box empty if it has never happened. Supervisions are asked one at a time
              because that is how the register draws them, and putting each one where it actually
              happened is what keeps the cycle right.
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {historyBoxes.map((b) => (
                <div key={b.name}>
                  <label htmlFor={b.name} className="form-label">{b.label}</label>
                  <input id={b.name} name={b.name} type="date" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
