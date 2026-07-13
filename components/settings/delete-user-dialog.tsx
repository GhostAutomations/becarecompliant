"use client";

/**
 * Be Care Compliant — delete user confirmation dialog (Phase 8).
 * Replaces the old native window.confirm (which blocks browser automation and
 * cannot be styled or tested) with the app's standard modal. The dialog remounts
 * each time it opens (a fresh key), stays open with a working "Deleting" state,
 * and closes on success. Follows the save button rules: disabled while pending,
 * visible inline error, and the action checks its own outcome so nothing fails
 * silently.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { deleteUser } from "@/app/(app)/settings/actions";

function DeleteDialog({
  userId,
  userLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteUser, IDLE_STATE);

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Delete user</h2>
        <p className="mt-2 text-sm text-white/60">
          This permanently removes {userLabel} and their login, along with their branch access and
          caseload assignments. This cannot be undone.
        </p>
        <form action={formAction} className="mt-5 flex items-center gap-3">
          <input type="hidden" name="user_id" value={userId} />
          <button
            type="submit"
            disabled={pending}
            className="btn h-[42px] rounded-xl border border-rag-red/40 px-4 text-sm text-rag-red-soft hover:bg-rag-red/10"
          >
            {pending ? "Deleting…" : "Delete user"}
          </button>
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost px-3 py-2 text-sm">
            Cancel
          </button>
          {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
        </form>
      </div>
    </div>
  );
}

export default function DeleteUserDialog({
  userId,
  userLabel,
}: {
  userId: string;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-outline h-[42px] border-rag-red/40 text-xs text-rag-red-soft hover:bg-rag-red/10"
      >
        Delete user
      </button>
      {open ? (
        <DeleteDialog key={userId + Date.now()} userId={userId} userLabel={userLabel} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
