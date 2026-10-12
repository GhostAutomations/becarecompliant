"use client";

/**
 * Be Care Compliant: a login's job title, printed under their name when they sign or hold a letter
 * (Phil, 2026-10-12, 0447, docs/decisions/letter-editor-whole-page.md). Set by an Admin in the user
 * popup on Settings, Users, for every login, their own included: like the name, it is not a
 * permission. Blank means the name alone. The save follows the standing rule, and a refused save
 * keeps what was typed.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setLoginJobTitle } from "@/app/(app)/settings/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { JOB_TITLE_MAX } from "@/lib/users/login-name";

export default function LoginJobTitleForm({ userId, jobTitle }: { userId: string; jobTitle: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setLoginJobTitle, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      router.refresh();
    }
  }, [state, pending, flash, router]);

  return (
    <form onSubmit={submitKeepingTyped(formAction)} onChange={reset} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <div>
        <label htmlFor={`job-${userId}`} className="form-label">Job title on letters</label>
        <input
          id={`job-${userId}`}
          name="job_title"
          type="text"
          defaultValue={jobTitle ?? ""}
          maxLength={JOB_TITLE_MAX}
          placeholder="For example Registered Manager"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-white/50">
          Printed under their name when they sign or hold a letter. Leave it blank for the name alone.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
          {pending ? "Saving…" : saved ? "Saved" : "Save job title"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
        {saved && state.ok && state.ok !== "Saved" ? <span className="text-xs text-white/60">{state.ok}</span> : null}
      </div>
    </form>
  );
}
