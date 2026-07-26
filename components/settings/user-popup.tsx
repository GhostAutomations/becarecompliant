"use client";

/**
 * Be Care Compliant — everything you can do to one user, in a popup.
 *
 * Opened by picking a name out of the Active or Passive dropdown. Portals to
 * document.body at z-[200], the standing rule for modals here: rendered inline
 * it would be swallowed by the app shell's stacking context.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TeamMemberControls from "@/components/settings/team-member-controls";

export type BranchOption = { id: string; name: string };

/** One person as the Users screen needs them. Plain data, so a server page can
 *  hand a list straight to the dropdown. */
export type UserListItem = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleLabel: string;
  status: string;
  isSelf: boolean;
  /** You cannot change yourself or another Admin from here. */
  canManage: boolean;
  primaryBranchId: string | null;
  additionalBranchIds: string[];
  branchSummary: string;
};

export default function UserPopup({
  user,
  branches,
  onClose,
}: {
  user: UserListItem;
  branches: BranchOption[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-white">
              {user.fullName || user.email}
              {user.isSelf ? <span className="text-white/40"> (you)</span> : null}
            </h2>
            <p className="truncate text-xs text-white/50">{user.email}</p>
          </div>
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="pill-neutral">{user.roleLabel}</span>
          <span className={user.status === "active" ? "pill-green" : "pill-red"}>
            {user.status}
          </span>
          <span className="text-xs text-white/45">{user.branchSummary}</span>
        </div>

        {user.canManage ? (
          <TeamMemberControls
            userId={user.id}
            userLabel={user.fullName || user.email}
            role={user.role}
            status={user.status}
            primaryBranchId={user.primaryBranchId}
            additionalBranchIds={user.additionalBranchIds}
            branches={branches}
          />
        ) : (
          <p className="text-sm text-white/60">
            {user.isSelf
              ? "This is your own login, so it cannot be changed here. Another Admin can change it for you."
              : "Admins are not editable from this screen. Contact support if an Admin needs changing."}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
