"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLog, updateLog, saveLogDraft } from "@/lib/on-call/actions";
import { IDLE_STATE } from "@/lib/forms";
import { toLocalInput } from "@/lib/on-call/format";
import { CALLER_RELATIONSHIPS, CALL_CATEGORIES, type BranchOption, type OnCallLog, type PersonOption } from "@/lib/on-call/types";

type ServiceUserLite = { id: string; full_name: string; branch_id: string | null };

export default function LogForm({
  branches,
  people,
  serviceUsers,
  currentUserId,
  nowLocal,
  log,
  draft,
}: {
  branches: BranchOption[];
  people: PersonOption[];
  serviceUsers: ServiceUserLite[];
  currentUserId: string;
  nowLocal: string;
  log?: OnCallLog;
  /** When present (new-call page), the form prefills from this saved draft and
   *  autosaves as you type. Absent for edit/drill-down. */
  draft?: Record<string, string> | null;
}) {
  const editing = !!log;
  const draftEnabled = !editing && draft !== undefined;
  const d = draft ?? {};
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, formAction, pending] = useActionState(editing ? updateLog : createLog, IDLE_STATE);
  const [branchId, setBranchId] = useState(log?.branch_id ?? d.branch_id ?? "");

  // A value for a field: the record when editing, else the saved draft, else a fallback.
  const dv = (key: string, fallback = "") => (editing ? fallback : d[key] ?? fallback);

  const visibleSus = branchId ? serviceUsers.filter((s) => s.branch_id === branchId) : serviceUsers;

  // Debounced autosave of the in-progress draft (new-call only).
  function onChange() {
    if (!draftEnabled || !formRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    const fd = new FormData(formRef.current);
    const obj: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (k === "_who" || k === "id" || typeof v !== "string") return;
      obj[k] = v;
    });
    timer.current = setTimeout(() => { void saveLogDraft(obj); }, 1000);
  }

  return (
    <form ref={formRef} action={formAction} onChange={onChange} className="space-y-5">
      {editing ? <input type="hidden" name="id" value={log.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
          <select id="branch_id" name="branch_id" required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="occurred_at" className="form-label">When the call came in</label>
          <input id="occurred_at" name="occurred_at" type="datetime-local" defaultValue={editing ? (toLocalInput(log?.occurred_at ?? null) || nowLocal) : (d.occurred_at || nowLocal)} />
        </div>

        <div>
          <label htmlFor="handler_profile_id" className="form-label">Handled by</label>
          <select id="handler_profile_id" name="handler_profile_id" defaultValue={editing ? (log?.handler_profile_id ?? "") : (d.handler_profile_id ?? currentUserId)}>
            <option value="">Someone else</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="form-hint">If not listed, leave as &quot;Someone else&quot; and type a name below.</p>
          <input name="handler_name" defaultValue={editing ? (log?.handler_name ?? "") : dv("handler_name")} placeholder="Handler name (if not listed)" className="mt-2" />
        </div>

        <div>
          <label htmlFor="category" className="form-label">Category</label>
          <input id="category" name="category" list="oncall-categories" defaultValue={editing ? (log?.category ?? "") : dv("category")} placeholder="What kind of call" />
          <datalist id="oncall-categories">
            {CALL_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label htmlFor="caller_name" className="form-label">Caller name</label>
          <input id="caller_name" name="caller_name" defaultValue={editing ? (log?.caller_name ?? "") : dv("caller_name")} placeholder="Who called" />
        </div>

        <div>
          <label htmlFor="caller_relationship" className="form-label">Caller was a</label>
          <select id="caller_relationship" name="caller_relationship" defaultValue={editing ? (log?.caller_relationship ?? "") : dv("caller_relationship")}>
            <option value="">Not stated</option>
            {CALLER_RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {serviceUsers.length > 0 ? (
          <div className="sm:col-span-2">
            <label htmlFor="service_user_id" className="form-label">Related service user</label>
            <select id="service_user_id" name="service_user_id" defaultValue={editing ? (log?.service_user_id ?? "") : dv("service_user_id")}>
              <option value="">Not about a specific service user</option>
              {visibleSus.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
            <p className="form-hint">{branchId ? "Optional. Service users in the chosen branch." : "Optional. Choose a branch first to narrow this list."}</p>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <label htmlFor="details" className="form-label">What was the call about? *</label>
          <textarea id="details" name="details" rows={3} required defaultValue={editing ? (log?.details ?? "") : dv("details")} placeholder="Describe the call" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="action_taken" className="form-label">Action taken</label>
          <textarea id="action_taken" name="action_taken" rows={2} defaultValue={editing ? (log?.action_taken ?? "") : dv("action_taken")} placeholder="What was done in response" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="outcome" className="form-label">Outcome</label>
          <textarea id="outcome" name="outcome" rows={2} defaultValue={editing ? (log?.outcome ?? "") : dv("outcome")} placeholder="How it was resolved" />
        </div>

        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-white">
            <input type="checkbox" name="follow_up_required" defaultChecked={editing ? (log?.follow_up_required ?? false) : d.follow_up_required === "on"} />
            Needs follow-up in working hours
          </label>
          <textarea name="follow_up_notes" rows={2} defaultValue={editing ? (log?.follow_up_notes ?? "") : dv("follow_up_notes")} placeholder="What needs following up" className="mt-3" />
          {editing ? (
            <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="follow_up_done" defaultChecked={log.follow_up_done} />
              Follow-up completed
            </label>
          ) : null}
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p className="rounded-xl border border-gold-400/40 bg-gold-400/15 px-3.5 py-2.5 text-sm text-gold-300">{state.ok}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save call" : "Log call"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/on-call/log")} disabled={pending}>
          {editing ? "Back to log" : "Cancel"}
        </button>
      </div>
      {draftEnabled ? (
        <p className="text-xs text-white/40">This call saves automatically as you type, and stays for up to 12 hours until you submit it, even if you log out.</p>
      ) : null}
    </form>
  );
}
