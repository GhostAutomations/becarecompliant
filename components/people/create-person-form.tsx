"use client";

import Link from "next/link";
import { canBeLineManager } from "@/lib/people/roles";

import { useActionState, useState } from "react";
import { createPerson } from "@/lib/people/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { BranchLite, ProfileLite, BranchStaff, JobTitle } from "@/lib/people/data";

export default function CreatePersonForm({
  branches,
  users,
  branchStaff,
  jobTitles,
}: {
  branches: BranchLite[];
  users: ProfileLite[];
  branchStaff: BranchStaff;
  jobTitles: JobTitle[];
}) {
  const [state, formAction, pending] = useActionState(createPerson, IDLE_STATE);
  // One shared rule with the Edit form on the record (lib/people/roles.ts): the two screens
  // offered different people as a line manager until 2026-08-19.
  const managers = users.filter((u) => canBeLineManager(u.role));
  const supervisors = users.filter((u) => u.role === "supervisor");

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
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="full_name" className="form-label">Full name *</label>
          <input id="full_name" name="full_name" required />
        </div>

        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
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
              <p className="form-hint">Auto filled from the branch. Change if needed.</p>
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
              Don&rsquo;t send their login yet — send it from Settings, Users when you are ready
            </span>
          </label>
        </div>

        <div>
          <label htmlFor="mobile" className="form-label">Mobile *</label>
          <input id="mobile" name="mobile" required />
        </div>

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
          <p className="form-hint">Auto filled from the branch. Tick or untick as needed.</p>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}
