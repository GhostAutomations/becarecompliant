"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createLog, updateLog } from "@/lib/on-call/actions";
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
}: {
  branches: BranchOption[];
  people: PersonOption[];
  serviceUsers: ServiceUserLite[];
  currentUserId: string;
  nowLocal: string;
  log?: OnCallLog;
}) {
  const editing = !!log;
  const router = useRouter();
  const [state, formAction, pending] = useActionState(editing ? updateLog : createLog, IDLE_STATE);
  const [branchId, setBranchId] = useState(log?.branch_id ?? "");

  const visibleSus = branchId ? serviceUsers.filter((s) => s.branch_id === branchId) : serviceUsers;

  return (
    <form action={formAction} className="space-y-5">
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
          <input id="occurred_at" name="occurred_at" type="datetime-local" defaultValue={toLocalInput(log?.occurred_at ?? null) || nowLocal} />
        </div>

        <div>
          <label htmlFor="handler_profile_id" className="form-label">Handled by</label>
          <select id="handler_profile_id" name="handler_profile_id" defaultValue={log?.handler_profile_id ?? currentUserId}>
            <option value="">Someone else</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="form-hint">If not listed, leave as &quot;Someone else&quot; and type a name below.</p>
          <input name="handler_name" defaultValue={log?.handler_name ?? ""} placeholder="Handler name (if not listed)" className="mt-2" />
        </div>

        <div>
          <label htmlFor="category" className="form-label">Category</label>
          <input id="category" name="category" list="oncall-categories" defaultValue={log?.category ?? ""} placeholder="What kind of call" />
          <datalist id="oncall-categories">
            {CALL_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label htmlFor="caller_name" className="form-label">Caller name</label>
          <input id="caller_name" name="caller_name" defaultValue={log?.caller_name ?? ""} placeholder="Who called" />
        </div>

        <div>
          <label htmlFor="caller_relationship" className="form-label">Caller was a</label>
          <select id="caller_relationship" name="caller_relationship" defaultValue={log?.caller_relationship ?? ""}>
            <option value="">Not stated</option>
            {CALLER_RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {serviceUsers.length > 0 ? (
          <div className="sm:col-span-2">
            <label htmlFor="service_user_id" className="form-label">Related service user</label>
            <select id="service_user_id" name="service_user_id" defaultValue={log?.service_user_id ?? ""}>
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
          <textarea id="details" name="details" rows={3} required defaultValue={log?.details ?? ""} placeholder="Describe the call" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="action_taken" className="form-label">Action taken</label>
          <textarea id="action_taken" name="action_taken" rows={2} defaultValue={log?.action_taken ?? ""} placeholder="What was done in response" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="outcome" className="form-label">Outcome</label>
          <textarea id="outcome" name="outcome" rows={2} defaultValue={log?.outcome ?? ""} placeholder="How it was resolved" />
        </div>

        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-white">
            <input type="checkbox" name="follow_up_required" defaultChecked={log?.follow_up_required ?? false} />
            Needs follow-up in working hours
          </label>
          <textarea name="follow_up_notes" rows={2} defaultValue={log?.follow_up_notes ?? ""} placeholder="What needs following up" className="mt-3" />
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
    </form>
  );
}
