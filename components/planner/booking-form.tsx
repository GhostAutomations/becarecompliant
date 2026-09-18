"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createBooking, updateBooking } from "@/lib/planner/actions";
import TimeSelect from "./time-select";
import type { PlannerFormData, PlannerSubject } from "@/lib/planner/data";
import { mayConductInBranch } from "@/lib/auth/manage-scope";

/** ISO date -> DD/MM/YYYY for display. */
function fmtDue(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}



/** An existing booking being edited. */
export type EditableBooking = {
  id: string;
  population: "people" | "service_users" | null;
  subjectId: string | null;
  conductorId: string;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  /** The jobs already on it: a check instance id, or "tracker:<key>". */
  taskTargets: string[];
};

/** A booking as the edit panel needs it. One place builds this, so every screen that
 *  offers Edit opens the same panel filled in the same way. */
export function toEditableBooking(b: {
  id: string;
  population: "people" | "service_users" | null;
  subjectId: string | null;
  conductorId: string;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  tasks: Array<{ checkInstanceId: string | null; trackerFormKey: string | null }>;
}): EditableBooking {
  return {
    id: b.id,
    population: b.population,
    subjectId: b.subjectId,
    conductorId: b.conductorId,
    scheduledDate: b.scheduledDate,
    startTime: b.startTime,
    durationMinutes: b.durationMinutes,
    notes: b.notes,
    taskTargets: b.tasks
      .map((t) => t.checkInstanceId ?? (t.trackerFormKey ? `tracker:${t.trackerFormKey}` : ""))
      .filter(Boolean),
  };
}

/**
 * Book a visit. Pick the department, branch and name (or, on a record page, that record is
 * fixed), then WHICH JOBS are being done, who carries them out and when. The checks define
 * what the work is, so there is no free-text title.
 *
 * SEVERAL JOBS, ONE VISIT (Phil, 2026-09-18: "if they are at a house they may want to
 * complete 2 or 3 tasks in one visit"). The checks are ticked, not chosen one at a time, and
 * the visit is one appointment carrying all of them.
 *
 * The same panel EDITS one. Everything is changeable -- including who it is for, because a
 * visit put against the wrong name should be corrected, not cancelled and retyped. A job
 * already completed keeps its status; the server only adds and removes.
 */
