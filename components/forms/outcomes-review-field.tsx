"use client";

/**
 * Be Care Compliant: the Outcomes section of the Individual Plan Review (Phil, 2026-10-05).
 *
 * The person's current outcomes are already here, filled in from their Outcomes page, so the
 * reviewer never retypes one. Two answers each, then one question about a new outcome. Kept
 * short on purpose: "we dont want this section to be too long".
 *
 * Rules and wording of the errors: lib/service-users/outcomes-review.ts.
 */

import {
  REVIEW_PROGRESS,
  parseOutcomesReview,
  NEW_OUTCOME_QUESTION,
  settingNew,
  type OutcomesReviewValue,
  type ReviewProgress,
} from "@/lib/service-users/outcomes-review";

function ukDay(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OutcomesReviewField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: OutcomesReviewValue) => void;
}) {
  const v = parseOutcomesReview(value);
  const set = (patch: Partial<OutcomesReviewValue>) => onChange({ ...v, ...patch });
  const setLine = (i: number, patch: { progress?: ReviewProgress | ""; note?: string }) =>
    set({ current: v.current.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const none = v.current.length === 0;

  return (
    <div className="space-y-3">
      {none ? (
        <p className="text-sm text-white/60">
          This person has no outcomes on their record yet.
        </p>
      ) : (
        v.current.map((l, i) => (
          <div key={l.id} className="rounded-xl border border-white/10 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">{l.title}</p>
              {l.target ? <p className="text-xs text-white/50">Target date {ukDay(l.target)}</p> : null}
            </div>
            <div>
              <label htmlFor={`${id}-p${i}`} className="form-label">
                Progress since the last review <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
              </label>
              <select
                id={`${id}-p${i}`}
                value={l.progress}
                disabled={disabled}
                onChange={(e) => setLine(i, { progress: e.target.value as ReviewProgress | "" })}
              >
                <option value="">Please choose</option>
                {REVIEW_PROGRESS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {l.progress === "achieved" ? (
                <p className="form-hint">This outcome will move to Achieved on their Outcomes page.</p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`${id}-n${i}`} className="form-label">
                What has helped, or got in the way? <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
              </label>
              <textarea
                id={`${id}-n${i}`}
                rows={2}
                value={l.note}
                disabled={disabled}
                onChange={(e) => setLine(i, { note: e.target.value })}
              />
            </div>
          </div>
        ))
      )}

      {(
        <div>
          <label htmlFor={`${id}-add`} className="form-label">
            {NEW_OUTCOME_QUESTION} <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
          </label>
          <select
            id={`${id}-add`}
            value={v.add}
            disabled={disabled}
            onChange={(e) => set({ add: e.target.value as OutcomesReviewValue["add"] })}
          >
            <option value="">Please choose</option>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>
      )}

      {settingNew(v) ? (
        <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">New outcome</p>
          <div>
            <label htmlFor={`${id}-t`} className="form-label">
              What matters to you? <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
            </label>
            <input
              id={`${id}-t`}
              type="text"
              value={v.newTitle}
              disabled={disabled}
              placeholder="For example, to walk to the shop with support"
              onChange={(e) => set({ newTitle: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-s`} className="form-label">
              How will we support it? <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${id}-s`}
              rows={2}
              value={v.newSupport}
              disabled={disabled}
              onChange={(e) => set({ newSupport: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-d`} className="form-label">
              Target date <span className="ml-1 text-gold-300" aria-hidden="true">*</span>
            </label>
            <input
              id={`${id}-d`}
              type="date"
              value={v.newTarget}
              disabled={disabled}
              onChange={(e) => set({ newTarget: e.target.value })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
