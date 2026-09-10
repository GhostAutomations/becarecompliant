"use client";

/**
 * Be Care Compliant — offering a changed library form to the companies that hold it.
 *
 * Phil, 2026-09-10: "nothing reaches a customer without you seeing the list." So the list
 * is the screen, and it says the same four things about every company whether or not they
 * can be sent to. A company that has made the form their own is NOT hidden — it is shown,
 * with a tick box that cannot be ticked, because "why did Bevan not get it?" is the
 * question this page exists to answer.
 */

import { useActionState, useState } from "react";
import { pushLibraryForm } from "@/lib/forms/library-push-actions";
import { IDLE_STATE } from "@/lib/forms";
import type { CompanyFormState } from "@/lib/forms/library-push";

const STATE_COPY: Record<
  CompanyFormState["state"],
  { label: string; tone: string; why: string }
> = {
  behind: {
    label: "Ready to send",
    tone: "text-rag-green-soft",
    why: "Untouched since we gave it to them.",
  },
  up_to_date: {
    label: "Already has it",
    tone: "text-white/45",
    why: "Their copy already matches the library.",
  },
  edited: {
    label: "Edited by them",
    tone: "text-gold-300",
    why: "They have changed this form. A push would throw that away, so it is never sent.",
  },
  unknown: {
    label: "Cannot tell",
    tone: "text-gold-300",
    why: "No record of what they were handed, so we cannot prove the copy is untouched. Left alone.",
  },
};

export default function LibraryPush({
  templateKey,
  libraryVersion,
  companies,
}: {
  templateKey: string;
  libraryVersion: number;
  companies: CompanyFormState[];
}) {
  const sendable = companies.filter((c) => c.state === "behind");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(sendable.map((c) => c.formId)));
  const [state, formAction, pending] = useActionState(pushLibraryForm, IDLE_STATE);

  function toggle(formId: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      return next;
    });
  }

  if (companies.length === 0) {
    return (
      <p className="text-sm text-white/55">
        No company holds a copy of this form yet, so there is nobody to send it to.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="template_key" value={templateKey} />

      <div className="space-y-2">
        {companies.map((c) => {
          const copy = STATE_COPY[c.state];
          const canSend = c.state === "behind";
          return (
            <label
              key={c.formId}
              className={`flex items-start gap-3 rounded-xl border border-white/10 px-4 py-3 ${
                canSend ? "cursor-pointer hover:bg-white/5" : "opacity-70"
              }`}
            >
              <input
                type="checkbox"
                name="form_ids"
                value={c.formId}
                checked={canSend && chosen.has(c.formId)}
                onChange={() => canSend && toggle(c.formId)}
                disabled={!canSend}
                className="mt-1 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-medium text-white/85">{c.companyName}</span>
                  <span className={`text-xs font-semibold ${copy.tone}`}>{copy.label}</span>
                </span>
                <span className="mt-0.5 block text-xs text-white/45">{copy.why}</span>
                <span className="mt-1 block text-xs text-white/35">
                  {`Their version ${c.currentVersion ?? 1}`}
                  {c.libraryVersion ? ` · from library version ${c.libraryVersion}` : ""}
                  {c.evidenceCount > 0
                    ? ` · ${c.evidenceCount} record${c.evidenceCount === 1 ? "" : "s"} already on it`
                    : " · nothing recorded on it yet"}
                  {c.hasOpenDraft ? " · they have a draft open" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* Said plainly, because it is the thing a founder needs to be sure of before
          pressing a button that reaches other people's companies. */}
      <p className="form-hint">
        Sending publishes a new version of the form for each company chosen. Their current
        version is kept exactly as it is, so every record already completed still shows the
        questions that were actually asked. Their own branches and staff lists are put back
        into the new version.
      </p>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-rag-green-soft">{state.ok}</p> : null}

      <button
        type="submit"
        className="btn-primary"
        disabled={pending || chosen.size === 0 || sendable.length === 0}
      >
        {pending
          ? "Sending…"
          : sendable.length === 0
            ? "Nothing to send"
            : `Send version ${libraryVersion} to ${chosen.size} ${chosen.size === 1 ? "company" : "companies"}`}
      </button>
    </form>
  );
}
