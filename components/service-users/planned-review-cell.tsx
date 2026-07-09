"use client";

/**
 * Be Care Compliant — the Planned Review Date cell (Phase 4). Clicking the cell
 * opens a small booking popover (rendered in a portal so the register's scroll area
 * does not clip it): pick a date and the reviewer who will complete the review, then
 * Book. This sets the booking on the record and derives the Review Status to
 * "Booked In". Clear removes it. The reviewer calendar-invite email is Phase 6
 * (Notifications); this cell only records the booking.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { bookReview } from "@/lib/service-users/actions";
import { formatDisplayDate } from "@/lib/service-users/logic";

type Reviewer = { id: string; full_name: string; email: string };

export default function PlannedReviewCell({
  serviceUserId,
  plannedDate,
  reviewerId,
  reviewerName,
  reviewers,
  editable,
}: {
  serviceUserId: string;
  plannedDate: string | null;
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
  const [reviewer, setReviewer] = useState(reviewerId ?? "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = plannedDate ? formatDisplayDate(plannedDate) : "—";
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
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left });
    setDate(plannedDate ?? "");
    setReviewer(reviewerId ?? "");
    setOpen(true);
  }

  function submit(clear: boolean) {
    const fd = new FormData();
    fd.set("service_user_id", serviceUserId);
    fd.set("planned_review_date", clear ? "" : date);
    fd.set("planned_reviewer_id", clear ? "" : reviewer);
    setOpen(false);
    startTransition(async () => {
      await bookReview(fd);
      router.refresh();
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
            style={{ position: "fixed", top: coords.top, left: coords.left, width: 240 }}
            className="z-50 flex flex-col gap-3 rounded-xl border border-white/15 bg-navy-900 p-3 shadow-2xl"
          >
            <div>
              <label className="form-label">Review date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Reviewer</label>
              <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
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
                disabled={!date}
                onClick={() => submit(false)}
              >
                Book in
              </button>
              {plannedDate ? (
                <button type="button" className="btn-ghost text-xs" onClick={() => submit(true)}>
                  Clear
                </button>
              ) : null}
            </div>
            <p className="text-[10px] text-white/40">
              The reviewer calendar invite is sent from Phase 6.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
