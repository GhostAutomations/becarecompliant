"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "@/lib/planner/actions";
import type { PlannerFormData, PlannerSubject } from "@/lib/planner/data";

/**
 * Book a task. Pick a person or service user (or an ad-hoc task), optionally tie
 * it to one of that record's checks, choose who carries it out and when. Reused on
 * the Planner and, pre-scoped to one record, on a record page.
 */
export default function BookingForm({
  data,
  preset,
  buttonLabel = "New booking",
}: {
  data: PlannerFormData;
  /** When opened from a record, lock the subject to that record. */
  preset?: { population: "people" | "service_users"; id: string; name: string; branchId: string | null; checks: PlannerSubject["checks"] };
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Selected subject key: "people:<id>", "service_users:<id>", or "adhoc".
  const initialKey = preset ? `${preset.population}:${preset.id}` : "";
  const [subjectKey, setSubjectKey] = useState(initialKey);
  const [checkInstanceId, setCheckInstanceId] = useState("");

  const subjectsByKey = useMemo(() => {
    const m = new Map<string, PlannerSubject>();
    for (const s of data.subjects) m.set(`${s.population}:${s.id}`, s);
    if (preset) m.set(`${preset.population}:${preset.id}`, { ...preset });
    return m;
  }, [data.subjects, preset]);

  const selected = subjectKey && subjectKey !== "adhoc" ? subjectsByKey.get(subjectKey) ?? null : null;
  const isAdhoc = subjectKey === "adhoc";
  const people = data.subjects.filter((s) => s.population === "people");
  const serviceUsers = data.subjects.filter((s) => s.population === "service_users");

  function reset() {
    setSubjectKey(initialKey);
    setCheckInstanceId("");
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // Encode subject_kind + subject_id from the chosen key.
    if (isAdhoc) {
      fd.set("subject_kind", "adhoc");
    } else if (selected) {
      fd.set("subject_kind", selected.population === "people" ? "person" : "service_user");
      fd.set("subject_id", selected.id);
    }
    startTransition(async () => {
      const res = await createBooking(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
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
        <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => { setOpen(false); reset(); }}>
          Cancel
        </button>
      </div>

      {!preset ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Task for</span>
          <select
            className="w-full"
            value={subjectKey}
            onChange={(e) => { setSubjectKey(e.target.value); setCheckInstanceId(""); }}
            required
          >
            <option value="">Choose…</option>
            <option value="adhoc">Ad-hoc task (no record)</option>
            {people.length > 0 ? (
              <optgroup label="People">
                {people.map((s) => (
                  <option key={`people:${s.id}`} value={`people:${s.id}`}>{s.name}</option>
                ))}
              </optgroup>
            ) : null}
            {serviceUsers.length > 0 ? (
              <optgroup label="Service Users">
                {serviceUsers.map((s) => (
                  <option key={`service_users:${s.id}`} value={`service_users:${s.id}`}>{s.name}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      ) : (
        <p className="text-sm text-white/70">
          For <span className="font-semibold text-white">{preset.name}</span>
        </p>
      )}

      {selected ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Check</span>
          <select
            className="w-full"
            name="check_instance_id"
            value={checkInstanceId}
            onChange={(e) => setCheckInstanceId(e.target.value)}
          >
            <option value="">Other (describe below)</option>
            {selected.checks.map((c) => (
              <option key={c.instanceId} value={c.instanceId}>
                {c.name}{c.dueDate ? ` — due ${c.dueDate}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isAdhoc ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Branch</span>
          <select className="w-full" name="branch_id" required>
            <option value="">Choose…</option>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">
          Title {selected && !checkInstanceId ? "" : "(optional)"}
        </span>
        <input
          type="text"
          name="title"
          className="w-full"
          placeholder={selected && checkInstanceId ? "Override label (optional)" : "e.g. Team meeting"}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-white/80">Carried out by</span>
        <select className="w-full" name="conductor_id" required>
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
          <input type="time" name="start_time" className="w-full" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-white/80">Minutes</span>
          <input type="number" name="duration_minutes" min={1} className="w-full" placeholder="60" />
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
