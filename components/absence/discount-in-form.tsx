"use client";

/**
 * Be Care Compliant — discount absences inside the absence meeting form (Phil, 2026-10-07).
 *
 * During the meeting the manager may agree that some absences should not count, and that changes
 * the outcome. Ticked here, they are discounted when the meeting is saved (never before: close the
 * form without saving and nothing changes). The outcome letter generated below is told which, so
 * it can say so. Managers and above only, checked again on the server and by the database.
 * This replaces the "Did it discount any absences?" box that used to follow Save meeting.
 */

import { useEffect, useMemo, useState } from "react";
import type { Answers } from "@/lib/form-schema";
import type { AbsenceEventRow } from "@/lib/absence/data";
import { meetingDiscountReason } from "@/lib/absence/discount";
import { stageFrom } from "@/lib/absence/record-meeting";

function slash(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso ?? "";
}

function when(a: AbsenceEventRow): string {
  return a.end_date && a.end_date !== a.start_date ? `${slash(a.start_date)} to ${slash(a.end_date)}` : slash(a.start_date);
}

export default function DiscountInForm({
  absences,
  ctx,
}: {
  /** The absences that count today, oldest first. */
  absences: AbsenceEventRow[];
  ctx: {
    answers: Answers;
    busy: boolean;
    extras: Record<string, string>;
    setExtra: (key: string, value: string) => void;
  };
}) {
  const { answers, busy, extras, setExtra } = ctx;
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set((extras.discount_ids ?? "").split(",").filter(Boolean)),
  );
  const suggested = meetingDiscountReason(
    stageFrom(answers.meeting_type),
    typeof answers.date_of_meeting === "string" ? answers.date_of_meeting : null,
  );
  const [reason, setReason] = useState(extras.discount_reason ?? "");
  const [reasonTouched, setReasonTouched] = useState(!!extras.discount_reason);
  const shownReason = reasonTouched ? reason : suggested;

  // Ticks kept with the part-finished form come back after the panel has drawn.
  useEffect(() => {
    const held = (extras.discount_ids ?? "").split(",").filter(Boolean);
    if (held.length && ticked.size === 0) setTicked(new Set(held));
    if (extras.discount_reason && !reasonTouched) {
      setReason(extras.discount_reason);
      setReasonTouched(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras.discount_ids, extras.discount_reason]);

  const chosen = useMemo(() => absences.filter((a) => ticked.has(a.id)), [absences, ticked]);

  useEffect(() => {
    setExtra("discount_ids", chosen.map((a) => a.id).join(","));
    setExtra("discount_reason", chosen.length ? shownReason : "");
    setExtra(
      "discount_note",
      chosen.map((a) => `${when(a)}${a.reason ? ` (${a.reason.replace(/\s+/g, " ").trim()})` : ""}`).join("; "),
    );
  }, [chosen, shownReason, setExtra]);

  function toggle(id: string, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold text-white">Discount absences</h3>
      <p className="mt-1 text-xs text-white/60">
        Tick any absence the meeting agreed not to count. It is discounted when you save the meeting:
        it stays on the record, struck through, and stops counting towards the triggers.
      </p>
      {absences.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">No absences count at the moment, so there is nothing to discount.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {absences.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
              <input
                type="checkbox"
                checked={ticked.has(a.id)}
                disabled={busy}
                onChange={(e) => toggle(a.id, e.target.checked)}
              />
              <span className="min-w-0 text-sm text-white/85">
                {when(a)}
                {a.reason ? <span className="block text-xs text-white/55">{a.reason}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}
      {chosen.length > 0 ? (
        <div className="mt-3">
          <label className="form-label" htmlFor="discount-in-form-reason">
            Reason for discounting
          </label>
          <textarea
            id="discount-in-form-reason"
            rows={2}
            maxLength={500}
            disabled={busy}
            value={shownReason}
            onChange={(e) => {
              setReasonTouched(true);
              setReason(e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-white/50">
            {chosen.length === 1 ? "1 absence" : `${chosen.length} absences`} will be discounted when you save
            the meeting. If you have already generated the outcome letter, generate it again so it mentions this.
          </p>
        </div>
      ) : null}
    </section>
  );
}
