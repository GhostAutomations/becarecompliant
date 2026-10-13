"use client";

/**
 * Be Care Compliant — "View absence" dialog.
 * Lists a person's recorded absences; a Manager/Admin can change the LAST date of
 * a multi-day absence here (keeping it one occasion, not several, so editing does
 * not push someone toward a trigger). Portalled to body so a glass card's
 * backdrop-filter can never trap the overlay.
 *
 * Discounting (0328, Phil 2026-09-24): a Manager or above can discount an absence (it stays here,
 * struck through, with who, when and why, and stops counting) and count it again. Supervisors see
 * it and can still edit the last date.
 *
 * Stage history (0457, Phil 2026-10-13), only when the company's switch is on: about twice as wide
 * (full width on a phone), one line per stage reached with its status at the top, one bracket down
 * the left joining every absence that counts towards a Due or Pending stage, and each absence on
 * two lines (dates, days and a status pill; then its controls side by side). Switch off: as before.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { updateAbsenceEndDate } from "@/lib/absence/actions";
import { discountAbsences, restoreAbsence } from "@/lib/absence/discount-actions";
import { absenceCountState } from "@/lib/absence/discount";
import { absenceCardStatus, type AbsenceCardStatus, type ReachedStage, type StageHistory } from "@/lib/absence/stage-history";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { AbsenceEventRow } from "@/lib/absence/data";

function fmt(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** 29 Aug 2026, for the stage history layout. */
function fmtLong(d: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATE_PILL: Record<ReachedStage["state"], { label: string; cls: string }> = {
  due: { label: "Due", cls: "pill-red" },
  pending: { label: "Pending", cls: "pill-amber" },
  dealt_with: { label: "Dealt with", cls: "pill-green" },
};

/** "Stage 1 · reached 29 Aug 2026 · [Pending] meeting booked 20 Oct 2026". */
function StageLine({ r, all }: { r: ReachedStage; all: ReachedStage[] }) {
  const pill = STATE_PILL[r.state];
  const lowerPending = all.filter((o) => o.stage < r.stage && o.state === "pending").map((o) => o.stage);
  const note =
    r.state === "dealt_with"
      ? `meeting on ${fmtLong(r.meetingDate)}`
      : r.state === "pending"
        ? r.meetingDate
          ? `meeting booked ${fmtLong(r.meetingDate)}`
          : "meeting booked"
        : lowerPending.length
          ? `after the Stage ${Math.max(...lowerPending)} meeting`
          : "no meeting booked";
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
      <span className="font-semibold text-white">Stage {r.stage}</span>
      <span className="text-white/40" aria-hidden>·</span>
      <span>reached {fmtLong(r.reachedOn)}</span>
      <span className="text-white/40" aria-hidden>·</span>
      <span className={pill.cls}>{pill.label}</span>
      <span className="text-white/60">{note}</span>
    </li>
  );
}

/** The one status pill on an absence card in the stage history layout. */
function cardPill(status: AbsenceCardStatus, history: StageHistory): { label: string; cls: string } {
  if (status.kind === "discounted") return { label: "Discounted", cls: "pill-neutral" };
  if (status.kind === "outside_window") return { label: "Outside the window", cls: "pill-neutral" };
  if (status.kind === "counts") return { label: "Counts", cls: "pill-neutral" };
  const open = status.stages.some((n) => history.open.some((o) => o.stage === n));
  return {
    label: status.stages.map((n) => `Stage ${n} reached`).join(", "),
    cls: open ? "pill-amber" : "pill-green",
  };
}

/** Runs a server action from a button, refreshing the page when it succeeds. */
function useRun(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const router = useRouter();
  const [state, run, pending] = useActionState(action, IDLE_STATE);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setSubmitting(false);
    if (state.ok) router.refresh();
  }, [state, router]);
  function go(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setSubmitting(true);
    setTimeout(() => run(fd), 0);
  }
  return { state, go, busy: submitting || pending };
}

