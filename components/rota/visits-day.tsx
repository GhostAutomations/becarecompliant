"use client";

/**
 * Be Care Compliant: one branch's visits for one day, as runs (Rota and Visits Stage 2, Phil
 * 2026-10-15). Each carer's visits in time order, then the visits still needing a carer. Mobile
 * first: runs stack; wider screens show them side by side. The picker recommends carers in Phil's
 * order: compliant, nearest, then preferred and continuity; anyone who cannot go is listed folded,
 * with the reason.
 */

import { useEffect, useState } from "react";
import ActionForm from "@/components/rota/rota-action";
import ClockLines from "@/components/rota/clock-lines";
import { OUTCOME_WORDS, taskReasonLabel, taskSummary } from "@/lib/rota/tasks";
import { CentreDialog } from "@/components/panel-dialog";
import {
  cancelVisitAction,
  clearVisitFlagAction,
  getVisitCandidatesAction,
  moveRunAction,
  visitAssignAction,
  visitMoveAction,
  visitUnassignAction,
} from "@/lib/rota/visit-actions";
import { milesLabel } from "@/lib/rota/geo";
import type { RotaAssignment, RotaVisit, VisitCandidate } from "@/lib/rota/types";

type Picker = { mode: "assign"; visit: RotaVisit } | { mode: "move"; visit: RotaVisit; assignment: RotaAssignment };

export default function VisitsDay({
  branchId,
  dateIso,
  visits,
  people,
}: {
  branchId: string;
  dateIso: string;
  visits: RotaVisit[];
  people: { id: string; name: string }[];
}) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const [runFrom, setRunFrom] = useState<{ personId: string; name: string } | null>(null);

  const runs = new Map<string, { name: string; visits: RotaVisit[] }>();
  for (const v of visits) {
    for (const a of v.assignments) {
      const r = runs.get(a.personId) ?? { name: a.name, visits: [] };
      r.visits.push(v);
      runs.set(a.personId, r);
    }
  }
  const needing = visits.filter((v) => v.assignments.length < v.carersNeeded);
  const sortedRuns = [...runs.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section aria-label="Needing a carer" className="glass-card space-y-3 border-amber-500/30 p-4">
          <h2 className="text-sm font-semibold text-white/90">Needing a carer ({needing.length})</h2>
          {needing.length === 0 ? <p className="text-xs text-white/45">Every visit has its carers.</p> : null}
          {needing.map((v) => (
            <VisitCard key={`n-${v.id}`} visit={v} onAdd={() => setPicker({ mode: "assign", visit: v })} onMove={(a) => setPicker({ mode: "move", visit: v, assignment: a })} />
          ))}
        </section>

        {sortedRuns.map(([personId, run]) => (
          <section key={personId} aria-label={`${run.name}'s run`} className="glass-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white/90">
                {run.name} <span className="font-normal text-white/50">· {run.visits.length} visit{run.visits.length === 1 ? "" : "s"}</span>
              </h2>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setRunFrom({ personId, name: run.name })}>
                Move run
              </button>
            </div>
            {run.visits.map((v) => (
              <VisitCard key={`${personId}-${v.id}`} visit={v} onAdd={() => setPicker({ mode: "assign", visit: v })} onMove={(a) => setPicker({ mode: "move", visit: v, assignment: a })} />
            ))}
          </section>
        ))}
      </div>

      <CentreDialog open={picker !== null} onClose={() => setPicker(null)} label={picker ? pickerTitle(picker) : "Choose a carer"}>
        <div className="p-5">{picker ? <VisitPicker picker={picker} onDone={() => setPicker(null)} /> : null}</div>
      </CentreDialog>

      <CentreDialog open={runFrom !== null} onClose={() => setRunFrom(null)} label={runFrom ? `Move ${runFrom.name}'s run` : "Move run"}>
        <div className="p-5">
          {runFrom ? (
            <ActionForm
              action={moveRunAction}
              hidden={{ branch_id: branchId, visit_date: dateIso, from_person_id: runFrom.personId }}
              label="Move run"
              savingLabel="Moving…"
              savedLabel="Moved"
              showOk
              onDone={() => setRunFrom(null)}
              onDoneDelayMs={4000}
              className="space-y-3"
            >
              <p className="text-sm text-white/70">Every visit in the run goes through the same checks. Any that cannot move stay where they are, and the reason is shown.</p>
              <select name="person_id" aria-label="Move the run to" required defaultValue="">
                <option value="" disabled>
                  Choose who takes the run
                </option>
                {people.filter((p) => p.id !== runFrom.personId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </ActionForm>
          ) : null}
        </div>
      </CentreDialog>
    </>
  );
}

