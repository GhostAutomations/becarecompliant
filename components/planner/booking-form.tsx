"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "@/lib/planner/actions";
import type { PlannerFormData, PlannerSubject } from "@/lib/planner/data";

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
}: {
  data: PlannerFormData;
  /** Default conductor (the logged-in user). */
  currentUserId: string;
  /** When opened from a record, lock the subject to that record. */
  preset?: { population: "people" | "service_users"; id: string; name: string; branchId: string | null; checks: PlannerSubject["checks"] };
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [department, setDepartment] = useState<"" | "people" | "service_users">(preset ? preset.population : "");
  const [branchId, setBranchId] = useState(preset?.branchId ?? "");
  const [subjectId, setSubjectId] = useState(preset ? preset.id : "");
  const [checkInstanceId, setCheckInstanceId] = useState("");

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
    setCheckInstanceId("");
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!department || !subjectId) { setError("Choose a department, branch and name."); return; }
    if (!checkInstanceId) { setError("Choose the check this task is for."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("subject_kind", department === "people" ? "person" : "service_user");
    fd.set("subject_id", subjectId);
    fd.set("check_instance_id", checkInstanceId);
    startTransition(async () => {
      const res = await createBooking(fd);
      if (res.error) { setError(res.error); return; }
      setOpen(false);
      resetAll();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary text-sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="glass-card space-y-4 p-5">
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
                setCheckInstanceId("");
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
              onChange={(e) => { setBranchId(e.target.value); setSubjectId(""); setCheckInstanceId(""); }}
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
              onChange={(e) => { setSubjectId(e.target.value); setCheckInstanceId(""); }}
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
              value={checkInstanceId}
              onChange={(e) => setCheckInstanceId(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {checks.map((c) => (
                <option key={c.instanceId} value={c.instanceId}>
                  {c.name}{c.dueDate ? ` — due ${fmtDue(c.dueDate)}` : ""}
                </option>
              ))}
            </select>
          </label>
        )
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">Carried out by</span>
        <select className="w-full" name="conductor_id" defaultValue={currentUserId} required>
          <option value="">Choose…</option>
          {data.conductors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Date</span>
          <input type="date" name="scheduled_date" className="w-full" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Time</span>
          <input type="time" name="start_time" min="08:00" max="20:00" step={900} className="w-full" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Minutes</span>
          <input type="number" name="duration_minutes" min={5} step={5} className="w-full" placeholder="60" />
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
  );
}
