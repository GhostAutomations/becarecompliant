"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createOutcome,
  editOutcome,
  logOutcomeUpdate,
  completeOutcome,
  reopenOutcome,
  archiveOutcome,
  setOutcomeTarget,
} from "@/lib/service-users/outcomes-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  OUTCOME_PROGRESS,
  OUTCOME_STATUS_LABEL,
  OUTCOME_STATUS_PILL,
  OUTCOME_PROGRESS_LABEL,
  OUTCOME_PROGRESS_PILL,
  REVIEW_RAG_PILL,
  outcomeUpdateRag,
  type OutcomeRow,
  type OutcomeProgress,
} from "@/lib/service-users/outcome-consts";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { enteredLaterLine, londonDate, outcomeFrom, ukDate, updateDate } from "@/lib/service-users/outcome-history";

/** The Founder's window for past entries, when it is open for this company (0449). */
type PastWindow = { until: string } | null;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "—";
}

export default function OutcomesManager({
  serviceUserId,
  outcomes,
  intervalMonths,
  today,
  past,
  discharged,
}: {
  serviceUserId: string;
  outcomes: OutcomeRow[];
  intervalMonths: number;
  today: string;
  past: PastWindow;
  /** The discharge date, when this person has been discharged. */
  discharged: string | null;
}) {
  const active = outcomes.filter((o) => o.status !== "achieved");
  const achieved = outcomes.filter((o) => o.status === "achieved");
  const [showAchieved, setShowAchieved] = useState(false);
  // A discharged person takes past entries only, while the window is open (Phil, 2026-10-13).
  const ctx: EntryCtx = { past, discharged, today, pastOnly: !!past && !!discharged };

  return (
    <div className="space-y-6">
      {past ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          You can add past outcomes and past updates until the end of {ukDate(past.until)}. Each one is marked
          as added later, with the date it speaks for.
          {ctx.pastOnly ? ` This person was discharged on ${ukDate(discharged)}, so only past entries can be added.` : ""}
        </p>
      ) : null}
      <AddOutcome serviceUserId={serviceUserId} ctx={ctx} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Active outcomes {active.length > 0 ? `(${active.length})` : ""}
        </h2>
        {active.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/55">
            No active outcomes yet. Add what matters to this person above.
          </div>
        ) : (
          active.map((o) => (
            <OutcomeCard key={o.id} serviceUserId={serviceUserId} outcome={o} intervalMonths={intervalMonths} ctx={ctx} />
          ))
        )}
      </div>

      {achieved.length > 0 ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAchieved((v) => !v)}
            className="text-sm font-semibold uppercase tracking-wide text-white/60 hover:text-white/90"
          >
            {showAchieved ? "▾" : "▸"} Achieved outcomes ({achieved.length})
          </button>
          {showAchieved
            ? achieved.map((o) => (
                <OutcomeCard key={o.id} serviceUserId={serviceUserId} outcome={o} intervalMonths={intervalMonths} ctx={ctx} />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

type EntryCtx = { past: PastWindow; discharged: string | null; today: string; pastOnly: boolean };

/** The past option's tick box, shown only while the window is open. */
function PastTick({
  ctx,
  label,
  checked,
  onChange,
}: {
  ctx: EntryCtx;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  if (!ctx.past) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        checked={checked || ctx.pastOnly}
        disabled={ctx.pastOnly}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function AddOutcome({ serviceUserId, ctx }: { serviceUserId: string; ctx: EntryCtx }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createOutcome, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [pastTicked, setPastTicked] = useState(false);
  const isPast = !!ctx.past && (pastTicked || ctx.pastOnly);
  const latestFrom = ctx.discharged && ctx.discharged < ctx.today ? ctx.discharged : ctx.today;

  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      setOpen(false);
    }
  }, [state, pending, flash]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        Add an outcome
      </button>
    );
  }

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="glass-card space-y-3 p-5">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <div>
        <label className="form-label">Outcome</label>
        <input name="title" required placeholder="e.g. Keep attending my Tuesday art class" maxLength={300} />
      </div>
      <div>
        <label className="form-label">What matters, and how we will support it (optional)</label>
        <textarea name="detail" rows={3} placeholder="The detail behind this outcome and the steps being taken." />
      </div>
      <PastTick ctx={ctx} label="This is a past outcome" checked={pastTicked} onChange={setPastTicked} />
      {isPast ? <input type="hidden" name="entered_later" value="1" /> : null}
      {isPast ? (
        <div className="grid max-w-[25rem] gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">From</label>
            <input type="date" name="start_date" required max={latestFrom} />
          </div>
          <div>
            <label className="form-label">To, the target date (optional)</label>
            <input type="date" name="target_date" />
          </div>
        </div>
      ) : (
        <div className="max-w-[12rem]">
          <label className="form-label">Target date (optional)</label>
          <input type="date" name="target_date" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"}`}>
          {pending ? "Adding…" : saved ? "Added" : isPast ? "Add past outcome" : "Add outcome"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

type Panel = "update" | "edit" | "complete" | null;

function OutcomeCard({
  serviceUserId,
  outcome,
  intervalMonths,
  ctx,
}: {
  serviceUserId: string;
  outcome: OutcomeRow;
  intervalMonths: number;
  ctx: EntryCtx;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [showHistory, setShowHistory] = useState(false);
  const isActive = outcome.status !== "achieved";
  // A past outcome with no update yet is due from the day it began.
  const anchor = (outcome.last_update_at ?? outcome.start_date ?? outcome.created_at)?.slice(0, 10) ?? null;
  const rag = outcomeUpdateRag(anchor, intervalMonths, ctx.today, isActive);
  const from = outcomeFrom(outcome);
  const achievedStamp = outcome.achieved_at ?? outcome.last_update_at;
  const achievedOn = !isActive && achievedStamp ? londonDate(achievedStamp) : null;

  return (
    <div className="glass-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">{outcome.title}</h3>
          {outcome.detail ? <p className="mt-1 text-sm text-white/65">{outcome.detail}</p> : null}
          {outcome.entered_later && outcome.start_date ? (
            <p className="mt-1 text-xs text-amber-200/80">
              {enteredLaterLine(outcome.created_at, outcome.entered_by_name, outcome.start_date)}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/45">
            {outcome.start_date ? <span>From {ukDate(outcome.start_date)}</span> : null}
            {/* The target date is edited WHERE IT IS SHOWN (Phil, 2026-09-15). It used to be
                grey text, with the only way to change it three clicks away behind Edit, so it
                read as something the system had worked out rather than something you set. */}
            <TargetDate serviceUserId={serviceUserId} outcome={outcome} />
            {outcome.last_update_at ? <span>Last update {fmt(outcome.last_update_at)}</span> : <span>No updates yet</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`pill ${OUTCOME_STATUS_PILL[outcome.status]}`}>{OUTCOME_STATUS_LABEL[outcome.status]}</span>
          {isActive && (rag.rag === "amber" || rag.rag === "red") ? (
            <span className={`pill ${REVIEW_RAG_PILL[rag.rag]}`} title={rag.dueIso ? `Update due ${fmt(rag.dueIso)}` : undefined}>
              {rag.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isActive ? (
          <>
            <button type="button" onClick={() => setPanel(panel === "update" ? null : "update")} className="btn-outline text-xs">
              {ctx.pastOnly ? "Add a past update" : "Log update"}
            </button>
            {ctx.pastOnly ? null : (
              <button type="button" onClick={() => setPanel(panel === "complete" ? null : "complete")} className="btn-outline text-xs">
                Mark achieved
              </button>
            )}
          </>
        ) : (
          <>
            <ReopenButton serviceUserId={serviceUserId} outcomeId={outcome.id} />
            {/* History before the achievement can still be filled in while the window is open. */}
            {ctx.past ? (
              <button type="button" onClick={() => setPanel(panel === "update" ? null : "update")} className="btn-outline text-xs">
                Add a past update
              </button>
            ) : null}
          </>
        )}
        <button type="button" onClick={() => setPanel(panel === "edit" ? null : "edit")} className="btn-outline text-xs">
          Edit
        </button>
        {outcome.updates.length > 0 ? (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn-outline text-xs">
            History ({outcome.updates.length})
          </button>
        ) : null}
        <RemoveButton serviceUserId={serviceUserId} outcomeId={outcome.id} />
      </div>

      {panel === "update" ? (
        <LogUpdateForm
          serviceUserId={serviceUserId}
          outcomeId={outcome.id}
          onDone={() => setPanel(null)}
          ctx={ctx}
          from={from}
          achievedOn={achievedOn}
        />
      ) : null}
      {panel === "complete" ? (
        <CompleteForm serviceUserId={serviceUserId} outcomeId={outcome.id} onDone={() => setPanel(null)} />
      ) : null}
      {panel === "edit" ? (
        <EditForm serviceUserId={serviceUserId} outcome={outcome} onDone={() => setPanel(null)} />
      ) : null}

      {showHistory ? (
        <ul className="space-y-2 border-t border-white/10 pt-3">
          {outcome.updates.map((u) => (
            <li key={u.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/60">{ukDate(updateDate(u))}</span>
                  {u.kind === "completed" ? (
                    <span className="pill pill-green">Achieved</span>
                  ) : u.kind === "reopened" ? (
                    <span className="pill pill-neutral">Reopened</span>
                  ) : u.progress ? (
                    <span className={`pill ${OUTCOME_PROGRESS_PILL[u.progress]}`}>{OUTCOME_PROGRESS_LABEL[u.progress]}</span>
                  ) : null}
                </div>
                <span className="text-xs text-white/40">{u.author_name ?? "—"}</span>
              </div>
              {u.note ? <p className="mt-1 text-xs text-white/60">{u.note}</p> : null}
              {u.entered_later && u.dated_on ? (
                <p className="mt-1 text-xs text-amber-200/80">{enteredLaterLine(u.created_at, u.author_name, u.dated_on)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LogUpdateForm({
  serviceUserId,
  outcomeId,
  onDone,
  ctx,
  from,
  achievedOn,
}: {
  serviceUserId: string;
  outcomeId: string;
  onDone: () => void;
  ctx: EntryCtx;
  /** The day the outcome began: a past update cannot be dated before it. */
  from: string;
  /** The day it was achieved, for an achieved outcome: only past updates up to then. */
  achievedOn: string | null;
}) {
  const [state, formAction, pending] = useActionState(logOutcomeUpdate, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [progress, setProgress] = useState<OutcomeProgress | "achieved">("progressing");
  const [pastTicked, setPastTicked] = useState(false);
  const forcePast = ctx.pastOnly || achievedOn !== null;
  const isPast = !!ctx.past && (pastTicked || forcePast);
  const latest = [ctx.today, ctx.discharged, achievedOn].filter((d): d is string => !!d).sort()[0];
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      onDone();
    }
  }, [state, pending, flash, onDone]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcomeId} />
      {achievedOn ? null : (
        <PastTick ctx={ctx} label="This is a past update" checked={pastTicked} onChange={setPastTicked} />
      )}
      {isPast ? <input type="hidden" name="entered_later" value="1" /> : null}
      <div className={`grid gap-3 ${isPast ? "sm:grid-cols-[10rem_12rem_1fr]" : "sm:grid-cols-[12rem_1fr]"}`}>
        {isPast ? (
          <div>
            <label className="form-label">Date of the update</label>
            <input type="date" name="dated_on" required min={from} max={latest} />
          </div>
        ) : null}
        <div>
          <label className="form-label">Progress</label>
          <select
            name="progress"
            value={!isPast && progress === "achieved" ? "progressing" : progress}
            onChange={(e) => setProgress(e.target.value as OutcomeProgress | "achieved")}
          >
            {OUTCOME_PROGRESS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
            {/* A past update may mark the outcome achieved on its day (Phil, 2026-10-13). */}
            {isPast && !achievedOn ? <option value="achieved">Achieved</option> : null}
          </select>
        </div>
        <div>
          <label className="form-label">Note (optional)</label>
          <input name="note" placeholder="What has changed since the last update." maxLength={2000} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}>
          {pending ? "Recording…" : saved ? "Recorded" : isPast ? "Record past update" : "Record update"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-xs">Cancel</button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

function CompleteForm({ serviceUserId, outcomeId, onDone }: { serviceUserId: string; outcomeId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(completeOutcome, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      onDone();
    }
  }, [state, pending, flash, onDone]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcomeId} />
      <div>
        <label className="form-label">Closing note (optional)</label>
        <input name="note" placeholder="How this outcome was achieved." maxLength={2000} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}>
          {pending ? "Saving…" : saved ? "Achieved" : "Mark achieved"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-xs">Cancel</button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

/**
 * The target date, on the card, editable in place.
 *
 * Saves on change rather than behind a button: there is one value, it is a date, and a Save
 * button next to a single date box is a step that exists only to be forgotten. Clearing it
 * removes the target, because an outcome with no date is open ended rather than wrong.
 */
function TargetDate({ serviceUserId, outcome }: { serviceUserId: string; outcome: OutcomeRow }) {
  const [state, formAction] = useActionState(setOutcomeTarget, IDLE_STATE);
  const [saved, flash] = useSavedFlash();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) flash(); }, [state, flash]);

  return (
    <form ref={formRef} onSubmit={submitKeepingTyped(formAction)} className="flex items-center gap-1.5">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcome.id} />
      <label htmlFor={`target-${outcome.id}`} className="text-white/45">Target</label>
      <input
        id={`target-${outcome.id}`}
        type="date"
        name="target_date"
        defaultValue={outcome.target_date ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="ctl-sm"
      />
      {saved ? <span className="text-rag-green-soft">Saved</span> : null}
      {state.error ? <span className="text-rag-red-soft">{state.error}</span> : null}
    </form>
  );
}

function EditForm({ serviceUserId, outcome, onDone }: { serviceUserId: string; outcome: OutcomeRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(editOutcome, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      onDone();
    }
  }, [state, pending, flash, onDone]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcome.id} />
      <div>
        <label className="form-label">Outcome</label>
        <input name="title" required defaultValue={outcome.title} maxLength={300} />
      </div>
      <div>
        <label className="form-label">Detail (optional)</label>
        <textarea name="detail" rows={3} defaultValue={outcome.detail ?? ""} />
      </div>
      {/* No target date here: it is edited on the card. Two boxes writing one column is how
          they end up disagreeing about which was saved last. */}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}>
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-xs">Cancel</button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

function ReopenButton({ serviceUserId, outcomeId }: { serviceUserId: string; outcomeId: string }) {
  const [state, formAction, pending] = useActionState(reopenOutcome, IDLE_STATE);
  const [saved, flash] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);
  return (
    <form onSubmit={submitKeepingTyped(formAction)}>
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcomeId} />
      <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-outline"} text-xs`}>
        {pending ? "Reopening…" : saved ? "Reopened" : "Reopen"}
      </button>
    </form>
  );
}

function RemoveButton({ serviceUserId, outcomeId }: { serviceUserId: string; outcomeId: string }) {
  const [state, formAction, pending] = useActionState(archiveOutcome, IDLE_STATE);
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="btn-outline text-xs text-red-300">
        Remove
      </button>
    );
  }
  return (
    <form onSubmit={submitKeepingTyped(formAction)} className="inline-flex items-center gap-2">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcomeId} />
      <button type="submit" disabled={pending} className="btn-danger text-xs">
        {pending ? "Removing…" : "Confirm remove"}
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="btn-ghost text-xs">Cancel</button>
      {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
    </form>
  );
}