function RowEditor({
  ev,
  n,
  canEdit,
  canDiscount,
  windowStart,
  history,
}: {
  ev: AbsenceEventRow;
  n: number;
  canEdit: boolean;
  canDiscount: boolean;
  windowStart: string;
  /** Switch on (0457): the two line card with the stage history's pill. */
  history?: StageHistory;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAbsenceEndDate, IDLE_STATE);
  const [end, setEnd] = useState(ev.end_date ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [saved, flash, reset] = useSavedFlash();
  const discount = useRun(discountAbsences);
  const restore = useRun(restoreAbsence);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setSubmitting(false);
    if (state.ok) {
      flash();
      router.refresh();
    }
  }, [state, flash, router]);

  useEffect(() => {
    if (discount.state.ok) {
      setAsking(false);
      setReason("");
    }
  }, [discount.state]);

  function save() {
    const fd = new FormData();
    fd.set("absence_id", ev.id);
    fd.set("end_date", end);
    setSubmitting(true);
    setTimeout(() => action(fd), 0);
  }

  const busy = submitting || pending;
  const countState = absenceCountState(ev, { windowStart });
  const discounted = countState === "discounted";

  const discountBox = asking && (
    <div className="mt-3 space-y-2 rounded-lg border border-white/10 p-3">
      <label className="form-label text-[11px]" htmlFor={`discount-reason-${ev.id}`}>
        Why is this absence being discounted?
      </label>
      <textarea
        id={`discount-reason-${ev.id}`}
        rows={2}
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: disallowed at the Stage 1 meeting, car broke down"
      />
      <p className="form-hint">
        It stays on the record, struck through, but stops counting towards the triggers. You can count it again later.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={discount.busy}
          onClick={() => discount.go({ absence_id: ev.id, reason })}
        >
          {discount.busy ? "Saving…" : "Discount absence"}
        </button>
      </div>
    </div>
  );
  const errors = (
    <>
      {state.error && <p className="form-error mt-1 text-xs">{state.error}</p>}
      {discount.state.error && <p className="form-error mt-1 text-xs">{discount.state.error}</p>}
      {restore.state.error && <p className="form-error mt-1 text-xs">{restore.state.error}</p>}
    </>
  );

  if (history) {
    const pill = cardPill(absenceCardStatus(ev.id, discounted, history), history);
    const days = ev.days ?? 1;
    const range =
      ev.end_date && ev.end_date !== ev.start_date
        ? `${fmtLong(ev.start_date)} to ${fmtLong(ev.end_date)}`
        : fmtLong(ev.start_date);
    return (
      <div className={`rounded-xl p-3 ${discounted ? "border border-white/10 bg-white/[0.02]" : "bg-white/5"}`}>
        {/* Line 1: dates, days and the status pill. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">Absence {n}</span>
          <span className={`text-sm ${discounted ? "text-white/45 line-through" : "text-white"}`}>{range}</span>
          <span className="text-xs text-white/50">
            {days} day{days === 1 ? "" : "s"}
          </span>
          {ev.reason && (
            <span className={`min-w-0 truncate text-xs ${discounted ? "text-white/40 line-through" : "text-white/55"}`}>
              {ev.reason}
            </span>
          )}
          <span className={`${pill.cls} ml-auto`}>{pill.label}</span>
        </div>
        {/* Line 2: the controls side by side. */}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-48">
            <label className="form-label text-[11px]" htmlFor={`absence-end-${ev.id}`}>Last date of absence</label>
            <input
              id={`absence-end-${ev.id}`}
              type="date"
              value={end}
              disabled={!canEdit || busy}
              onChange={(e) => {
                setEnd(e.target.value);
                reset();
              }}
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-1.5 text-xs`}
            >
              {busy ? "Saving…" : saved ? "Saved" : "Save last date"}
            </button>
          )}
          {canDiscount && discounted && (
            <button
              type="button"
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={restore.busy}
              onClick={() => restore.go({ absence_id: ev.id })}
            >
              {restore.busy ? "Saving…" : "Count it again"}
            </button>
          )}
          {canDiscount && !discounted && !asking && (
            <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setAsking(true)}>
              Discount
            </button>
          )}
        </div>
        {discounted && (
          <p className="mt-2 text-xs text-white/70">
            Discounted by {ev.discounted_by_name ?? "a manager"} on {fmt(ev.discounted_at)}: {ev.discount_reason}
          </p>
        )}
        {discountBox}
        {errors}
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-3 ${discounted ? "border border-white/10 bg-white/[0.02]" : "bg-white/5"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">Absence {n}</p>
        {discounted && <span className="pill pill-neutral">Discounted</span>}
        {countState === "outside_window" && <span className="pill pill-neutral">Outside the window</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="form-label text-[11px]">First date of absence</p>
          <p className={`text-sm ${discounted ? "text-white/45 line-through" : "text-white/85"}`}>{fmt(ev.start_date)}</p>
        </div>
        <div>
          <label className="form-label text-[11px]" htmlFor={`absence-end-${ev.id}`}>Last date of absence</label>
          <input
            id={`absence-end-${ev.id}`}
            type="date"
            value={end}
            disabled={!canEdit || busy}
            onChange={(e) => {
              setEnd(e.target.value);
              reset();
            }}
          />
        </div>
      </div>
      {ev.reason && <p className={`mt-2 text-xs ${discounted ? "text-white/40 line-through" : "text-white/60"}`}>{ev.reason}</p>}
      {discounted && (
        <p className="mt-2 text-xs text-white/70">
          Discounted by {ev.discounted_by_name ?? "a manager"} on {fmt(ev.discounted_at)}: {ev.discount_reason}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-white/45">{ev.days ?? 1} day{(ev.days ?? 1) === 1 ? "" : "s"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canDiscount && discounted && (
            <button
              type="button"
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={restore.busy}
              onClick={() => restore.go({ absence_id: ev.id })}
            >
              {restore.busy ? "Saving…" : "Count it again"}
            </button>
          )}
          {canDiscount && !discounted && !asking && (
            <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setAsking(true)}>
              Discount
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-1.5 text-xs`}
            >
              {busy ? "Saving…" : saved ? "Saved" : "Save last date"}
            </button>
          )}
        </div>
      </div>
      {discountBox}
      {errors}
    </div>
  );
}

