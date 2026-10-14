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
import TeamMemberControls, { type RoleOption } from "@/components/settings/team-member-controls";
import LoginNameForm from "@/components/settings/login-name-form";
import LoginJobTitleForm from "@/components/settings/login-job-title-form";
import OfficeMatrixForm from "@/components/settings/office-matrix-form";

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
  /** What the status reads as. "invited" means two different things: an invite that went out
   *  and one the import held back that nobody was ever emailed (Phil, 2026-09-29: "I don't
   *  believe they have all been invited"). Falls back to the raw status. */
  statusLabel?: string;
  statusTone?: "green" | "amber" | "neutral" | "red";
  isSelf: boolean;
  /** You cannot change yourself or another Admin from here. */
  canManage: boolean;
  primaryBranchId: string | null;
  additionalBranchIds: string[];
  branchSummary: string;
  /** The linked People record's name, or null when this login has none (people.profile_id). */
  personName: string | null;
  /** The job title printed under their name on letters (0447), or null. */
  jobTitle: string | null;
  /** "Show on Office matrix" (0468): ticked now, and why it cannot be ticked (null when it can). */
  office: { ticked: boolean; blocked: string | null };
};

export default function UserPopup({
  user,
  branches,
  roleOptions,
  onClose,
}: {
  user: UserListItem;
  branches: BranchOption[];
  roleOptions: RoleOption[];
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
          <span
            className={
              { green: "pill-green", amber: "pill-amber", neutral: "pill pill-neutral", red: "pill-red" }[
                user.statusTone ?? (user.status === "active" ? "green" : "red")
              ]
            }
          >
            {user.statusLabel ?? user.status}
          </span>
          <span className="text-xs text-white/45">{user.branchSummary}</span>
        </div>

        {/* The name can be corrected for every login, other Admins and your own included
            (Phil, 2026-10-12): it is not a permission, so it sits outside the role lock below. */}
        <div className="mb-5 border-b border-white/10 pb-5">
          <LoginNameForm key={user.id} userId={user.id} fullName={user.fullName} personName={user.personName} />
          {/* The job title under their name on letters (Phil, 2026-10-12): set here by an Admin. */}
          <div className="mt-4">
            <LoginJobTitleForm key={`job-${user.id}`} userId={user.id} jobTitle={user.jobTitle} />
          </div>
          {/* The Office matrix (Phil, 2026-10-14): Lead the Leader in place of supervisions. */}
          <div className="mt-4">
            <OfficeMatrixForm
              key={`office-${user.id}-${user.office.ticked}`}
              userId={user.id}
              ticked={user.office.ticked}
              blocked={user.office.blocked}
            />
          </div>
        </div>

        {user.canManage ? (
          <TeamMemberControls
            roleOptions={roleOptions}
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
              ? "Your role and status cannot be changed here. Another Admin can change them for you."
              : "An Admin's role and status are not editable from this screen. Contact support if they need changing."}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