export default function BookingForm({
  data,
  currentUserId,
  preset,
  booking,
  buttonLabel = "New booking",
  buttonClassName = "btn-primary text-xs",
}: {
  data: PlannerFormData;
  /** Default conductor (the logged-in user). */
  currentUserId: string;
  /** When opened from a record, lock the subject to that record. */
  preset?: { population: "people" | "service_users"; id: string; name: string; branchId: string | null; checks: PlannerSubject["checks"] };
  /** Editing an existing booking rather than making a new one. */
  booking?: EditableBooking;
  buttonLabel?: string;
  /** The trigger's classes. Defaults to what every other caller already had. */
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);

  /* Clicking away closes it. The panel is rendered into the body (see below), so it is
     not inside `ref` and has to be excluded by name or its own clicks would close it. */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const editing = !!booking;
  const [department, setDepartment] = useState<"" | "people" | "service_users">(
    booking?.population ?? (preset ? preset.population : ""),
  );
  const [branchId, setBranchId] = useState(preset?.branchId ?? "");
  const [subjectId, setSubjectId] = useState(booking?.subjectId ?? (preset ? preset.id : ""));
  /* The ticked jobs. A check is its instance id; a tracker form has no instance, so it is
     "tracker:<key>" and the action pulls the key back off it. */
  const [checkTargets, setCheckTargets] = useState<string[]>(booking?.taskTargets ?? []);

  function toggleTarget(value: string) {
    setCheckTargets((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  /** The branch of whoever the task is for. From the preset on a record page, or the picker. */
  const subjectBranchId = preset
    ? preset.branchId
    : data.subjects.find((s) => s.population === department && s.id === subjectId)?.branchId ?? null;

  const mayConductSelf = mayConductInBranch({
    role: data.viewerRole,
    branchIds: data.myBranchIds,
    recordBranchId: subjectBranchId,
  });

  const conductorOptions = useMemo(
    () => (mayConductSelf ? data.conductors : data.conductors.filter((c) => c.id !== data.viewerId)),
    [mayConductSelf, data.conductors, data.viewerId],
  );

  const deptSubjects = useMemo(
    () => (department ? data.subjects.filter((s) => s.population === department) : []),
    [data.subjects, department],
  );
  const branchOptions = useMemo(() => {
    const ids = new Set(deptSubjects.map((s) => s.branchId).filter(Boolean));
    return data.branches.filter((b) => ids.has(b.id));
  }, [deptSubjects, data.branches]);
  const nameOptions = useMemo(
    () => deptSubjects.filter((s) => !branchId || s.branchId === branchId),
    [deptSubjects, branchId],
  );

  const selected: PlannerSubject | null = preset
    ? { ...preset }
    : data.subjects.find((s) => s.population === department && s.id === subjectId) ?? null;
  const checks = selected?.checks ?? [];

  function resetAll() {
    setDepartment(booking?.population ?? (preset ? preset.population : ""));
    setBranchId(preset?.branchId ?? "");
    setSubjectId(booking?.subjectId ?? (preset ? preset.id : ""));
    setCheckTargets(booking?.taskTargets ?? []);
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!department || !subjectId) { setError("Choose a department, branch and name."); return; }
    if (checkTargets.length === 0) { setError("Tick at least one check for this visit."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("subject_kind", department === "people" ? "person" : "service_user");
    fd.set("subject_id", subjectId);
    for (const t of checkTargets) fd.append("check_targets", t);
    if (booking) fd.set("booking_id", booking.id);
    startTransition(async () => {
      const res = await (booking ? updateBooking(fd) : createBooking(fd));
      if (res.error) { setError(res.error); return; }
      setOpen(false);
      if (!booking) resetAll();
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button type="button" className={buttonClassName} onClick={() => setOpen((o) => !o)}>
        {buttonLabel}
      </button>
      {/* CENTRED, not hung off the button (Phil, 2026-09-08: "the booking pop up is far
          right, make it central"). Anchored under a top right button it opened half off
          the calendar, and on the whiteboard it covered the month it was booking into.
          Rendered into the body so no scroll container or backdrop filter can clip or
          re-anchor it, with a scrim that dims the page behind. */}
      {open
        ? createPortal(
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
    <form
      ref={panelRef}
      onSubmit={submit}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit booking" : "Book a visit"}
      className="glass-card my-auto w-[30rem] max-w-full space-y-4 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{editing ? "Edit booking" : "Book a visit"}</h3>
        <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => { setOpen(false); resetAll(); }}>
          Cancel
        </button>
      </div>

      {preset ? (
        <p className="text-sm text-white/70">
          For <span className="font-semibold text-white">{preset.name}</span>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white/80">Department</span>
            <select
              className="w-full"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value as "" | "people" | "service_users");
                setBranchId("");
                setSubjectId("");
                setCheckTargets([]);
              }}
              required
            >
              <option value="">Choose…</option>
              <option value="people">People</option>
              <option value="service_users">Service Users</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white/80">Branch</span>
            <select
              className="w-full"
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setSubjectId(""); setCheckTargets([]); }}
              disabled={!department}
            >
              <option value="">All branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white/80">Name</span>
            <select
              className="w-full"
              value={subjectId}
              onChange={(e) => { setSubjectId(e.target.value); setCheckTargets([]); }}
              disabled={!department}
              required
            >
              <option value="">Choose…</option>
              {nameOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selected ? (
        checks.length === 0 ? (
          <p className="text-sm text-amber-200">This record has no checks to book.</p>
        ) : (
          <div className="text-sm">
            {/* TICKS, NOT A DROPDOWN. A carer at one house does the supervision and the spot
                check on the same trip, and a list you can only pick one of from made that
                two visits at the same minute -- which the clash rule refuses outright. */}
            <span className="mb-1 block font-medium text-white/80">
              What is being done{checkTargets.length > 1 ? ` — ${checkTargets.length} on this visit` : ""}
            </span>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
              {checks.map((c) => {
                const value = c.trackerKey ? `tracker:${c.trackerKey}` : c.instanceId;
                return (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checkTargets.includes(value)}
                      onChange={() => toggleTarget(value)}
                    />
                    <span className="text-white/85">
                      {c.name}
                      {c.dueDate ? <span className="text-white/45"> — due {fmtDue(c.dueDate)}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )
      ) : null}

      {/*
        CARRIED OUT BY, AND THE ONE NAME THAT MAY BE MISSING FROM IT.
        You can book anybody in the company. You cannot put YOURSELF down for a carer outside the
        branches you run, because being the conductor is what opens that carer's record to you
        (0183), and nobody should be able to hand themselves that. Booking a colleague is fine:
        they get it because somebody else asked them to. Migration 0191 enforces the same rule,
        so this list can never offer a choice the save will refuse.
      */}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">Carried out by</span>
        <select
          className="w-full"
          name="conductor_id"
          defaultValue={booking?.conductorId ?? (mayConductSelf ? currentUserId : "")}
          key={`${booking?.id ?? "new"}:${mayConductSelf ? "self" : "others"}`}
          required
        >
          <option value="">Choose…</option>
          {conductorOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!mayConductSelf && subjectBranchId ? (
          <span className="mt-1 block text-xs text-white/45">
            You can book this for a colleague, but not for yourself: this record is in a branch
            you do not run.
          </span>
        ) : null}
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Date</span>
          <input type="date" name="scheduled_date" className="w-full" defaultValue={booking?.scheduledDate} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Time</span>
          <TimeSelect defaultValue={booking?.startTime ?? undefined} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Minutes</span>
          <input type="number" name="duration_minutes" min={5} step={5} defaultValue={booking?.durationMinutes ?? 30} className="w-full" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">Notes (optional)</span>
        <textarea name="notes" rows={2} className="w-full" defaultValue={booking?.notes ?? ""} />
      </label>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Saving…" : editing ? "Save changes" : "Book visit"}
        </button>
      </div>
    </form>
      </div>,
            document.body,
          )
        : null}
    </div>
  );
}
