"use client";

/**
 * Be Care Compliant: one carer's clock in and out on a visit or shift, for the office (Rota and
 * Visits Stage 3, Phil 2026-10-16). Each record shows its time, where it was made and any flags;
 * a missed one can be added by the office with a reason (marked "Added by the office", never over
 * what the carer recorded).
 */

import { useState } from "react";
import ActionForm from "@/components/rota/rota-action";
import { CentreDialog } from "@/components/panel-dialog";
import { officeAddClockAction } from "@/lib/rota/clock-actions";
import { flagWords } from "@/lib/rota/clock";
import type { ClockRecord } from "@/lib/rota/types";

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function londonDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
}

export default function ClockLines({
  targetKind,
  targetId,
  personId,
  personName,
  clocks,
  published,
  startsAt,
  endsAt,
  opensMin = 30,
}: {
  targetKind: "visit" | "shift";
  targetId: string;
  personId: string;
  personName: string;
  clocks: ClockRecord[];
  published: boolean;
  startsAt: string;
  endsAt: string;
  /** When Clock in opens before the start (Settings, Rota, 0509; 30 minutes by default). */
  opensMin?: number;
}) {
  const [adding, setAdding] = useState<"in" | "out" | null>(null);
  const mine = clocks.filter((c) => c.personId === personId);
  const hasIn = mine.some((c) => c.kind === "in");
  const hasOut = mine.some((c) => c.kind === "out");
  // Adding is offered once the visit or shift has started (a clock in opens opensMin minutes before).
  const started = Date.now() >= Date.parse(startsAt) - opensMin * 60_000;
  if (!published) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {mine.map((c) => {
        const flagged = c.location === "outside" || c.location === "unclear" || c.flags.length > 0;
        return (
          <p key={c.id} className={`text-xs ${flagged ? "text-amber-300" : "text-white/60"}`}>
            {c.kind === "in" ? "Clocked in" : "Clocked out"} {hhmm(c.at)} · {c.words}
            {c.addedReason ? ` (${c.addedReason})` : ""}
            {c.flags.length ? ` · ${c.flags.map(flagWords).join(", ")}` : ""}
          </p>
        );
      })}
      {started && (!hasIn || !hasOut) ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {!mine.length ? <span className="text-xs text-white/40">Not clocked in.</span> : null}
          {!hasIn ? (
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setAdding("in")}>
              Add clock in
            </button>
          ) : null}
          {!hasOut ? (
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setAdding("out")}>
              Add clock out
            </button>
          ) : null}
        </div>
      ) : null}

      <CentreDialog open={adding !== null} onClose={() => setAdding(null)} label={`Add a missed clock ${adding ?? ""} for ${personName}`}>
        {adding ? (
          <div className="p-5">
            <ActionForm
              action={officeAddClockAction}
              hidden={{ target_kind: targetKind, target_id: targetId, person_id: personId, kind: adding }}
              label={adding === "in" ? "Add clock in" : "Add clock out"}
              savingLabel="Adding…"
              savedLabel="Added"
              showOk
              onDone={() => setAdding(null)}
              onDoneDelayMs={1500}
              className="space-y-3"
            >
              <p className="text-sm text-white/70">
                Use this only when {personName} forgot or could not {adding === "in" ? "clock in" : "clock out"}. It is marked as added by the office, with your name and the reason.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="form-label">Date</span>
                  <input type="date" name="date" required defaultValue={londonDate(adding === "in" ? startsAt : endsAt)} />
                </label>
                <label className="block">
                  <span className="form-label">Time</span>
                  <input type="time" name="time" required defaultValue={hhmm(adding === "in" ? startsAt : endsAt)} />
                </label>
              </div>
              <label className="block">
                <span className="form-label">Reason</span>
                <textarea name="reason" rows={2} maxLength={500} required placeholder="For example: phone battery was flat, rang the office on arrival" />
              </label>
            </ActionForm>
          </div>
        ) : null}
      </CentreDialog>
    </div>
  );
}
