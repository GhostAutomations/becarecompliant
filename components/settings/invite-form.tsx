"use client";

import { useActionState, useState } from "react";
import { inviteUser } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";
import { picksABranch, mayChooseAllBranches, ALL_BRANCHES } from "@/lib/people/roles";

type BranchOption = { id: string; name: string; kind: string };

export function InviteForm({ branches }: { branches: BranchOption[] }) {
  const [state, formAction, pending] = useActionState(inviteUser, IDLE_STATE);
  /* THE BRANCH FIELD WAS TELLING A LIE (Phil, 2026-08-19). A Responsible Individual and a
     Registered Manager are company wide in the database — is_company_wide covers both, so they
     reach every branch whatever is picked here. Forcing a branch implied they belonged to one,
     and for an RM who runs the lot it read as a demotion. Now the field says what is true. */
  const [role, setRole] = useState("team_member");
  const noBranch = !picksABranch(role);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="form-label">
            Full name
          </label>
          <input id="full_name" name="full_name" placeholder="Alex Powell" required />
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
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="registered_individual">Responsible Individual</option>
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
          {noBranch ? (
            <>
              <input
                id="branch_id"
                name="branch_id"
                value=""
                readOnly
                hidden
                aria-hidden="true"
              />
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/70">
                All branches
              </p>
              <p className="form-hint">
                This role sees and manages every branch, so there is no branch to choose.
              </p>
            </>
          ) : (
            <select id="branch_id" name="branch_id" defaultValue="" required key={role}>
              <option value="" disabled>
                Choose a branch
              </option>
              {/* Offered to a Registered Manager, deliberately NOT selected for them: some run
                  every branch, some run one registered service, and the product should not
                  assume which (Phil, 2026-08-19). */}
              {mayChooseAllBranches(role) ? (
                <option value={ALL_BRANCHES}>All branches</option>
              ) : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.kind === "team" ? " (Team)" : ""}
                </option>
              ))}
            </select>
          )}
          {mayChooseAllBranches(role) ? (
            <p className="form-hint">
              Pick one branch, or All branches for somebody who covers every site. You can change
              it later on this screen.
            </p>
          ) : null}
        </div>
      </div>

      {/* DELAYED INVITES (Phil, 2026-08-19). The invitation is created either way; this only
          holds the email until somebody presses Send invite on the pending list below. */}
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input type="checkbox" name="hold_email" value="1" className="mt-0.5" />
        <span>
          Don&rsquo;t send the email yet
          <span className="block text-xs text-white/50">
            They are added and appear below as &ldquo;Not sent yet&rdquo;. Send it when you are
            ready for them to have access.
          </span>
        </span>
      </label>

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
