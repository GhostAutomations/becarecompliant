"use client";

/**
 * Be Care Compliant: People > Holidays > Blackout dates (0477, Phil 2026-10-15;
 * docs/decisions/holiday-blackouts.md). Periods when holidays can't be booked, with the reason staff
 * see and the branches they cover. Company Admin, Responsible Individual and Registered Manager
 * (and the Founder) add, change and remove them; everyone else on this page sees them. While one is
 * being made or changed, the people who already have approved or pending holiday inside it are
 * listed, to deal with personally: their holidays are not touched. A refused save keeps what was
 * typed.
 */

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { deleteBlackout, saveBlackout } from "@/lib/holidays/blackout-actions";
import { affectedBy, blackoutDates, type Blackout, type HolidayLite } from "@/lib/holidays/blackouts";

type Branch = { id: string; name: string };
type Draft = { id: string; start: string; end: string; reason: string; allBranches: boolean; branchIds: string[] };
const EMPTY: Draft = { id: "", start: "", end: "", reason: "", allBranches: true, branchIds: [] };

function AffectedList({ draft, holidays }: { draft: Omit<Draft, "id" | "reason">; holidays: HolidayLite[] }) {
  const hit = affectedBy(draft, holidays);
  if (!draft.start || !draft.end) return null;
  if (hit.length === 0) return <p className="text-xs text-white/50">Nobody has holiday booked or requested in this period.</p>;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <p className="font-semibold">Already booked in this period ({hit.length}). Their holidays stay as they are; deal with them personally.</p>
      <ul className="mt-1 space-y-0.5">
        {hit.map((h) => (
          <li key={h.id}>
            {h.name ?? "Someone"}, {blackoutDates(h.start, h.end)} ({h.status === "approved" ? "approved" : "waiting for approval"})
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlackoutForm({
  initial,
  branches,
  holidays,
  onDone,
}: {
  initial: Draft;
  branches: Branch[];
  holidays: HolidayLite[];
  onDone: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [state, action, pending] = useActionState(saveBlackout, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
  }, [state, pending, flash, onDone]);
  const set = (patch: Partial<Draft>) => {
    reset();
    setD((x) => ({ ...x, ...patch }));
  };
  const toggleBranch = (id: string, on: boolean) =>
    set({ branchIds: on ? [...d.branchIds, id] : d.branchIds.filter((b) => b !== id) });

  return (
    <form onSubmit={submitKeepingTyped(action)} className="space-y-3 rounded-xl bg-white/5 p-3">
      {d.id ? <input type="hidden" name="blackout_id" value={d.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="bo-start" className="form-label">First day *</label>
          <input id="bo-start" name="start_date" type="date" value={d.start} onChange={(e) => set({ start: e.target.value, end: d.end && d.end >= e.target.value ? d.end : e.target.value })} />
        </div>
        <div>
          <label htmlFor="bo-end" className="form-label">Last day *</label>
          <input id="bo-end" name="end_date" type="date" min={d.start || undefined} value={d.end} onChange={(e) => set({ end: e.target.value })} />
          <p className="form-hint">The same day as the first for a single day.</p>
        </div>
      </div>
      <div>
        <label htmlFor="bo-reason" className="form-label">Reason staff will see *</label>
        <input id="bo-reason" name="reason" maxLength={120} value={d.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="For example Christmas cover" />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="form-label">Branches *</legend>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" name="all_branches" value="1" checked={d.allBranches} onChange={(e) => set({ allBranches: e.target.checked })} />
          All branches
        </label>
        {!d.allBranches ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-1">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="branch_ids" value={b.id} checked={d.branchIds.includes(b.id)} onChange={(e) => toggleBranch(b.id, e.target.checked)} />
                {b.name}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      <AffectedList draft={d} holidays={holidays} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={saved ? "btn-saved" : "btn-primary"}>
          {pending ? "Saving…" : saved ? "Saved" : d.id ? "Save changes" : "Add blackout"}
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onDone}>
          Close
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

export default function BlackoutSection({
  blackouts,
  branches,
  holidays,
  manages,
  todayIso,
}: {
  blackouts: Blackout[];
  branches: Branch[];
  holidays: HolidayLite[];
  manages: boolean;
  todayIso: string;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showPast, setShowPast] = useState(false);
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const upcoming = blackouts.filter((b) => b.end >= todayIso);
  const past = blackouts.filter((b) => b.end < todayIso).reverse();
  const shown = showPast ? past : upcoming;
  const covers = (b: Blackout) => (b.allBranches ? "All branches" : b.branchIds.map((id) => branchName.get(id) ?? "Branch").join(", "));

  return (
    <div className="space-y-3">
      {manages && !editing ? (
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setEditing({ ...EMPTY })}>
          Add blackout dates
        </button>
      ) : null}
      {editing ? (
        <BlackoutForm key={editing.id || "new"} initial={editing} branches={branches} holidays={holidays} onDone={() => setEditing(null)} />
      ) : null}

      {blackouts.length === 0 ? (
        <p className="text-sm text-white/55">No blackout dates set. Add one to stop holidays being booked on busy dates.</p>
      ) : (
        <>
          {shown.length === 0 ? (
            <p className="text-sm text-white/55">{showPast ? "No past blackout dates." : "No blackout dates coming up."}</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((b) => {
                const hit = affectedBy(b, holidays);
                return (
                  <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white/5 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{blackoutDates(b.start, b.end)}</p>
                      <p className="text-xs text-white/70">{b.reason}</p>
                      <p className="text-xs text-white/50">{covers(b)}</p>
                      {manages && hit.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-300">
                          Already booked: {hit.map((h) => `${h.name ?? "Someone"} (${h.status === "approved" ? "approved" : "waiting"})`).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    {manages ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-outline px-3 py-1.5 text-xs"
                          onClick={() => setEditing({ id: b.id, start: b.start, end: b.end, reason: b.reason, allBranches: b.allBranches, branchIds: b.branchIds })}
                        >
                          Edit
                        </button>
                        <ActionForm
                          action={deleteBlackout}
                          hidden={{ blackout_id: b.id }}
                          label="Remove"
                          savingLabel="Removing…"
                          savedLabel="Removed"
                          confirm={`Remove the blackout ${blackoutDates(b.start, b.end)} (${b.reason})? Holidays can then be booked on these dates.`}
                          buttonClassName="btn-ghost px-3 py-1.5 text-xs"
                          className=""
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {past.length > 0 ? (
            <button type="button" className="text-xs text-gold-300 underline decoration-gold-300/40" onClick={() => setShowPast((v) => !v)}>
              {showPast ? "Back to upcoming blackout dates" : `Show past blackout dates (${past.length})`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
