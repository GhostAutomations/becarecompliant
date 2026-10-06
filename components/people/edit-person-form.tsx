"use client";

import ScwDates from "@/components/people/scw-dates";
import { startTransition, useActionState, useEffect, useState } from "react";
import { updatePerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { PersonRecord } from "@/lib/people/types";
import type { ProfileLite as UserLite, JobTitle } from "@/lib/people/data";
import { canBeLineManager } from "@/lib/people/roles";

export default function EditPersonForm({
  person,
  users,
  jobTitles,
  showScw = false,
}: {
  person: PersonRecord;
  users: UserLite[];
  jobTitles: JobTitle[];
  /** Welsh companies (CIW): the Social Care Wales registration number (DEF-097). */
  showScw?: boolean;
}) {
  // One shared rule with Add a person (lib/people/roles.ts).
  const eligible = users.filter((u) => canBeLineManager(u.role));
  const [state, formAction, pending] = useActionState(updatePerson, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  /*
   * UNSAVED CHANGES, SAID OUT LOUD (Phil, 2026-09-16). This form shares the Manage record
   * panel with two others, each with its own save. Changing the job title here and pressing
   * one of THOSE saves writes their field and throws this one away without a word: the audit
   * log recorded four working status saves in a row from somebody trying to change a job
   * title who reported that nothing was happening. Nothing can stop a person pressing the
   * wrong button, but a form that has been edited and not saved should say so.
   */
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      setDirty(false);
    }
  }, [state, pending, flash]);

  return (
    <form
      /* Through startTransition, not action={} (the DEF-091 rule, 2026-10-01): React 19 resets
         a form after an action={} finishes, error or not, so a refused save threw away every
         change on the form. */
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-5"
      onChange={() => {
        reset();
        setDirty(true);
      }}
    >
      <input type="hidden" name="person_id" value={person.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e_full_name" className="form-label">Full name *</label>
          <input id="e_full_name" name="full_name" required defaultValue={person.full_name} />
        </div>
        <div>
          <label htmlFor="e_job_title" className="form-label">Job title</label>
          {/*
            THE SAME DROPDOWN AS ADD A PERSON. Correcting a job title on the record was a
            free text box while setting it in the first place was a list, so a title typed
            here ("Care worker", "Senior Carer ") quietly stopped matching the company's own
            list, and checksForTitle scopes a person's checks BY TITLE.

            THE STORED VALUE IS ALWAYS AN OPTION, for the same reason it is on the line
            manager below: a select whose value is not among its options falls back to the
            first one, and Save would then rewrite a title nobody touched. A title that has
            since been removed from Settings is kept and marked, rather than silently
            becoming somebody else's job.
          */}
          {jobTitles.length === 0 ? (
            <>
              <input id="e_job_title" name="job_title" defaultValue={person.job_title ?? ""} />
              <p className="form-hint">
                Tip: add your company&rsquo;s job titles in Settings, People to get a dropdown here.
              </p>
            </>
          ) : (
            <select id="e_job_title" name="job_title" defaultValue={person.job_title ?? ""}>
              <option value="">Not set</option>
              {jobTitles.map((t) => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))}
              {person.job_title && !jobTitles.some((t) => t.title === person.job_title) ? (
                <option value={person.job_title}>{person.job_title} (not in your list)</option>
              ) : null}
            </select>
          )}
        </div>
        <div>
          <label htmlFor="e_start_date" className="form-label">Start date</label>
          <input id="e_start_date" name="start_date" type="date" defaultValue={person.start_date ?? ""} />
        </div>
        <div>
          <label htmlFor="e_work_email" className="form-label">Personal email</label>
          <input id="e_work_email" name="work_email" type="email" defaultValue={person.work_email ?? ""} />
        </div>
        <div>
          <label htmlFor="e_mobile" className="form-label">Mobile</label>
          <input id="e_mobile" name="mobile" defaultValue={person.mobile ?? ""} />
        </div>
        {/* Printed under the date on letters to them, such as a meeting invitation (0408). */}
        <div className="sm:col-span-2">
          <label htmlFor="e_home_address" className="form-label">Home address</label>
          <textarea
            id="e_home_address"
            name="home_address"
            rows={3}
            maxLength={400}
            defaultValue={person.home_address ?? ""}
            placeholder={"Flat 2, 60 Liscombe Street\nNewport\nNP19 0HQ"}
          />
          <p className="form-hint">One line per row, as it goes on an envelope. Printed on letters to them.</p>
        </div>
        {showScw ? (
          <div>
            <label htmlFor="e_scw" className="form-label">Social Care Wales registration number</label>
            <input id="e_scw" name="scw_registration_number" maxLength={20} autoComplete="off" defaultValue={person.scw_registration_number ?? ""} />
            <p className="form-hint">Leave blank if they are not registered yet. The PQS counts anyone 6 months in post without one.</p>
          </div>
        ) : null}
        {showScw ? <ScwDates idPrefix="e_scw_dates" defaultIssue={person.scw_registered_on ?? null} defaultRenewal={person.scw_renewal_date ?? null} /> : null}
        <div>
          <label htmlFor="e_manager_id" className="form-label">Line manager</label>
          {/*
            THE STORED VALUE IS ALWAYS AN OPTION, even when it is not in the list.
            A <select> whose value is not among its options silently falls back to the first one,
            which here is "None", and Save then writes manager_id = null. That is how a Manager
            opening a colleague's record and changing a phone number wiped their line manager.
            The list itself was the bigger half of the bug (fixed 2026-08-16, it returned only the
            viewer), but a line manager who has since LEFT the company is still not in it, and
            leaving is not a reason to lose the record of who managed somebody.
          */}
          <select id="e_manager_id" name="manager_id" defaultValue={person.manager_id ?? ""}>
            <option value="">None</option>
            {/* Checked against the FILTERED list, not the raw one. Narrowing who may be a line
                manager (the RI came out on 2026-08-19) would otherwise drop somebody's existing
                manager off the options — and this select's whole history is that a value missing
                from the options silently saves as None. */}
            {person.manager_id && !eligible.some((u) => u.id === person.manager_id) ? (
              <option value={person.manager_id}>Current line manager (no longer listed)</option>
            ) : null}
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`btn ${saved ? "btn-saved" : "btn-primary"}`}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save details"}
        </button>
        {dirty && !pending && !saved ? (
          <span className="pill-amber">Unsaved changes</span>
        ) : null}
      </div>
      {/* What happened to their login when the email changed (Lauren Morgan, 2026-10-05). */}
      {!dirty && !pending && state.ok && state.ok !== "Saved." ? (
        <p role="status" className="text-xs text-emerald-300">{state.ok.replace(/^Saved\.\s*/, "")}</p>
      ) : null}
    </form>
  );
}
