"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createBooking } from "@/lib/planner/actions";
import TimeSelect from "./time-select";
import type { PlannerFormData, PlannerSubject } from "@/lib/planner/data";
import { mayConductInBranch } from "@/lib/auth/manage-scope";

/** ISO date -> DD/MM/YYYY for display. */
function fmtDue(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}



/**
 * Book a task. Pick the department, branch and name (or, on a record page, that
 * record is fixed), then the check it is for, who carries it out and when. The
 * check defines what the task is, so there is no free-text title.
 */
export default function BookingForm({
  data,
  currentUserId,
  preset,
  buttonLabel = "New booking",
  buttonClassName = "btn-primary text-xs",
}: {
  data: PlannerFormData;
  /** Default conductor (the logged-in user). */
  currentUserId: string;
  /** When opened from a record, lock the subject to that record. */
  preset?: { population: "people" | "service_users"; id: string; name: string; branchId: string | null; checks: PlannerSubject["checks"] };
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

  const [department, setDepartment] = useState<"" | "people" | "service_users">(preset ? preset.population : "");
  const [branchId, setBranchId] = useState(preset?.branchId ?? "");
  const [subjectId, setSubjectId] = useState(preset ? preset.id : "");
  /* One dropdown, two kinds of target. A check is its instance id; a tracker form has no
     instance, so it is "tracker:<key>" and the action pulls the key back off it. */
  const [checkTarget, setCheckTarget] = useState("");

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
    setDepartment(preset ? preset.population : "");
    setBranchId(preset?.branchId ?? "");
    setSubjectId(preset ? preset.id : "");
    setCheckTarget("");
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!department || !subjectId) { setError("Choose a department, branch and name."); return; }
    if (!checkTarget) { setError("Choose the check this task is for."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("subject_kind", department === "people" ? "person" : "service_user");
    fd.set("subject_id", subjectId);
    if (checkTarget.startsWith("tracker:")) {
      fd.set("tracker_form_key", checkTarget.slice("tracker:".length));
      fd.set("check_instance_id", "");
    } else {
      fd.set("check_instance_id", checkTarget);
      fd.set("tracker_form_key", "");
    }
    startTransition(async () => {
      const res = await createBooking(fd);
      if (res.error) { setError(res.error); return; }
      setOpen(false);
      resetAll();
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
      aria-label="Book a task"
      className="glass-card my-auto w-[30rem] max-w-full space-y-4 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Book a task</h3>
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
                setCheckTarget("");
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
              onChange={(e) => { setBranchId(e.target.value); setSubjectId(""); setCheckTarget(""); }}
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
              onChange={(e) => { setSubjectId(e.target.value); setCheckTarget(""); }}
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white/80">Check</span>
            <select
              className="w-full"
              value={checkTarget}
              onChange={(e) => setCheckTarget(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {checks.map((c) => {
                const value = c.trackerKey ? `tracker:${c.trackerKey}` : c.instanceId;
                return (
                  <option key={value} value={value}>
                    {c.name}{c.dueDate ? ` — due ${fmtDue(c.dueDate)}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
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
          defaultValue={mayConductSelf ? currentUserId : ""}
          key={mayConductSelf ? "self" : "others"}
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
          <input type="date" name="scheduled_date" className="w-full" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Time</span>
          <TimeSelect />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Minutes</span>
          <input type="number" name="duration_minutes" min={5} step={5} defaultValue={30} className="w-full" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">Notes (optional)</span>
        <textarea name="notes" rows={2} className="w-full" />
      </label>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Booking…" : "Book task"}
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
