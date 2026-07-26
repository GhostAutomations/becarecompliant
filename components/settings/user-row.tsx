"use client";

/**
 * Be Care Compliant — one user in the list, and the popup behind them.
 *
 * The list is deliberately down to a NAME and an EMAIL (Phil, 2026-07-26): with
 * Team Member logins arriving, a screen of tall tiles was unreadable. Clicking a
 * name opens everything you can do to that person.
 *
 * The popup portals to document.body at z-[200], the standing rule for modals in
 * this app: rendered inline it would be swallowed by the app shell's stacking
 * context.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TeamMemberControls from "@/components/settings/team-member-controls";

type Branch = { id: string; name: string };

export default function UserRow({
  userId,
  fullName,
  email,
  role,
  roleLabel,
  status,
  isSelf,
  canManage,
  primaryBranchId,
  additionalBranchIds,
  branchSummary,
  branches,
}: {
  userId: string;
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
  branches: Branch[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-card flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.07]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">
            {fullName || email}
            {isSelf ? <span className="text-white/40"> (you)</span> : null}
          </span>
          <span className="block truncate text-xs text-white/45">{email}</span>
        </span>
        {status !== "active" ? <span className="pill-red shrink-0">{status}</span> : null}
      </button>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-white">
                      {fullName || email}
                    </h2>
                    <p className="truncate text-xs text-white/50">{email}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-sm"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="pill-neutral">{roleLabel}</span>
                  <span className={status === "active" ? "pill-green" : "pill-red"}>{status}</span>
                  <span className="text-xs text-white/45">{branchSummary}</span>
                </div>

                {canManage ? (
                  <TeamMemberControls
                    userId={userId}
                    userLabel={fullName || email}
                    role={role}
                    status={status}
                    primaryBranchId={primaryBranchId}
                    additionalBranchIds={additionalBranchIds}
                    branches={branches}
                  />
                ) : (
                  <p className="text-sm text-white/60">
                    {isSelf
                      ? "This is your own login, so it cannot be changed here. Another Admin can change it for you."
                      : "Admins are not editable from this screen. Contact support if an Admin needs changing."}
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
