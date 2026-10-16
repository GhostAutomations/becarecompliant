"use client";

/**
 * Be Care Compliant: Carer day (Rota and Visits Stage 5b, Phil's popups 2026-10-16). Every carer
 * working that day down the side, their visits and shifts across the day. A visit can be dragged
 * with a mouse onto another carer (or from Unassigned onto a carer) or along the line to a new
 * start time. Nothing changes until the office has seen what will happen and confirmed it; the
 * server then checks every rule again (the same as Move, and the time change rules).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Timeline, { type BlockTone, type TimelineDrop, type TimelineRow } from "@/components/rota/timeline";
import { CentreDialog } from "@/components/panel-dialog";
import { changeVisitTimeAction, getVisitCandidatesAction, visitAssignAction, visitMoveAction } from "@/lib/rota/visit-actions";
import { fromMinutes, toMinutes } from "@/lib/rota/timeline";
import type { VisitCandidate } from "@/lib/rota/types";
import type { ActionState } from "@/lib/forms";

export type DropMeta = {
  visitId: string;
  assignmentId: string | null; // null: an open place on the visit (Unassigned)
  personId: string | null;
  serviceUserName: string;
  startTime: string;
  endTime: string;
};

type Pending =
  | { kind: "carer"; meta: DropMeta; toPerson: string; toName: string; loading: boolean; candidate: VisitCandidate | null; error: string | null }
  | { kind: "time"; meta: DropMeta; newStart: number; error: string | null };

const IDLE: ActionState = {};

export default function CarerDay({
  rows,
  meta,
  nowMinute,
  legend,
}: {
  rows: TimelineRow[];
  meta: Record<string, DropMeta>;
  nowMinute: number | null;
  legend: BlockTone[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const names = new Map(rows.map((r) => [r.key, r.label]));

  async function onDrop(d: TimelineDrop) {
    const m = meta[d.block.id];
    if (!m) return;
    setNotice(null);
    if (d.toRow !== d.fromRow) {
      if (d.toRow === "unassigned") return; // taking a carer off is done on the Visits page
      const toName = names.get(d.toRow) ?? "That carer";
      setPending({ kind: "carer", meta: m, toPerson: d.toRow, toName, loading: true, candidate: null, error: null });
      const res = await getVisitCandidatesAction(m.visitId, m.assignmentId ?? undefined);
      const c = res.candidates?.find((x) => x.personId === d.toRow) ?? null;
      setPending({
        kind: "carer",
        meta: m,
        toPerson: d.toRow,
        toName,
        loading: false,
        candidate: c,
        error: res.error ?? (c ? null : `${toName} is not on the list of carers who could take this visit.`),
      });
      return;
    }
    setPending({ kind: "time", meta: m, newStart: d.newStart, error: null });
  }

  async function confirm() {
    if (!pending) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("visit_id", pending.meta.visitId);
      let res: ActionState;
      if (pending.kind === "carer") {
        fd.set("person_id", pending.toPerson);
        if (pending.candidate?.dbs) fd.set("dbs", pending.candidate.dbs);
        if (pending.meta.assignmentId) {
          fd.set("assignment_id", pending.meta.assignmentId);
          if (pending.meta.personId) fd.set("from_person_id", pending.meta.personId);
          res = await visitMoveAction(IDLE, fd);
        } else {
          res = await visitAssignAction(IDLE, fd);
        }
      } else {
        fd.set("start_time", fromMinutes(pending.newStart));
        res = await changeVisitTimeAction(IDLE, fd);
      }
      if (res.error) {
        // Kept open with the reason, so nothing is lost and the office can see why.
        setPending({ ...pending, error: res.error } as Pending);
        return;
      }
      setPending(null);
      setNotice(res.ok ?? "Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const length = pending ? (toMinutes(pending.meta.endTime) - toMinutes(pending.meta.startTime) + 1440) % 1440 : 0;

  return (
    <div className="space-y-3">
      {notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200" role="status">
          {notice}
        </p>
      ) : null}
      <Timeline
        rows={rows}
        labelHeader="Carer"
        nowMinute={nowMinute}
        onDrop={onDrop}
        emptyText="Nobody is on a visit or shift in this branch on this day."
        legend={legend}
      />
      <p className="text-xs text-white/45">
        Tap a visit to open it. With a mouse, drag a visit onto another carer to move it, or along the line to change its time (5 minute steps, same day). You are asked before anything changes.
      </p>

      <CentreDialog open={pending !== null} onClose={() => (saving ? undefined : setPending(null))} label={pending?.kind === "time" ? "Change the time?" : "Move the visit?"}>
        {pending ? (
          <div className="space-y-3 p-5">
            {pending.kind === "carer" ? (
              <>
                <p className="text-sm text-white/80">
                  {pending.meta.assignmentId ? "Move" : "Put"} the {pending.meta.startTime} visit for {pending.meta.serviceUserName} {pending.meta.assignmentId ? "to" : "with"} {pending.toName}?
                </p>
                {pending.loading ? <p className="text-sm text-white/55">Checking {pending.toName}…</p> : null}
                {pending.candidate?.refusal ? <p className="text-sm text-red-300">{pending.toName} cannot take it: {pending.candidate.refusal}</p> : null}
                {pending.candidate && !pending.candidate.refusal && pending.candidate.warnings.length ? (
                  <ul className="space-y-1 text-xs text-amber-300">
                    {pending.candidate.warnings.map((w, i) => (
                      <li key={i}>{w.text}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-white/80">
                Change the visit for {pending.meta.serviceUserName} from {pending.meta.startTime} to {fromMinutes(pending.newStart)} (ends {fromMinutes(pending.newStart + length)})? The
                Care Schedule is not changed; this visit keeps its new time.
              </p>
            )}
            <p className="text-xs text-white/50">If the visit is published, the carers on it get a text saying their rota has changed.</p>
            {pending.error ? <p className="text-sm text-red-300">{pending.error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                disabled={saving || (pending.kind === "carer" && (pending.loading || !pending.candidate || Boolean(pending.candidate.refusal)))}
                onClick={confirm}
              >
                {saving ? "Saving…" : pending.kind === "time" ? "Change the time" : pending.meta.assignmentId ? "Move the visit" : "Put them on it"}
              </button>
              <button type="button" className="btn-outline px-4 py-2 text-sm" disabled={saving} onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </CentreDialog>
    </div>
  );
}
