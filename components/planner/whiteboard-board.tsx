"use client";

import { ukShortDayMonth } from "@/lib/dates";
import { boardWeeks } from "@/lib/planner/week";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking, cancelBooking } from "@/lib/planner/actions";
import TimeSelect from "./time-select";
import type { WhiteboardBoard, BoardToBook } from "@/lib/planner/data";
import { dueTone } from "@/lib/planner/due-tone";
import {
  OTHER,
  OTHER_LABEL,
  OVERDUE_BLOCK,
  PEOPLE_LEFT,
  PEOPLE_RIGHT,
  SU_LEFT,
  SU_RIGHT,
  onToBookStrip,
  type WhiteboardHeading,
} from "@/lib/planner/whiteboard";

function fmtShort(iso: string): string {
  // See lib/dates.ts: one spelling of a month across the whole app.
  return ukShortDayMonth(iso);
}

/* The headings, their wording and order are as before; they are matched by the check's KEY now,
   not its name, so renaming a check cannot drop it off (2026-10-15). Everything booked with no
   heading of its own goes under Other on its side, so nothing on My Planner is missing here; a
   visit with several tasks is a line under each of their headings (lib/planner/whiteboard.ts). */

export default function WhiteboardBoard({
  board,
  branchId,
  conductors,
  currentUserId,
  todayIso,
}: {
  board: WhiteboardBoard;
  branchId: string;
  conductors: Array<{ id: string; name: string }>;
  currentUserId: string;
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<BoardToBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: (fd: FormData) => Promise<{ ok?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const res = await fn(fd);
      if (res.error) alert(res.error);
      router.refresh();
    });
  }

  function submitBooking(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!active) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("subject_kind", active.population === "people" ? "person" : "service_user");
    fd.set("subject_id", active.subjectId);
    fd.set("check_instance_id", active.instanceId);
    startTransition(async () => {
      const res = await createBooking(fd);
      if (res.error) { setError(res.error); return; }
      setActive(null);
      router.refresh();
    });
  }

  const inBranch = <T extends { branchId: string | null }>(x: T) => !branchId || x.branchId === branchId;
  const booked = board.booked.filter(inBranch);
  // Only the whiteboard checks appear above (and only their to-book items are clickable).
  const toBook = board.toBook.filter(inBranch).filter((t) => onToBookStrip(t.population, t.checkKey));
  /* Four fixed Monday to Sunday weeks, this one first (Phil, 2026-09-24). They move on Mondays.
     In front of them the Overdue block (Phil, 2026-10-15): due before this Monday and still not
     booked or done, oldest first, so nothing falls off the strip on a Monday. */
  const blocks = [
    { key: "overdue", index: OVERDUE_BLOCK, label: "Overdue", empty: "Nothing overdue." },
    ...boardWeeks(todayIso).map((w, i) => ({ key: w.start, index: i, label: w.label, empty: "Nothing due." })),
  ];

  function headingBlock(population: "people" | "service_users", h: WhiteboardHeading) {
      const items = booked.filter((b) => b.population === population && b.heading === h.key);
      const other = h.key === OTHER;
      return (
        <div key={h.key} className="mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-amber-600">{h.label}</h4>
          {items.length === 0 ? (
            <p className="text-[11px] text-slate-400">—</p>
          ) : (
            <div className="mt-1 space-y-0.5">
              {items.map((b) => (
                <div key={b.lineId} className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-2 py-px text-[11px] leading-tight text-slate-700 shadow-sm">
                  <span className="min-w-0 truncate font-semibold text-slate-800">
                    {b.recordName}
                    {/* Under Other the heading cannot say what it is, so the line does. */}
                    {other ? <span className="ml-1.5 font-normal text-slate-500">{b.what}</span> : null}
                  </span>
                  {/*
                    THE DUE DATE STAYS ONCE IT IS BOOKED (Thistle, via Phil 2026-10-05: "once
                    something is added to the Whiteboard it loses the due date"). LINED UP, not
                    tacked on the end: who, when it is booked and when it is due each sit in a
                    fixed width column, so every row under a heading reads down the same line
                    instead of "higgledy piggledy". Red pill: the due date has gone. Amber pill:
                    booked for after it is due, so it will be late. A pill, not coloured text,
                    because gold text already means "this one is yours".
                  */}
                  <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-slate-500 tabular-nums">
                    {/* GOLD MEANS YOU, the same as the Planner calendar: on a board of
                        everybody's work your own are the ones you do not have to read for. */}
                    <span
                      className={`w-24 truncate text-right ${b.conductorId === currentUserId ? "font-semibold text-amber-600" : ""}`}
                      title={b.conductorName ?? undefined}
                    >
                      {b.conductorName ?? ""}
                    </span>
                    <span className="w-[4.75rem]" title="Booked for">
                      {fmtShort(b.date)}{b.startTime ? ` ${b.startTime}` : ""}
                    </span>
                    {(() => {
                      const tone = dueTone(b.dueDate, b.date, todayIso);
                      return (
                        <span
                          className={`w-[4.75rem] rounded px-1 ${
                            tone === "red"
                              ? "bg-red-100 font-semibold text-red-700"
                              : tone === "amber"
                                ? "bg-amber-100 font-semibold text-amber-800"
                                : ""
                          }`}
                          title={
                            !b.dueDate
                              ? "No due date"
                              : tone === "red"
                                ? "The due date has passed"
                                : tone === "amber"
                                  ? "Booked for after the due date"
                                  : "Due date"
                          }
                        >
                          {b.dueDate ? `Due ${fmtShort(b.dueDate)}` : ""}
                        </span>
                      );
                    })()}
                    {b.cancellable ? (
                      <form
                        action={(fd) => {
                          /* A visit with several tasks is one booking: cancelling it from any of
                             its lines cancels the whole visit, so the question says so. */
                          const ask =
                            b.taskCount > 1
                              ? `Cancel this visit? All ${b.taskCount} of its tasks move back to 'to book'.`
                              : "Cancel this booking? It moves back to 'to book'.";
                          if (!confirm(ask)) return;
                          run(cancelBooking, fd);
                        }}
                      >
                        <input type="hidden" name="booking_id" value={b.bookingId} />
                        <button type="submit" disabled={pending} className="text-slate-400 hover:text-rag-red" aria-label="Cancel booking">✕</button>
                      </form>
                    ) : (
                      /* A booked absence meeting: shown here, managed on the Absence page. */
                      <a href={b.href ?? "/people/absence"} className="text-slate-400 hover:text-slate-700" aria-label="Open on the Absence page" title="Open on the Absence page">↗</a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
  }

  function half(population: "people" | "service_users", left: readonly WhiteboardHeading[], right: readonly WhiteboardHeading[]) {
    return (
      /* TWO HEADING COLUMNS ONLY WHERE A ROW FITS (Phil, 2026-10-05: an iPad screenshot showed
         names gone and due dates spilling out; "I don't want to change the way it looks on
         desktop"). A booked row needs about 380px for name, who, booked date and Due. On a wide
         desktop (1900px and up) each heading column has that, so the board is unchanged there.
         Narrower (laptops, iPads) the headings stack in one column, giving each row the side's
         full width. */
      <div className="grid grid-cols-1 gap-x-6 min-[1900px]:grid-cols-2">
        <div>{left.map((h) => headingBlock(population, h))}</div>
        <div>{right.map((h) => headingBlock(population, h))}</div>
        {/* OTHER, across the side: everything booked with no heading of its own (Phil, 2026-10-15). */}
        <div className="min-[1900px]:col-span-2">{headingBlock(population, { key: OTHER, label: OTHER_LABEL })}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* To book: this week and the next three, Monday to Sunday. Click a check to book it. */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">To book: overdue, this week and the next three</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {blocks.map((w) => {
            const items = toBook.filter((t) => t.block === w.index);
            return (
              <div key={w.key} className="glass-card p-3">
                <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/50">
                  <span className={w.index === OVERDUE_BLOCK && items.length > 0 ? "text-red-300" : undefined}>{w.label}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">{items.length}</span>
                </p>
                {items.length === 0 ? (
                  <p className="text-[11px] text-white/30">{w.empty}</p>
                ) : (
                  <div className="max-h-[150px] space-y-1 overflow-y-auto pr-1">
                    {items.map((t) => (
                      <button
                        key={t.instanceId}
                        type="button"
                        onClick={() => { setActive(t); setError(null); }}
                        title="Click to book"
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-white/80 hover:border-gold-400/50 hover:bg-gold-400/10"
                      >
                        <span className="min-w-0 truncate font-semibold text-white">{t.recordName}</span>
                        {/* A day already gone this week is overdue: its date goes red, and it is still
                            here to be booked rather than dropping off the board. */}
                        <span className="shrink-0 whitespace-nowrap text-white/50">
                          {t.checkName} ·{" "}
                          {t.dueDate < todayIso ? (
                            <span className="font-semibold text-red-300" title="Overdue">{fmtShort(t.dueDate)}</span>
                          ) : (
                            fmtShort(t.dueDate)
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* The whiteboard: off-white, split People | Service Users by a dashed gold line. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-[#f6f5ef] p-4 shadow-inner">
        {/* People above Service Users below a landscape iPad width (1024px), side by side above it. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:pr-6">
            <h3 className="mb-3 border-b border-slate-300 pb-1 text-sm font-bold text-slate-800">People</h3>
            {half("people", PEOPLE_LEFT, PEOPLE_RIGHT)}
          </div>
          <div className="border-t-2 border-dashed border-gold-400 pt-4 lg:border-l-2 lg:border-t-0 lg:pl-6 lg:pt-0">
            <h3 className="mb-3 border-b border-slate-300 pb-1 text-sm font-bold text-slate-800">Service Users</h3>
            {half("service_users", SU_LEFT, SU_RIGHT)}
          </div>
        </div>
      </div>

      {/* Booking modal, opened by clicking a to-book check. */}
      {active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setActive(null)}>
          <form
            onSubmit={submitBooking}
            onMouseDown={(e) => e.stopPropagation()}
            className="glass-card w-full max-w-md space-y-4 p-5"
          >
            <div>
              <h3 className="text-sm font-semibold text-white">Book {active.checkName}</h3>
              <p className="text-sm text-white/60">
                For <span className="font-semibold text-white">{active.recordName}</span> · due {fmtShort(active.dueDate)}
              </p>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-white/80">Carried out by</span>
              <select name="conductor_id" defaultValue={currentUserId} className="w-full" required>
                <option value="">Choose…</option>
                {conductors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-white/80">Date</span>
                <input type="date" name="scheduled_date" defaultValue={active.dueDate} className="w-full" required />
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

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => setActive(null)}>Cancel</button>
              <button type="submit" disabled={pending} className="btn-primary text-xs">{pending ? "Booking…" : "Book task"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
