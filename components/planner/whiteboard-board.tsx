"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickBookCheck, cancelBooking } from "@/lib/planner/actions";
import type { WhiteboardBoard } from "@/lib/planner/data";

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
  todayIso,
}: {
  board: WhiteboardBoard;
  /** Selected branch id (from the header selector); empty = all branches. */
  branchId: string;
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: (fd: FormData) => Promise<{ ok?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const res = await fn(fd);
      if (res.error) alert(res.error);
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
                    <span className="text-slate-500"> · {fmtShort(b.date)}</span>
                    {b.conductorName ? <span className="text-slate-400"> · {b.conductorName}</span> : null}
                  </span>
                  <form
                    action={(fd) => { if (!confirm("Cancel this booking? It moves back to 'to book'.")) return; run(cancelBooking, fd); }}
                  >
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
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">{fmtShort(start)} – {fmtShort(end)}</p>
                {items.length === 0 ? (
                  <p className="text-[11px] text-white/30">Nothing due.</p>
                ) : (
                  <div className="space-y-1">
                    {items.map((t) => (
                      <form key={t.instanceId} action={(fd) => run(quickBookCheck, fd)}>
                        <input type="hidden" name="check_instance_id" value={t.instanceId} />
                        <button
                          type="submit"
                          disabled={pending}
                          title="Click to book"
                          className="block w-full truncate rounded-md border border-white/10 bg-white/5 px-2 py-1 text-left text-[11px] text-white/80 hover:border-gold-400/50 hover:bg-gold-400/10"
                        >
                          <span className="font-semibold text-white">{t.recordName}</span>
                          <span className="text-white/50"> · {t.checkName} · {fmtShort(t.dueDate)}</span>
                        </button>
                      </form>
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
    </div>
  );
}
