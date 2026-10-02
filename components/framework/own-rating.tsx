"use client";

/**
 * The manager's own rating of a theme (0374, Phil 2026-10-02): "Your rating: Good (set by Lauren,
 * 1 Oct)" with a button to change it, choosing with CIW's own descriptors. The app shows the
 * evidence and never predicts the inspector's word (Phil, 2026-09-19); this is the manager's
 * judgement, recorded with who and when, and carried into the Reg 80 report.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { CentreDialog } from "@/components/panel-dialog";
import { setSelfRating } from "@/lib/framework/self-rating-actions";
import { CIW_DESCRIPTORS, RATING_LEVELS, ratingLabel, ratingTone, type Regulator } from "@/lib/framework/ratings";

const TONE_PILL = { green: "pill-green", amber: "pill-amber", red: "pill-red" } as const;

export type OwnRatingView = { rating: string; note: string | null; setByName: string; createdAt: string };

function when(ts: string): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

export default function OwnRating({
  regulator,
  code,
  title,
  branchId,
  latest,
  history,
  canRate,
  priorityOpen,
}: {
  regulator: Regulator;
  code: string;
  title: string;
  branchId: string | null;
  latest: OwnRatingView | null;
  history: OwnRatingView[];
  canRate: boolean;
  priorityOpen: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(latest?.rating ?? "");
  const close = useCallback(() => setOpen(false), []);
  const tone = latest ? ratingTone(regulator, latest.rating) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
      {latest ? (
        <>
          <span>Your rating:</span>
          <span className={`pill ${tone ? TONE_PILL[tone] : "pill-neutral"}`}>{ratingLabel(regulator, latest.rating)}</span>
          <span>
            (set by {latest.setByName}, {when(latest.createdAt)})
          </span>
        </>
      ) : (
        <span>Your rating: not rated yet</span>
      )}
      {canRate ? (
        <button
          type="button"
          className="btn-outline btn-xs"
          onClick={() => {
            setChoice(latest?.rating ?? "");
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          {latest ? "Change rating" : "Rate this theme"}
        </button>
      ) : null}

      <CentreDialog open={open} onClose={close} label={`Your rating: ${title}`}>
        <div className="space-y-4 p-5">
          <p className="text-sm text-white/70">
            Choose the rating that best fits the evidence for {title}, on balance.{" "}
            {regulator === "ciw"
              ? "The descriptions are CIW's own. CIW invites services to rate themselves this way, and the inspector makes their own judgement at inspection."
              : "The inspector makes their own judgement at inspection."}
          </p>
          {priorityOpen > 0 && regulator === "ciw" ? (
            <p className="text-sm text-amber-300">
              This theme has an open Priority Action Notice. CIW&apos;s framework says a theme with one must be rated
              Requires significant improvement.
            </p>
          ) : null}
          <ActionForm
            action={setSelfRating}
            hidden={{ requirement_code: code, branch_id: branchId ?? "" }}
            label="Save rating"
            className="space-y-3"
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="sr-only">Rating</legend>
              {RATING_LEVELS[regulator].map((l) => (
                <label
                  key={l.value}
                  className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 text-sm ${
                    choice === l.value ? "border-gold-400/60 bg-gold-400/10" : "border-white/10 bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={l.value}
                    checked={choice === l.value}
                    onChange={() => setChoice(l.value)}
                    required
                  />
                  <span>
                    <span className="font-semibold text-white">{l.label}</span>
                    {regulator === "ciw" && CIW_DESCRIPTORS[l.value] ? (
                      <span className="mt-0.5 block text-white/65">{CIW_DESCRIPTORS[l.value]}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor={`own_note_${code}`} className="form-label">
                Why (optional)
              </label>
              <textarea
                id={`own_note_${code}`}
                name="note"
                rows={2}
                maxLength={1000}
                defaultValue=""
                placeholder="For example, what the evidence shows and what you are doing about the gaps."
              />
            </div>
          </ActionForm>

          {latest || history.length > 0 ? (
            <div className="border-t border-white/10 pt-3">
              <h3 className="text-xs font-semibold text-white/80">Rating history</h3>
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                {[latest, ...history].filter((h): h is OwnRatingView => !!h).map((h, i) => (
                  <li key={`${h.createdAt}-${i}`}>
                    {ratingLabel(regulator, h.rating)}, set by {h.setByName}, {when(h.createdAt)}
                    {h.note ? `: ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </CentreDialog>
    </div>
  );
}
