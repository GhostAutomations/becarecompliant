"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createOutcome,
  editOutcome,
  logOutcomeUpdate,
  completeOutcome,
  reopenOutcome,
  archiveOutcome,
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
}: {
  serviceUserId: string;
  outcomes: OutcomeRow[];
  intervalMonths: number;
  today: string;
}) {
  const active = outcomes.filter((o) => o.status !== "achieved");
  const achieved = outcomes.filter((o) => o.status === "achieved");
  const [showAchieved, setShowAchieved] = useState(false);

  return (
    <div className="space-y-6">
      <AddOutcome serviceUserId={serviceUserId} />

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
            <OutcomeCard key={o.id} serviceUserId={serviceUserId} outcome={o} intervalMonths={intervalMonths} today={today} />
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
                <OutcomeCard key={o.id} serviceUserId={serviceUserId} outcome={o} intervalMonths={intervalMonths} today={today} />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function AddOutcome({ serviceUserId }: { serviceUserId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createOutcome, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();

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
    <form action={formAction} onChange={reset} className="glass-card space-y-3 p-5">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <div>
        <label className="form-label">Outcome</label>
        <input name="title" required placeholder="e.g. Keep attending my Tuesday art class" maxLength={300} />
      </div>
      <div>
        <label className="form-label">What matters, and how we will support it (optional)</label>
        <textarea name="detail" rows={3} placeholder="The detail behind this outcome and the steps being taken." />
      </div>
      <div className="max-w-[12rem]">
        <label className="form-label">Target date (optional)</label>
        <input type="date" name="target_date" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"}`}>
          {pending ? "Adding…" : saved ? "Added" : "Add outcome"}
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
  today,
}: {
  serviceUserId: string;
  outcome: OutcomeRow;
  intervalMonths: number;
  today: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [showHistory, setShowHistory] = useState(false);
  const isActive = outcome.status !== "achieved";
  const anchor = (outcome.last_update_at ?? outcome.created_at)?.slice(0, 10) ?? null;
  const rag = outcomeUpdateRag(anchor, intervalMonths, today, isActive);

  return (
    <div className="glass-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">{outcome.title}</h3>
          {outcome.detail ? <p className="mt-1 text-sm text-white/65">{outcome.detail}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
            {outcome.target_date ? <span>Target {fmt(outcome.target_date)}</span> : null}
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
              Log update
            </button>
            <button type="button" onClick={() => setPanel(panel === "complete" ? null : "complete")} className="btn-outline text-xs">
              Mark achieved
            </button>
          </>
        ) : (
          <ReopenButton serviceUserId={serviceUserId} outcomeId={outcome.id} />
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
        <LogUpdateForm serviceUserId={serviceUserId} outcomeId={outcome.id} onDone={() => setPanel(null)} />
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
                  <span className="text-white/60">{fmt(u.created_at)}</span>
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
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LogUpdateForm({ serviceUserId, outcomeId, onDone }: { serviceUserId: string; outcomeId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(logOutcomeUpdate, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [progress, setProgress] = useState<OutcomeProgress>("progressing");
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      onDone();
    }
  }, [state, pending, flash, onDone]);

  return (
    <form action={formAction} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcome_id" value={outcomeId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          <label className="form-label">Progress</label>
          <select name="progress" value={progress} onChange={(e) => setProgress(e.target.value as OutcomeProgress)}>
            {OUTCOME_PROGRESS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Note (optional)</label>
          <input name="note" placeholder="What has changed since the last update." maxLength={2000} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${saved ? "btn-saved" : "btn-primary"} text-xs`}>
          {pending ? "Recording…" : saved ? "Recorded" : "Record update"}
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
    <form action={formAction} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
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
    <form action={formAction} onChange={reset} className="space-y-3 border-t border-white/10 pt-3">
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
      <div className="max-w-[12rem]">
        <label className="form-label">Target date (optional)</label>
        <input type="date" name="target_date" defaultValue={outcome.target_date ?? ""} />
      </div>
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
    <form action={formAction}>
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
    <form action={formAction} className="inline-flex items-center gap-2">
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
