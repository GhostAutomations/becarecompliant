"use client";

import { useActionState, useEffect, useState } from "react";
import { recordOutcomesReview } from "@/lib/service-users/outcomes-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { REVIEW_RAG_PILL, type ReviewRag } from "@/lib/service-users/outcome-consts";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type ReviewHistory = { id: string; reviewed_at: string; reviewer_name: string | null; note: string | null };

export default function OutcomesReviewPanel({
  serviceUserId,
  rag,
  ragLabel,
  dueIso,
  intervalMonths,
  reviews,
  hasOutcomes,
}: {
  serviceUserId: string;
  rag: ReviewRag;
  ragLabel: string;
  dueIso: string | null;
  intervalMonths: number;
  reviews: ReviewHistory[];
  hasOutcomes: boolean;
}) {
  const [state, formAction, pending] = useActionState(recordOutcomesReview, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (state.ok && !pending) {
      flash();
      setNote("");
    }
  }, [state, pending, flash]);
  const showSaved = saved && !pending;

  return (
    <section className="glass-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white/80">Outcomes review</h2>
          <p className="text-xs text-white/45">
            Reviewed every {intervalMonths} month{intervalMonths === 1 ? "" : "s"}. Next due {fmt(dueIso)}.
          </p>
        </div>
        <span className={`pill ${REVIEW_RAG_PILL[rag]}`}>{ragLabel}</span>
      </div>

      {hasOutcomes ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="service_user_id" value={serviceUserId} />
          <div>
            <label className="form-label">Review note (optional)</label>
            <textarea
              name="note"
              value={note}
              onChange={(e) => {
                reset();
                setNote(e.target.value);
              }}
              rows={2}
              placeholder="What was discussed, any changes to what matters to this person."
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={`btn ${showSaved ? "btn-saved" : "btn-primary"}`}>
              {pending ? "Recording…" : showSaved ? "Review recorded" : "Record review"}
            </button>
            <span className="text-xs text-white/45">
              Stamps every outcome as reviewed today and stores an evidence snapshot.
            </span>
          </div>
          {state.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
        </form>
      ) : (
        <p className="text-sm text-white/50">Add at least one personal outcome before recording a review.</p>
      )}

      {reviews.length > 0 ? (
        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-white/60 hover:text-white/90"
          >
            {showHistory ? "Hide" : "Show"} review history ({reviews.length})
          </button>
          {showHistory ? (
            <ul className="mt-3 space-y-2">
              {reviews.map((rv) => (
                <li key={rv.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/80">{fmt(rv.reviewed_at)}</span>
                    <span className="text-xs text-white/45">{rv.reviewer_name ?? "—"}</span>
                  </div>
                  {rv.note ? <p className="mt-1 text-xs text-white/55">{rv.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
