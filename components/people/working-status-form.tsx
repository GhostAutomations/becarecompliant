"use client";

/**
 * Be Care Compliant — the Working status control on Manage record, with the leaver questions
 * (DEF-058, Phil 2026-09-23).
 *
 * Choosing Leaver opens the questions underneath, and none of them can be skipped: the leaving
 * date (past, today or future), the reason, would you re-employ, moving to a competitor, and a
 * score out of ten for attitude, attendance, lateness, professionalism, privacy and team work.
 * The server checks the same things with the same function (lib/people/leaving.ts), so what the
 * screen accepts is what the save accepts.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { setEmploymentStatus } from "@/lib/people/actions";
import { WORKING_STATUS_LABELS, type EmploymentStatus } from "@/lib/people/types";
import { COMPETITOR_ANSWERS, LEAVING_REASONS, LEAVING_SCORES } from "@/lib/people/leaving";

export default function WorkingStatusForm({
  personId,
  current,
  todayIso,
}: {
  personId: string;
  current: EmploymentStatus;
  todayIso: string;
}) {
  const [status, setStatus] = useState<EmploymentStatus>(current);
  const [reason, setReason] = useState("");
  const [competitor, setCompetitor] = useState("");
  const asking = status === "leaver" && current !== "leaver";

  return (
    <ActionForm
      action={setEmploymentStatus}
      hidden={{ person_id: personId }}
      label={asking ? "Save leaver" : "Save status"}
      buttonClassName="btn-primary text-xs"
      className="w-full space-y-4"
    >
      <div>
        <label htmlFor="working_status" className="form-label">
          Working status
          <span className="ml-2 font-normal text-white/40">(this button saves the status only)</span>
        </label>
        <select
          id="working_status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as EmploymentStatus)}
          className="max-w-xs"
        >
          {(Object.keys(WORKING_STATUS_LABELS) as EmploymentStatus[]).map((k) => (
            <option key={k} value={k}>
              {WORKING_STATUS_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {asking ? (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-white/70">
            Every question is needed before they can be made a leaver.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="leaving_date" className="form-label">Leaving date</label>
              <input id="leaving_date" name="leaving_date" type="date" defaultValue={todayIso} required />
              <p className="form-hint">
                Today or a later date: they stay on the register and in the emails until the end
                of that day. An earlier date makes them a leaver straight away.
              </p>
            </div>

            <div>
              <label htmlFor="reason" className="form-label">Reason for leaving</label>
              <select id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="">Choose</option>
                {LEAVING_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {reason === "other" ? (
                <input name="reason_other" className="mt-2" placeholder="What was the reason?" required />
              ) : null}
            </div>

            <div>
              <label htmlFor="re_employ" className="form-label">Would you re-employ them?</label>
              <select id="re_employ" name="re_employ" defaultValue="" required>
                <option value="">Choose</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label htmlFor="competitor" className="form-label">Are they moving to a competitor?</label>
              <select id="competitor" name="competitor" value={competitor} onChange={(e) => setCompetitor(e.target.value)} required>
                <option value="">Choose</option>
                {COMPETITOR_ANSWERS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {competitor === "yes" ? (
                <input name="competitor_name" className="mt-2" placeholder="Which company?" required />
              ) : null}
            </div>
          </div>

          <div>
            <p className="form-label">Scores out of ten</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {LEAVING_SCORES.map((s) => (
                <div key={s.key}>
                  <label htmlFor={s.key} className="text-xs text-white/60">{s.label}</label>
                  <select id={s.key} name={s.key} defaultValue="" required>
                    <option value="">Choose</option>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <p className="form-hint">
            Their login closes when they become a leaver. Everything on their record is kept.
          </p>
        </div>
      ) : null}
    </ActionForm>
  );
}
