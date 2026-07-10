"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveTeamMember, setUserStatus, deleteUser } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";

type Branch = { id: string; name: string };

export default function TeamMemberControls({
  userId,
  role,
  status,
  primaryBranchId,
  additionalBranchIds,
  branches,
}: {
  userId: string;
  role: string;
  status: string;
  primaryBranchId: string | null;
  additionalBranchIds: string[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveTeamMember, IDLE_STATE);
  const [roleValue, setRoleValue] = useState(role);
  const [primary, setPrimary] = useState(primaryBranchId ?? "");
  const [additional, setAdditional] = useState<string[]>(additionalBranchIds);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Refresh after a successful save so the list reflects the change.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

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
  const selectedNames = additionalClean
    .map((id) => branches.find((b) => b.id === id)?.name)
    .filter(Boolean);

  function toggleAdditional(id: string) {
    setAdditional((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="user_id" value={userId} />
        {additionalClean.map((id) => (
          <input key={id} type="hidden" name="additional_branch_ids" value={id} />
        ))}

        <div>
          <label htmlFor={`role-${userId}`} className="form-label text-xs">Role</label>
          <select
            id={`role-${userId}`}
            name="role"
            value={roleValue}
            onChange={(e) => setRoleValue(e.target.value)}
          >
            <option value="manager">Manager</option>
            <option value="supervisor">Supervisor</option>
            <option value="team_member">Team Member</option>
          </select>
        </div>

        <div>
          <label htmlFor={`primary-${userId}`} className="form-label text-xs">Primary branch</label>
          <select
            id={`primary-${userId}`}
            name="primary_branch_id"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          >
            <option value="" disabled>Choose a branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div ref={menuRef} className="relative">
          <span className="form-label text-xs">Additional branch views</span>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-cell text-left"
          >
            {selectedNames.length > 0 ? `${selectedNames.length} selected` : "None"}
            <span aria-hidden className="ml-2 opacity-60">▾</span>
          </button>
          {menuOpen ? (
            <div className="absolute z-50 mt-1 flex max-h-56 min-w-[12rem] flex-col gap-1 overflow-auto rounded-xl border border-white/15 bg-navy-900 p-2 shadow-2xl">
              {additionalOptions.length === 0 ? (
                <span className="px-2 py-1 text-xs text-white/50">No other branches.</span>
              ) : (
                additionalOptions.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-white/85 hover:bg-white/10">
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
          <p className="mt-1 max-w-[13rem] text-[10px] text-white/40">
            Can view these branches, but is not auto filled into them when adding records.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className={`btn ${state.ok ? "btn-saved" : "btn-primary"} text-xs`}
        >
          {pending ? "Saving…" : state.ok ? "Saved" : "Save"}
        </button>
      </form>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={setUserStatus}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="status" value={status === "active" ? "disabled" : "active"} />
          <button type="submit" className="btn-ghost px-3 py-2 text-xs">
            {status === "active" ? "Disable" : "Enable"}
          </button>
        </form>
        <form
          action={deleteUser}
          onSubmit={(e) => {
            if (!confirm("Delete this user? This removes their login and cannot be undone.")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="user_id" value={userId} />
          <button type="submit" className="btn-ghost px-3 py-2 text-xs text-rag-red-soft">
            Delete user
          </button>
        </form>
      </div>
    </div>
  );
}