function pickerTitle(p: Picker): string {
  const when = `${p.visit.startTime} to ${p.visit.endTime}, ${p.visit.serviceUserName}`;
  return p.mode === "move" ? `Move ${p.assignment.name}'s visit, ${when}` : `Choose a carer, ${when}`;
}

function VisitCard({ visit, onAdd, onMove }: { visit: RotaVisit; onAdd: () => void; onMove: (a: RotaAssignment) => void }) {
  const open = visit.carersNeeded - visit.assignments.length;
  return (
    <div className={`space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 ${visit.paused ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {visit.startTime} to {visit.endTime}
          </p>
          <p className="text-xs text-white/70">
            {visit.serviceUserName}
            {visit.postcode ? ` · ${visit.postcode}` : ""}
          </p>
          <p className="text-xs text-white/45">{visit.service ?? "Visit"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {visit.paused ? <span className="pill pill-amber">Paused</span> : null}
          {visit.scheduleChanged ? <span className="pill pill-red">Schedule changed</span> : null}
          <span className={`pill ${open > 0 ? "pill-amber" : "pill-green"}`}>
            {visit.assignments.length} of {visit.carersNeeded}
          </span>
          <span className={`pill ${visit.status === "published" ? "pill-green" : "pill-neutral"}`}>{visit.status === "published" ? "Published" : "Draft"}</span>
        </div>
      </div>
      {visit.assignments.length ? (
        <ul className="space-y-1">
          {visit.assignments.map((a) => (
            <li key={a.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-white/85">{a.name}</span>
                <span className="flex flex-wrap gap-1">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onMove(a)}>
                    Move
                  </button>
                  <ActionForm
                    action={visitUnassignAction}
                    hidden={{ assignment_id: a.id, visit_id: visit.id }}
                    label="Take off"
                    savingLabel="Taking off…"
                    savedLabel="Taken off"
                    buttonClassName="btn-ghost px-2 py-1 text-xs"
                    className=""
                    confirm={`Take ${a.name} off this visit?${visit.status === "published" ? " They will be sent a text." : ""}`}
                  />
                </span>
              </div>
              {a.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">
                  {w.text}
                </p>
              ))}
              <ClockLines
                targetKind="visit"
                targetId={visit.id}
                personId={a.personId}
                personName={a.name}
                clocks={visit.clocks ?? []}
                published={visit.status === "published"}
                startsAt={visit.startsAt}
                endsAt={visit.endsAt}
              />
              {visit.tasks && visit.status === "published" ? <TaskLines tasks={visit.tasks} personId={a.personId} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {open > 0 ? (
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={onAdd}>
            Add carer
          </button>
        ) : null}
        {visit.scheduleChanged ? (
          <ActionForm action={clearVisitFlagAction} hidden={{ visit_id: visit.id }} label="Checked" savingLabel="Saving…" savedLabel="Saved" buttonClassName="btn-outline px-3 py-1.5 text-xs" className="" />
        ) : null}
        <ActionForm
          action={cancelVisitAction}
          hidden={{ visit_id: visit.id }}
          label="Cancel visit"
          savingLabel="Cancelling…"
          savedLabel="Cancelled"
          buttonClassName="btn-ghost px-3 py-1.5 text-xs"
          className=""
          confirm={`Cancel the ${visit.startTime} visit to ${visit.serviceUserName}?${visit.status === "published" && visit.assignments.length ? " The carers on it will be sent a text." : ""}`}
        />
      </div>
    </div>
  );
}

function VisitPicker({ picker, onDone }: { picker: Picker; onDone: () => void }) {
  const [list, setList] = useState<VisitCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRefused, setShowRefused] = useState(false);

  const movingId = picker.mode === "move" ? picker.assignment.id : undefined;
  useEffect(() => {
    let live = true;
    getVisitCandidatesAction(picker.visit.id, movingId).then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else setList(r.candidates ?? []);
    });
    return () => {
      live = false;
    };
  }, [picker.visit.id, movingId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!list) return <p className="text-sm text-white/60" role="status">Working out who is best placed…</p>;
  const can = list.filter((c) => !c.refusal);
  const cannot = list.filter((c) => c.refusal);
  const action = picker.mode === "move" ? visitMoveAction : visitAssignAction;
  const hidden: Record<string, string> =
    picker.mode === "move"
      ? { visit_id: picker.visit.id, assignment_id: picker.assignment.id, from_person_id: picker.assignment.personId }
      : { visit_id: picker.visit.id };

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">Best placed first: no warnings, then nearest, then preferred and those who know the service user.</p>
      {can.length === 0 ? <p className="text-sm text-white/60">Nobody in your branches can do this visit.</p> : null}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {can.map((c) => (
          <li key={c.personId} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white/90">
                {c.name}
                {c.preferred ? <span className="pill pill-green ml-2">Preferred</span> : null}
              </span>
              <span className="block text-xs text-white/50">
                {[c.jobTitle, c.branchName, milesLabel(c.miles) ?? "distance not known", c.continuity ? `${c.continuity} visit${c.continuity === 1 ? "" : "s"} to them` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {c.warnings.map((w, i) => (
                <span key={i} className="block text-xs text-amber-300">
                  {w.text}
                </span>
              ))}
            </span>
            <ActionForm
              action={action}
              hidden={{ ...hidden, person_id: c.personId, dbs: c.dbs }}
              label={picker.mode === "move" ? "Move here" : "Add"}
              buttonClassName={c.warnings.length ? "btn-outline px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
              className=""
              showOk
              onDone={onDone}
              onDoneDelayMs={2500}
              confirm={c.warnings.length ? `${c.name}: ${c.warnings.map((w) => w.text).join(" ")} Add anyway? This is recorded.` : undefined}
            />
          </li>
        ))}
      </ul>
      {cannot.length ? (
        <div>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowRefused((v) => !v)}>
            {showRefused ? "Hide" : "Show"} {cannot.length} who cannot do it
          </button>
          {showRefused ? (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {cannot.map((c) => (
                <li key={c.personId} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/55">
                  {c.refusal}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One carer's task outcomes on a visit, for the office (Stage 4): a summary, open for the detail. */
function TaskLines({ tasks, personId }: { tasks: NonNullable<RotaVisit["tasks"]>; personId: string }) {
  const mine = tasks.byPerson[personId] ?? {};
  const recorded = Object.keys(mine).length > 0;
  const s = taskSummary(tasks.list, mine);
  const flagged = s.keyMissing > 0 || Object.values(mine).some((o) => o.outcome !== "done");
  return (
    <details className="mt-1">
      <summary className={`cursor-pointer text-xs ${recorded && flagged ? "text-amber-300" : "text-white/60"}`}>
        Tasks: {recorded ? s.text : `${tasks.list.length} task${tasks.list.length === 1 ? "" : "s"}, none recorded yet`}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {tasks.list.map((t) => {
          const o = mine[t.uid];
          return (
            <li key={t.uid} className={`text-xs ${!o ? "text-white/50" : o.outcome === "done" ? "text-white/70" : "text-amber-300"}`}>
              {t.name}
              {t.key ? " (key)" : ""}: {o ? `${OUTCOME_WORDS[o.outcome]}${o.reason_code ? `, ${taskReasonLabel(o.reason_code, o.reason_text)}` : ""}` : "not recorded"}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