/**
 * The stage history layout: the stages reached at the top, then the absences oldest first, with
 * one bracket down the left joining every absence that counts towards a Due or Pending stage.
 */
function HistoryBody({
  events,
  history,
  canEdit,
  canDiscount,
  windowStart,
}: {
  events: AbsenceEventRow[];
  history: StageHistory;
  canEdit: boolean;
  canDiscount: boolean;
  windowStart: string;
}) {
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const inBracket = sorted.map((e) => history.bracketed.includes(e.id));
  const first = inBracket.indexOf(true);
  const last = inBracket.lastIndexOf(true);
  const row = (ev: AbsenceEventRow, i: number) => (
    <RowEditor
      key={ev.id}
      ev={ev}
      n={i + 1}
      canEdit={canEdit}
      canDiscount={canDiscount}
      windowStart={windowStart}
      history={history}
    />
  );
  const openStages = history.open.map((r) => `Stage ${r.stage}`);

  return (
    <div className="space-y-4">
      <section aria-label="Stages reached" className="rounded-xl border border-white/10 bg-white/5 p-3">
        {history.current.length === 0 ? (
          <p className="text-sm text-white/60">No stage reached. Discounted absences do not count.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.current.map((r) => (
              <StageLine key={`${r.stage}-${r.reachedOn}`} r={r} all={history.current} />
            ))}
          </ul>
        )}
      </section>

      {sorted.length === 0 ? (
        <p className="text-sm text-white/60">No absences recorded.</p>
      ) : (
        <div className="space-y-3">
          {sorted.slice(0, first < 0 ? sorted.length : first).map((ev, i) => row(ev, i))}
          {first >= 0 && (
            <div className="border-l-4 border-amber-400/80 pl-3">
              <p className="mb-2 text-xs font-medium text-amber-300">
                Counting towards {openStages.length > 1 ? `${openStages.slice(0, -1).join(", ")} and ${openStages[openStages.length - 1]}` : openStages[0]}
              </p>
              <div className="space-y-3">
                {sorted.slice(first, last + 1).map((ev, i) => row(ev, first + i))}
              </div>
            </div>
          )}
          {first >= 0 && sorted.slice(last + 1).map((ev, i) => row(ev, last + 1 + i))}
        </div>
      )}
    </div>
  );
}

export default function AbsenceDetailDialog({
  personName,
  events,
  canEdit,
  canDiscount = false,
  windowStart,
  openOnMount = false,
  triggerLabel = "View absence",
  triggerClassName = "btn-outline px-3 py-1.5 text-xs",
  history,
}: {
  personName: string;
  events: AbsenceEventRow[];
  canEdit: boolean;
  /** Managers and above: discount and count again. */
  canDiscount?: boolean;
  /** First date inside the rolling window, to label absences that have aged out. */
  windowStart: string;
  /** Open straight away: a dashboard "Add last date" row asked for this person. */
  openOnMount?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
  /** Only when the company's stage history switch is on (0457). */
  history?: StageHistory;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm ${history ? "p-0 sm:p-4" : "p-4"}`}
        >
          <div
            className={
              history
                ? "flex h-full max-h-[100dvh] w-full flex-col overflow-y-auto border border-white/10 bg-navy-900 p-4 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-6xl sm:rounded-2xl sm:p-6"
                : "flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
            }
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Absences for {personName}</h2>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            {history ? (
              <HistoryBody
                events={events}
                history={history}
                canEdit={canEdit}
                canDiscount={canDiscount}
                windowStart={windowStart}
              />
            ) : events.length === 0 ? (
              <p className="text-sm text-white/60">No absences recorded.</p>
            ) : (
              <div className="space-y-3">
                {[...events]
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((ev, i) => (
                    <RowEditor
                      key={ev.id}
                      ev={ev}
                      n={i + 1}
                      canEdit={canEdit}
                      canDiscount={canDiscount}
                      windowStart={windowStart}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
