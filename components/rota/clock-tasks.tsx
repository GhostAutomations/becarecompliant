"use client";

/**
 * Be Care Compliant: a visit's tasks on the carer's Clock in page (Rota and Visits Stage 4, Phil's
 * popups 2026-10-16). Each task: Done, or Not done (refused or not needed) with one of Phil's
 * reasons. Saved on the phone first, like clock taps; the latest outcome counts and earlier ones
 * are kept. Key tasks are marked; clock out asks for them first (clock-app.tsx).
 */

import { useState } from "react";
import {
  OUTCOME_WORDS,
  TASK_REASONS,
  outcomeProblem,
  taskReasonLabel,
  type RecordedOutcome,
  type TaskItem,
  type TaskOutcomeKind,
  type TaskReasonCode,
} from "@/lib/rota/tasks";

export type RecordTask = (task: TaskItem, outcome: TaskOutcomeKind, reason: TaskReasonCode | null, text: string) => Promise<void>;

export default function VisitTaskList({
  tasks,
  outcomes,
  onRecord,
  onlyKey = false,
}: {
  tasks: TaskItem[];
  outcomes: Record<string, RecordedOutcome & { waiting?: boolean }>;
  onRecord: RecordTask;
  /** Show only the key tasks still without an outcome (the clock out check). */
  onlyKey?: boolean;
}) {
  const shown = onlyKey ? tasks.filter((t) => t.key && t.uid && !outcomes[t.uid]) : tasks;
  if (shown.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Tasks">
      {shown.map((t) => (
        <TaskRow key={t.uid ?? t.name} task={t} outcome={t.uid ? outcomes[t.uid] : undefined} onRecord={onRecord} />
      ))}
    </ul>
  );
}

function TaskRow({ task, outcome, onRecord }: { task: TaskItem; outcome?: RecordedOutcome & { waiting?: boolean }; onRecord: RecordTask }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TaskOutcomeKind>("refused");
  const [reason, setReason] = useState<TaskReasonCode | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const problem = outcomeProblem(kind, reason, text);

  async function save(o: TaskOutcomeKind, r: TaskReasonCode | null, why: string) {
    setSaving(true);
    try {
      await onRecord(task, o, r, why);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm text-white/90">
          {task.name}
          {task.key ? <span className="pill pill-amber ml-2">Key</span> : null}
          {outcome ? (
            <span className={`block text-xs ${outcome.outcome === "done" ? "text-emerald-300" : "text-amber-300"}`}>
              {OUTCOME_WORDS[outcome.outcome]}
              {outcome.reason_code ? `: ${taskReasonLabel(outcome.reason_code, outcome.reason_text)}` : ""}
              {outcome.waiting ? " (waiting to send)" : ""}
            </span>
          ) : null}
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            className={outcome?.outcome === "done" ? "btn-saved px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
            disabled={saving}
            onClick={() => save("done", null, "")}
          >
            Done
          </button>
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={saving} onClick={() => setOpen((v) => !v)}>
            Not done
          </button>
        </span>
      </div>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 p-2">
          <div className="flex gap-3 text-sm text-white/85" role="radiogroup" aria-label="Refused or not needed">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={kind === "refused"} onChange={() => setKind("refused")} />
              Refused
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={kind === "not_needed"} onChange={() => setKind("not_needed")} />
              Not needed
            </label>
          </div>
          <select value={reason ?? ""} onChange={(e) => setReason((e.target.value || null) as TaskReasonCode | null)} aria-label="Reason">
            <option value="">Pick a reason…</option>
            {TASK_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          {reason === "other" ? (
            <input type="text" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the reason" aria-label="Reason" />
          ) : null}
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={Boolean(problem) || saving} onClick={() => save(kind, reason, text)}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}
    </li>
  );
}
