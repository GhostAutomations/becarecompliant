"use client";

import Link from "next/link";
import { canBeLineManager } from "@/lib/people/roles";

import { startTransition, useActionState, useRef, useState } from "react";
import { dbsWarnings } from "@/lib/people/dbs-check";
import DbsWarning from "@/components/people/dbs-warning";
import { createPerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchLite, ProfileLite, BranchStaff, JobTitle } from "@/lib/people/data";
import AlreadyHerePanel, {
  type HistoryBoxView,
  type TrackerBoxView,
} from "@/components/people/already-here-panel";
import { useBranchWord } from "@/components/branches/branch-word";

export default function CreatePersonForm({
  branches,
  users,
  branchStaff,
  jobTitles,
  historyFlag,
  trackerBoxes,
  historyBoxes,
  showScw = false,
}: {
  branches: BranchLite[];
  users: ProfileLite[];
  branchStaff: BranchStaff;
  jobTitles: JobTitle[];
  /** The tick that turns this into "add somebody with a history" (2026-09-21). */
  historyFlag: string;
  trackerBoxes: TrackerBoxView[];
  historyBoxes: HistoryBoxView[];
  /** Welsh companies (CIW): ask for the Social Care Wales registration number (DEF-097). */
  showScw?: boolean;
}) {
  const bw = useBranchWord();
  const [state, formAction, pending] = useActionState(createPerson, IDLE_STATE);
  // One shared rule with the Edit form on the record (lib/people/roles.ts): the two screens
  // offered different people as a line manager until 2026-08-19.
  const managers = users.filter((u) => canBeLineManager(u.role));
  const supervisors = users.filter((u) => u.role === "supervisor");

  /* DBS dates typed into "They already work here" that look wrong ask once (DEF-059). */
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedRef = useRef(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  /* WHAT THEY TYPED SURVIVES A REFUSAL (the DEF-091 rule, found again here 2026-10-01). React 19
     resets a form after an action passed to action={} finishes, error or not, so a refused Add
     person emptied a long form. Every submit now goes through startTransition, which leaves the
     form alone; a success redirects to the new record, so there is nothing to clear. */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (confirmedRef.current) {
      confirmedRef.current = false;
      startTransition(() => formAction(fd));
      return;
    }
    if (fd.get(historyFlag)) {
      const found = dbsWarnings({
        certificateDate: String(fd.get("t_dbs_date") ?? ""),
        renewalDate: String(fd.get("t_enhanced_dbs_date") ?? ""),
        startDate: String(fd.get("start_date") ?? ""),
      });
      if (found.length > 0) {
        setWarnings(found);
        return;
      }
    }
    startTransition(() => formAction(fd));
  }

  const [branchId, setBranchId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);

  function onBranch(id: string) {
    setBranchId(id);
    const staff = branchStaff[id];
    setManagerId(staff?.managers[0]?.id ?? "");
    setSupervisorIds(staff?.supervisors.map((s) => s.id) ?? []);
  }

  function toggleSupervisor(id: string) {
    setSupervisorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onChange={() => setWarnings([])} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="full_name" className="form-label">Full name *</label>
          <input id="full_name" name="full_name" required />
        </div>

        <div>
          <label htmlFor="branch_id" className="form-label">{bw.one} *</label>
          <select id="branch_id" name="branch_id" required value={branchId} onChange={(e) => onBranch(e.target.value)}>
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="job_title" className="form-label">Job title *</label>
          {jobTitles.length === 0 ? (
            <>
              <input id="job_title" name="job_title" required />
              <p className="form-hint">
                Tip: add your company&rsquo;s job titles in Settings, People to get a dropdown here.
              </p>
            </>
          ) : (
            <select id="job_title" name="job_title" required defaultValue="">
              <option value="" disabled>Please choose</option>
              {jobTitles.map((t) => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="start_date" className="form-label">Start date *</label>
          <input id="start_date" name="start_date" type="date" required />
          <p className="form-hint">Checks are scheduled from this date.</p>
        </div>

        <div>
          <label htmlFor="manager_id" className="form-label">
            Line manager{managers.length > 0 ? " *" : ""}
          </label>
          {/*
            A REQUIRED DROPDOWN WITH NOTHING IN IT IS A DEAD END, and this one was reached on the
            first thing a new customer does. Before anybody has accepted their invite there is
            nobody to be a line manager, so the browser refused with its own "Please select an
            item in the list" and there was no way forward and no explanation. The rule stays —
            staff report to somebody — but the screen now says what has to happen first, the way
            Supervisors below already does.
          */}
          {managers.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm text-white/70">
                There is nobody to report to yet. Set your office team up first: invite your
                managers in Settings, Users, and they appear here as soon as they have accepted
                and set a password.
              </p>
              <Link href="/settings/users" className="mt-2 inline-block text-xs text-gold-300 hover:underline">
                Go to Settings, Users
              </Link>
            </div>
          ) : (
            <>
              <select id="manager_id" name="manager_id" required value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="" disabled>Please choose</option>
                {managers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
              <p className="form-hint">Auto filled from the {bw.oneLower}. Change if needed.</p>
            </>
          )}
        </div>

        <div>
          <label htmlFor="work_email" className="form-label">Personal email *</label>
          <input id="work_email" name="work_email" type="email" required />
          {/* Adding a person with an email sends them a Team Member login straight away. This
              is the way to add somebody before you want them looking at it. */}
          <label className="mt-2 flex items-start gap-2 text-xs text-white/70">
            <input type="checkbox" name="hold_email" value="1" className="mt-0.5" />
            <span>
              Don&rsquo;t send their login yet. Send it from Settings, Users when you are ready
            </span>
          </label>
        </div>

        <div>
          <label htmlFor="mobile" className="form-label">Mobile *</label>
          <input id="mobile" name="mobile" required />
        </div>

        {showScw ? (
          <div>
            <label htmlFor="scw_registration_number" className="form-label">Social Care Wales registration number</label>
            <input id="scw_registration_number" name="scw_registration_number" maxLength={20} autoComplete="off" />
            <p className="form-hint">Leave blank if they are not registered yet. The PQS counts anyone 6 months in post without one.</p>
          </div>
        ) : null}
        {showScw ? (
          <div>
            <label htmlFor="scw_renewal_date" className="form-label">Social Care Wales renewal date</label>
            <input id="scw_renewal_date" name="scw_renewal_date" type="date" />
            <p className="form-hint">As shown in SCWonline. It turns amber 90 days before and red once it has passed.</p>
          </div>
        ) : null}

        <div>
          <span className="form-label">Supervisors</span>
          {supervisors.length === 0 ? (
            <p className="text-xs text-white/50">No supervisors in this company yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {supervisors.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    name="supervisor_ids"
                    value={u.id}
                    checked={supervisorIds.includes(u.id)}
                    onChange={() => toggleSupervisor(u.id)}
                  />
                  {u.full_name || u.email}
                </label>
              ))}
            </div>
          )}
          <p className="form-hint">Auto filled from the {bw.oneLower}. Tick or untick as needed.</p>
        </div>
      </div>

      {/* Everything above is who they are. This is what they have already done, and it is the
          last thing on the form because most adds are new starters and never open it. */}
      <AlreadyHerePanel
        flagName={historyFlag}
        trackerBoxes={trackerBoxes}
        historyBoxes={historyBoxes}
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}
      <DbsWarning
        warnings={warnings}
        onConfirm={() => {
          confirmedRef.current = true;
          setWarnings([]);
          formRef.current?.requestSubmit();
        }}
        onBack={() => setWarnings([])}
      />

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}
