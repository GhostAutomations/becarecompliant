"use client";

import ScwDates from "@/components/people/scw-dates";
import Link from "next/link";
import { canBeLineManager } from "@/lib/people/roles";

import { startTransition, useActionState, useRef, useState } from "react";
import { dbsWarnings, followDbsRenewal } from "@/lib/people/dbs-check";
import FormRenderer from "@/components/forms/form-renderer";
import type { AnswerValue, Answers, FormSchema } from "@/lib/form-schema";
import { validateAnswers, type FieldError } from "@/lib/form-validate";
import { describeValidationErrors } from "@/lib/forms/validation-message";
import { focusFirstError } from "@/components/forms/focus-first-error";
import { NO_DBS_FIELD, NO_DBS_LABEL, hasAnyAnswer } from "@/lib/people/add-person-docs";
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
  canOpenSettings = true,
  dbsSchema = null,
  rtwSchema = null,
  supportMode = false,
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
  /** Can this person open Settings? If not, the empty line manager box asks them to tell an Admin. */
  canOpenSettings?: boolean;
  /** The company's own DBS and Right to Work forms, the ones behind Complete on the record's cards
   *  (Phil, 2026-10-15). Filled in here, saved through the same code as on the record. */
  dbsSchema?: FormSchema | null;
  rtwSchema?: FormSchema | null;
  /** Founder in support mode: Evidence cannot be signed, so the sections are a note (DEF-006). */
  supportMode?: boolean;
}) {
  const bw = useBranchWord();
  const [state, formAction, pending] = useActionState(createPerson, IDLE_STATE);
  // One shared rule with the Edit form on the record (lib/people/roles.ts): the two screens
  // offered different people as a line manager until 2026-08-19.
  const managers = users.filter((u) => canBeLineManager(u.role));
  const supervisors = users.filter((u) => u.role === "supervisor");

  /* DBS dates that look wrong ask once (DEF-059), now from the DBS section. */
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedRef = useRef(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  /* DBS AND RIGHT TO WORK (Phil, 2026-10-15). The company's own two forms, drawn by the same
     renderer as on the record. DBS is one or the other: the details, or the "No DBS yet" tick,
     which clears and hides the details. Right to Work is required (Phil's popup). One token per
     form, so pressing Add person twice can only ever make one person (0485). */
  const showDocs = !supportMode && !!dbsSchema && !!rtwSchema;
  const [token] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "",
  );
  const [noDbs, setNoDbs] = useState(false);
  const [dbsAnswers, setDbsAnswers] = useState<Answers>({});
  const [dbsFiles, setDbsFiles] = useState<Record<string, File | null>>({});
  const [dbsVersion, setDbsVersion] = useState(0);
  const [dbsErrors, setDbsErrors] = useState<FieldError[]>([]);
  const [dbsProblem, setDbsProblem] = useState<string | null>(null);
  const [rtwAnswersState, setRtwAnswers] = useState<Answers>({});
  const [rtwFiles, setRtwFiles] = useState<Record<string, File | null>>({});
  const [rtwErrors, setRtwErrors] = useState<FieldError[]>([]);
  const [rtwProblem, setRtwProblem] = useState<string | null>(null);
  // Enhanced DBS follows the date of issue, exactly as on the record's DBS form.
  const deriveDbs = (prev: Answers, key: string, value: AnswerValue): Answers => {
    const next: Answers = { ...prev, [key]: value };
    if (key !== "dbs_date") return next;
    const str = (v: AnswerValue | undefined) => (typeof v === "string" ? v : "");
    next.enhanced_dbs_date = followDbsRenewal(str(prev.dbs_date), str(prev.enhanced_dbs_date), str(value));
    return next;
  };

  /** Check the two sections as the server will. True when they are fine to send. */
  function docsReady(): boolean {
    if (!showDocs) return true;
    let ok = true;
    if (noDbs) {
      setDbsErrors([]);
      setDbsProblem(null);
    } else if (!hasAnyAnswer(dbsAnswers)) {
      setDbsErrors([]);
      setDbsProblem(`Fill in the DBS details, or tick "${NO_DBS_LABEL}".`);
      ok = false;
    } else {
      const r = validateAnswers(dbsSchema!, dbsAnswers);
      setDbsErrors(r.ok ? [] : r.errors);
      setDbsProblem(r.ok ? null : `DBS: ${describeValidationErrors(dbsSchema!, r.errors)}`);
      if (!r.ok) {
        focusFirstError(r.errors);
        ok = false;
      }
    }
    const rr = validateAnswers(rtwSchema!, rtwAnswersState);
    setRtwErrors(rr.ok ? [] : rr.errors);
    setRtwProblem(rr.ok ? null : `Right to Work: ${describeValidationErrors(rtwSchema!, rr.errors)}`);
    if (!rr.ok) {
      if (ok) focusFirstError(rr.errors);
      ok = false;
    }
    return ok;
  }

  /** The two sections onto the form being sent. */
  function withDocs(fd: FormData): FormData {
    if (token) fd.set("create_token", token);
    if (!showDocs) return fd;
    if (noDbs) {
      fd.set(NO_DBS_FIELD, "1");
    } else {
      fd.set("dbs_answers", JSON.stringify(dbsAnswers));
      for (const [key, file] of Object.entries(dbsFiles)) if (file) fd.append(`dbs_file:${key}`, file);
    }
    fd.set("rtw_answers", JSON.stringify(rtwAnswersState));
    for (const [key, file] of Object.entries(rtwFiles)) if (file) fd.append(`rtw_file:${key}`, file);
    return fd;
  }

  /* WHAT THEY TYPED SURVIVES A REFUSAL (the DEF-091 rule, found again here 2026-10-01). React 19
     resets a form after an action passed to action={} finishes, error or not, so a refused Add
     person emptied a long form. Every submit now goes through startTransition, which leaves the
     form alone; a success redirects to the new record, so there is nothing to clear. */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // A second press while the first is still saving sends nothing more.
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    if (!docsReady()) return;
    if (confirmedRef.current) {
      confirmedRef.current = false;
      startTransition(() => formAction(withDocs(fd)));
      return;
    }
    if (showDocs && !noDbs) {
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const found = dbsWarnings({
        certificateDate: str(dbsAnswers.dbs_date),
        renewalDate: str(dbsAnswers.enhanced_dbs_date),
        startDate: String(fd.get("start_date") ?? ""),
      });
      if (found.length > 0) {
        setWarnings(found);
        return;
      }
    }
    startTransition(() => formAction(withDocs(fd)));
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
              {canOpenSettings ? (
                <>
                  <p className="text-sm text-white/70">
                    There is nobody to report to yet. Set your office team up first: invite your
                    managers in Settings, Users, and they appear here as soon as they have accepted
                    and set a password.
                  </p>
                  <Link href="/settings/users" className="mt-2 inline-block text-xs text-gold-300 hover:underline">
                    Go to Settings, Users
                  </Link>
                </>
              ) : (
                <p className="text-sm text-white/70">
                  There is nobody to report to yet. Managers appear here once an Admin has invited
                  them and they have set a password. You can add this person now and choose their
                  line manager later.
                </p>
              )}
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
        {showScw ? <ScwDates idPrefix="add_scw" /> : null}

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

      {/* DBS AND RIGHT TO WORK (Phil, 2026-10-15): the company's own forms, the same questions as
          Complete on the record's cards, saved as Evidence the same way. */}
      {supportMode ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
          DBS and Right to Work are completed from their record by someone at the company. In
          support mode they cannot be saved here, because Evidence is always signed by the company.
        </div>
      ) : showDocs ? (
        <>
          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">DBS *</h3>
              <p className="text-xs text-white/50">
                Enter their DBS certificate, or tick the box if they do not have one yet.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm text-white/85">
              <input
                type="checkbox"
                checked={noDbs}
                onChange={(e) => {
                  setNoDbs(e.target.checked);
                  setDbsProblem(null);
                  setDbsErrors([]);
                  if (e.target.checked) {
                    // Not both: ticking it clears whatever was typed in the details.
                    setDbsAnswers({});
                    setDbsFiles({});
                    setDbsVersion((v) => v + 1);
                  }
                }}
                className="mt-1"
              />
              <span>
                {NO_DBS_LABEL}
                <span className="block text-xs text-white/50">
                  Once they are added, you and their line manager are emailed a link to their DBS
                  Pending Risk Assessment.
                </span>
              </span>
            </label>
            {noDbs ? null : (
              <FormRenderer
                key={`dbs-${dbsVersion}`}
                schema={dbsSchema!}
                idPrefix="add_dbs"
                errors={dbsErrors}
                derive={deriveDbs}
                onChange={(next) => {
                  setDbsAnswers(next);
                  setDbsProblem(null);
                  setWarnings([]);
                }}
                onFileSelect={(key, file) => setDbsFiles((prev) => ({ ...prev, [key]: file }))}
              />
            )}
            {dbsProblem ? <p className="form-error">{dbsProblem}</p> : null}
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Right to Work *</h3>
              <p className="text-xs text-white/50">
                For a British or Irish citizen, or someone with settled status, choose that basis:
                there is no expiry date to enter.
              </p>
            </div>
            <FormRenderer
              schema={rtwSchema!}
              idPrefix="add_rtw"
              errors={rtwErrors}
              onChange={(next) => {
                setRtwAnswers(next);
                setRtwProblem(null);
              }}
              onFileSelect={(key, file) => setRtwFiles((prev) => ({ ...prev, [key]: file }))}
            />
            {rtwProblem ? <p className="form-error">{rtwProblem}</p> : null}
          </section>
        </>
      ) : null}

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
