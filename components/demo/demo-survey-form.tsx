"use client";

import { useActionState, useState } from "react";
import RatingStars from "@/components/forms/rating-stars";
import { DEMO_SURVEY_RATINGS } from "@/lib/demo/rules";
import { submitDemoFeedback, type DemoFeedbackState } from "@/lib/demo/feedback-actions";
import { submitKeepingTyped } from "@/components/forms/keep-typed";

/* The demo survey (Phil, 2026-09-30): seven scores out of five, then what they liked, what they
   did not, and what we could do better. One form for the in-app link and the emailed link. */
export default function DemoSurveyForm({ token, via }: { token: string; via: "app" | "email" }) {
  const [state, action, pending] = useActionState<DemoFeedbackState, FormData>(submitDemoFeedback, {});
  const [scores, setScores] = useState<Record<string, number>>({});

  if (state.ok) {
    return (
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white">Thank you</h2>
        <p className="mt-2 text-sm text-white/70">
          Your answers have been sent. They go straight to the person who set up your demo, and
          they help us make Be Care Compliant better for every care provider.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submitKeepingTyped(action)} className="glass-card space-y-6 p-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="via" value={via} />
      <div>
        <h2 className="text-sm font-semibold text-white/80">Score each one out of 5</h2>
        <p className="form-hint">1 is poor, 5 is excellent.</p>
      </div>
      <div className="space-y-4">
        {DEMO_SURVEY_RATINGS.map((q) => (
          <div key={q.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <span className="text-sm text-white/85">{q.label}</span>
            <RatingStars
              value={scores[q.key] ?? 0}
              max={5}
              disabled={pending}
              onValue={(v) => setScores((s) => ({ ...s, [q.key]: v }))}
            />
            <input type="hidden" name={q.key} value={scores[q.key] ? String(scores[q.key]) : ""} />
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="liked" className="form-label">What did you like?</label>
        <textarea id="liked" name="liked" rows={3} maxLength={4000} />
      </div>
      <div>
        <label htmlFor="disliked" className="form-label">What did you not like?</label>
        <textarea id="disliked" name="disliked" rows={3} maxLength={4000} />
      </div>
      <div>
        <label htmlFor="better" className="form-label">Anything we could do better?</label>
        <textarea id="better" name="better" rows={3} maxLength={4000} />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-300">{state.error}</p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send my answers"}
      </button>
    </form>
  );
}
