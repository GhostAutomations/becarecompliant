"use client";

/**
 * Be Care Compliant — the Planned Review Date cell (Phase 4, extended Phase 6).
 * Clicking the cell opens a small booking popover (rendered in a portal so the
 * register's scroll area does not clip it): pick a date, TIME and DURATION plus
 * the reviewer, then Book in. The reviewer receives a branded email with a
 * timed .ics calendar invite (Phase 6). The popover stays open showing
 * "Booking…" until the save completes, then closes: no dead seconds where it
 * looks like nothing happened (Phil, 2026-07-12).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { bookReview } from "@/lib/service-users/actions";
import { formatDisplayDate } from "@/lib/service-users/logic";

type Reviewer = { id: string; full_name: string; email: string };

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1 hour 30" },
  { value: 120, label: "2 hours" },
];

export default function PlannedReviewCell({
  serviceUserId,
  plannedDate,
  plannedTime,
  plannedDuration,
  reviewerId,
  reviewerName,
  reviewers,
  editable,
}: {
  serviceUserId: string;
  plannedDate: string | null;
  plannedTime?: string | null;
  plannedDuration?: number | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewers: Reviewer[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [date, setDate] = useState(plannedDate ?? "");
  const [time, setTime] = useState((plannedTime ?? "10:00").slice(0, 5));
  const [duration, setDuration] = useState(String(plannedDuration ?? 60));
  const [reviewer, setReviewer] = useState(reviewerId ?? "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (pending) return; // do not lose the "Booking…" state mid-save
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  const timeLabel = plannedTime ? ` ${plannedTime.slice(0, 5)}` : "";
  const label = plannedDate ? `${formatDisplayDate(plannedDate)}${timeLabel}` : "—";
  const sub = plannedDate && reviewerName ? reviewerName : null;

  if (!editable) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-white/70">{label}</span>
        {sub ? <span className="text-[10px] text-white/40">{sub}</span> : null}
      </div>
    );
  }

  function toggle() {
    if (open) {
      if (!pending) setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left });
    setDate(plannedDate ?? "");
    setTime((plannedTime ?? "10:00").slice(0, 5));
    setDuration(String(plannedDuration ?? 60));
    setReviewer(reviewerId ?? "");
    setOpen(true);
  }

  function submit(clear: boolean) {
    const fd = new FormData();
    fd.set("service_user_id", serviceUserId);
    fd.set("planned_review_date", clear ? "" : date);
    fd.set("planned_review_time", clear ? "" : time);
    fd.set("planned_review_duration", clear ? "" : duration);
    fd.set("planned_reviewer_id", clear ? "" : reviewer);
    startTransition(async () => {
      await bookReview(fd);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      {plannedDate ? (
        <button
          ref={btnRef}
          type="button"
          disabled={pending}
          onClick={toggle}
          className={`flex flex-col items-center rounded-lg px-2 py-1 transition hover:bg-white/10 ${pending ? "opacity-60" : ""}`}
        >
          <span className="text-white/80">{label}</span>
          {sub ? <span className="text-[10px] text-white/40">{sub}</span> : null}
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          disabled={pending}
          onClick={toggle}
          className={`btn-outline text-xs ${pending ? "opacity-60" : ""}`}
        >
          Book now
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: 250 }}
            className="z-50 flex flex-col gap-3 rounded-xl border border-white/15 bg-navy-900 p-3 shadow-2xl"
          >
            <div>
              <label className="form-label">Review date</label>
              <input
                type="date"
                value={date}
                disabled={pending}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Time</label>
                <input
                  type="time"
                  value={time}
                  disabled={pending}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Duration</label>
                <select
                  value={duration}
                  disabled={pending}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Reviewer</label>
              <select
                value={reviewer}
                disabled={pending}
                onChange={(e) => setReviewer(e.target.value)}
              >
                <option value="">Choose a reviewer</option>
                {reviewers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={!date || !time || pending}
                onClick={() => submit(false)}
              >
                {pending ? "Booking…" : "Book in"}
              </button>
              {plannedDate ? (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={pending}
                  onClick={() => submit(true)}
                >
                  {pending ? "Working…" : "Clear"}
                </button>
              ) : null}
            </div>
            <p className="text-[10px] text-white/40">
              Booking emails the reviewer a calendar invite for this slot.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
