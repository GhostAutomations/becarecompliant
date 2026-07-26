"use client";

/**
 * Be Care Compliant — everything you can do to one user, on ONE LINE.
 *
 * This used to open a second row of labelled fields under the name, which made a
 * single user a tall tile: fine for three Admins, unusable once Team Member
 * logins arrive. Everything is now compact and inline (Phil, 2026-07-26): role,
 * primary branch, additional branch views, Save, Enable or Disable, Delete, and
 * the status pill, sitting on the same line as the name.
 *
 * The controls are compact but not cryptic: each one carries a title and an
 * aria-label, so the labels that used to be printed above them are still there
 * for a screen reader and on hover.
 *
 * Save behaviour is the standing rule: instant "Saving", a brief green "Saved",
 * then back to normal (useSavedFlash).
 */

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveTeamMember, setUserStatus } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import DeleteUserDialog from "@/components/settings/delete-user-dialog";

type Branch = { id: string; name: string };

export default function TeamMemberControls({
  userId,
  userLabel,
  role,
  status,
  primaryBranchId,
  additionalBranchIds,
  branches,
}: {
  userId: string;
  userLabel: string;
  role: string;
  status: string;
  primaryBranchId: string | null;
  additionalBranchIds: string[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveTeamMember, IDLE_STATE);
  const [statusState, statusAction, statusPending] = useActionState(setUserStatus, IDLE_STATE);

  useEffect(() => {
    if (statusState.ok) router.refresh();
  }, [statusState.ok, router]);
  const [roleValue, setRoleValue] = useState(role);
  const [primary, setPrimary] = useState(primaryBranchId ?? "");
  const [additional, setAdditional] = useState<string[]>(additionalBranchIds);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [saved, flash, reset] = useSavedFlash();
  // Refresh after a successful save so the list reflects the change.
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      router.refresh();
    }
  }, [state, pending, flash, router]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // A branch cannot be both primary and an additional view.
  const additionalClean = additional.filter((id) => id !== primary);
  const additionalOptions = branches.filter((b) => b.id !== primary);

  function toggleAdditional(id: string) {
    setAdditional((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5" onChange={reset}>
        <input type="hidden" name="user_id" value={userId} />
        {additionalClean.map((id) => (
          <input key={id} type="hidden" name="additional_branch_ids" value={id} />
        ))}

        <select
          id={`role-${userId}`}
          name="role"
          className="inline-cell"
          aria-label="Role"
          title="Role"
          value={roleValue}
          onChange={(e) => setRoleValue(e.target.value)}
        >
          <option value="registered_individual">Registered Individual</option>
          <option value="registered_manager">Registered Manager</option>
          <option value="manager">Branch Manager</option>
          <option value="supervisor">Supervisor</option>
          <option value="team_member">Viewer</option>
          <option value="staff">Team Member</option>
        </select>

        <select
          id={`primary-${userId}`}
          name="primary_branch_id"
          className="inline-cell"
          aria-label="Primary branch"
          title="Primary branch"
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
        >
          <option value="" disabled>Branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-cell text-left"
            aria-label="Additional branch views"
            title="Additional branch views"
          >
            {additionalClean.length > 0 ? `+${additionalClean.length} branch` : "No extras"}
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-50 mt-1 flex max-h-56 w-48 flex-col gap-1 overflow-auto rounded-xl border border-white/15 bg-navy-900 p-2 shadow-2xl">
              {additionalOptions.length === 0 ? (
                <span className="px-2 py-1 text-xs text-white/50">No other branches.</span>
              ) : (
                additionalOptions.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-white/85 hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={additionalClean.includes(b.id)}
                      onChange={() => toggleAdditional(b.id)}
                    />
                    {b.name}
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-1 text-xs`}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </form>

      <form action={statusAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="status" value={status === "active" ? "disabled" : "active"} />
        <button type="submit" disabled={statusPending} className="btn-ghost px-2.5 py-1 text-xs">
          {statusPending ? "Saving…" : status === "active" ? "Disable" : "Enable"}
        </button>
      </form>

      <DeleteUserDialog
        userId={userId}
        userLabel={userLabel}
        triggerLabel="Delete"
        triggerClassName="btn-ghost px-2.5 py-1 text-xs text-rag-red-soft hover:bg-rag-red/10"
      />

      <span className={status === "active" ? "pill-green" : "pill-red"}>{status}</span>

      {state.error ? <p className="w-full text-right form-error">{state.error}</p> : null}
      {statusState.error ? (
        <p className="w-full text-right form-error">{statusState.error}</p>
      ) : null}
    </div>
  );
}
