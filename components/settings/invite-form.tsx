"use client";

import { useActionState } from "react";
import { inviteUser } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";

type BranchOption = { id: string; name: string; kind: string };

export function InviteForm({ branches }: { branches: BranchOption[] }) {
  const [state, formAction, pending] = useActionState(inviteUser, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="form-label">
            Full name
          </label>
          <input id="full_name" name="full_name" placeholder="Alex Powell" />
        </div>
        <div>
          <label htmlFor="email" className="form-label">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="alex@company.co.uk"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="role" className="form-label">
            Role
          </label>
          <select id="role" name="role" defaultValue="team_member">
            <option value="registered_individual">Registered Individual</option>
            <option value="registered_manager">Registered Manager</option>
            <option value="manager">Branch Manager</option>
            <option value="supervisor">Supervisor</option>
            <option value="on_call">On Call</option>
            <option value="team_member">Viewer</option>
          </select>
        </div>
        <div>
          <label htmlFor="branch_id" className="form-label">
            Branch
          </label>
          <select id="branch_id" name="branch_id" defaultValue="" required>
            <option value="" disabled>
              Choose a branch
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.kind === "team" ? " (Team)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          className="rounded-xl border border-gold-400/40 bg-gold-400/15 px-3.5 py-2.5 text-sm text-gold-300"
        >
          {state.ok}
        </p>
      ) : null}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
