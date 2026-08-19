"use client";

/**
 * Be Care Compliant — the delete-a-company controls (Founder console).
 *
 * The typed company name IS the confirmation. There is no second "are you sure?" dialog on
 * top of it on purpose: a dialog is dismissed by reflex, whereas typing "Acme Care Company"
 * cannot be done by accident, and it makes you look at which company you are on.
 *
 * The button stays disabled until what you typed matches. The server checks it again
 * (lib/companies/deletion.ts) — this half is only so the screen tells you before you press.
 */

import { useActionState, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { deletionWarning, daysUntilPurge, GRACE_DAYS } from "@/lib/companies/deletion";
import {
  deleteCompany,
  restoreCompanyAction,
  purgeCompanyNow,
} from "@/app/(app)/founder/actions";
import ActionForm from "@/components/action-form";

function matches(typed: string, name: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed) === norm(name) && name.trim().length > 0;
}

export function DeleteCompanyPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [state, action, pending] = useActionState(deleteCompany, IDLE_STATE);
  const [typed, setTyped] = useState("");
  const ready = matches(typed, companyName);

  return (
    <section
      aria-label="Delete this company"
      className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-5"
    >
      <h2 className="text-sm font-semibold text-red-200">Delete this company</h2>
      <p className="mt-2 text-sm text-white/70">{deletionWarning(companyName, GRACE_DAYS)}</p>

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="company_id" value={companyId} />
        <label className="block text-xs text-white/60" htmlFor="confirm_name">
          Type <span className="font-semibold text-white/80">{companyName}</span> to confirm
        </label>
        <input
          id="confirm_name"
          name="confirm_name"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full max-w-sm"
          placeholder={companyName}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !ready}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            {pending ? "Deleting…" : "Delete this company"}
          </button>
          {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
          {state.ok ? <span className="text-xs text-green-300">{state.ok}</span> : null}
        </div>
      </form>
    </section>
  );
}

/** Shown instead of the panel above once a company is deleted and waiting to be purged. */
export function DeletedCompanyPanel({
  companyId,
  companyName,
  purgeAfter,
}: {
  companyId: string;
  companyName: string;
  purgeAfter: string | null;
}) {
  const left = daysUntilPurge(purgeAfter, new Date().toISOString());
  const on = purgeAfter
    ? new Date(purgeAfter).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      })
    : null;

  return (
    <section
      aria-label="Deleted company"
      className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-5"
    >
      <h2 className="text-sm font-semibold text-red-200">This company is deleted</h2>
      <p className="mt-2 text-sm text-white/70">
        Nobody at {companyName} can sign in, and their subscription was cancelled when they were
        deleted.{" "}
        {on
          ? `Everything they hold is erased for good on ${on} (${left} day${left === 1 ? "" : "s"} away).`
          : "Everything they hold is erased once the grace period runs out."}{" "}
        Restoring them brings the records back; it does not bring the subscription back.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ActionForm
          action={restoreCompanyAction}
          hidden={{ company_id: companyId }}
          label="Restore"
          savingLabel="Restoring…"
          savedLabel="Restored"
          buttonClassName="btn-outline px-3 py-2 text-xs"
          className=""
        />
        <ActionForm
          action={purgeCompanyNow}
          hidden={{ company_id: companyId }}
          label="Purge now"
          savingLabel="Erasing…"
          savedLabel="Erased"
          buttonClassName="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white"
          className=""
          confirm={`Erase ${companyName} now, without waiting out the grace period? Their records, files, logins and audit trail go for good. Only the record that the deletion happened will remain.`}
        />
      </div>
    </section>
  );
}
