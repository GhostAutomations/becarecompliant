"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking, cancelBooking } from "@/lib/planner/actions";
import { handleTimeFocus, handleTimeChange } from "./booking-form";
import type { WhiteboardBoard, BoardToBook } from "@/lib/planner/data";

const pad2 = (n: number) => String(n).padStart(2, "0");
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

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
  const toBook = board.toBook.filter(inBranch);
  const booked = board.booked.filter(inBranch);
  const blocks = [0, 1, 2, 3];

  function column(population: "people" | "service_users", headings: string[]) {
    return headings.map((h) => {
      const items = booked.filter((b) => b.population === population && b.checkName === h);
      return (
        <div key={h} className="mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-amber-600">{h}</h4>
          {items.length === 0 ? (
            <p className="text-[11px] text-slate-400">—</p>
          ) : (
            <div className="mt-1 space-y-1">
              {items.map((b) => (
                <div key={b.bookingId} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 shadow-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-slate-800">{b.recordName}</span>
                    {b.conductorName ? <span className="text-slate-500"> · {b.conductorName}</span> : null}
                    <span className="text-slate-500">
                      {" · "}{fmtShort(b.date)}{b.startTime ? ` · ${b.startTime}` : ""}{b.durationMinutes ? ` · ${b.durationMinutes} min` : ""}
                    </span>
                  </span>
                  <form action={(fd) => { if (!confirm("Cancel this booking? It moves back to 'to book'.")) return; run(cancelBooking, fd); }}>
                    <input type="hidden" name="booking_id" value={b.bookingId} />
                    <button type="submit" disabled={pending} className="text-slate-400 hover:text-rag-red" aria-label="Cancel booking">✕</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="space-y-4">
      {/* To book: the next 28 days in four 7-day blocks. Click a check to book it. */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">To book, next 28 days</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {blocks.map((i) => {
            const start = addDays(todayIso, i * 7);
            const end = addDays(todayIso, i * 7 + 6);
            const items = toBook.filter((t) => t.block === i);
            return (
              <div key={i} className="glass-card p-3">
                <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/50">
                  <span>{fmtShort(start)} – {fmtShort(end)}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">{items.length}</span>
                </p>
                {items.length === 0 ? (
                  <p className="text-[11px] text-white/30">Nothing due.</p>
                ) : (
                  <div className="max-h-[150px] space-y-1 overflow-y-auto pr-1">
                    {items.map((t) => (
                      <button
                        key={t.instanceId}
                        type="button"
                        onClick={() => { setActive(t); setError(null); }}
                        title="Click to book"
                        className="block w-full truncate rounded-md border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-white/80 hover:border-gold-400/50 hover:bg-gold-400/10"
                      >
                        <span className="font-semibold text-white">{t.recordName}</span>
                        <span className="text-white/50"> · {t.checkName} · {fmtShort(t.dueDate)}</span>
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
      <div className="rounded-2xl bg-[#f6f5ef] p-4 shadow-inner">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="md:pr-6">
            <h3 className="mb-3 border-b border-slate-300 pb-1 text-sm font-bold text-slate-800">People</h3>
            {column("people", board.peopleHeadings)}
          </div>
          <div className="md:border-l-2 md:border-dashed md:border-gold-400 md:pl-6">
            <h3 className="mb-3 border-b border-slate-300 pb-1 text-sm font-bold text-slate-800">Service Users</h3>
            {column("service_users", board.suHeadings)}
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
                <input type="time" name="start_time" className="w-full" onFocus={handleTimeFocus} onChange={handleTimeChange} />
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
