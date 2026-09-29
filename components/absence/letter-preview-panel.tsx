"use client";

/**
 * Be Care Compliant — the letters, shown for approval before they go (Phil, 2026-09-29).
 * Used by Book meeting, Rearrange and Cancel. Read only: each email is shown whole, exactly as
 * the server built it, one tab per recipient. Wording is changed in Settings, Letters, never
 * here. Nothing is sent until Approve and send; Back returns to the details with them kept.
 */

import { useState } from "react";
import { inertEmailHtml, notSentReason, type LetterPreview } from "@/lib/absence/letter-preview";

export default function LetterPreviewPanel({
  letters,
  intro,
  approveLabel,
  workingLabel,
  pending,
  error,
  ok,
  onBack,
  onApprove,
  onClose,
}: {
  letters: LetterPreview[];
  intro: string;
  approveLabel: string;
  workingLabel: string;
  pending: boolean;
  error?: string;
  ok?: string;
  onBack: () => void;
  onApprove: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(0);
  const letter = letters[shown] ?? letters[0];
  const sendable = letters.filter((l) => l.to).length;
  const reason = letter ? notSentReason(letter) : null;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-white/60">{intro}</p>

      {letters.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose which letter to read">
          {letters.map((l, i) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setShown(i)}
              aria-pressed={i === shown}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                i === shown ? "bg-gold-400/20 text-white" : "bg-white/5 text-white/60"
              }`}
            >
              {l.who}: {l.name}
            </button>
          ))}
        </div>
      ) : null}

      {letter ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-white/45">To</dt>
            <dd className="break-all text-white/85">
              {letter.to ? `${letter.name} (${letter.to})` : `${letter.name}: not sent`}
            </dd>
            <dt className="text-white/45">Subject</dt>
            <dd className="text-white/85">{letter.subject}</dd>
            {letter.note ? (
              <>
                <dt className="text-white/45">Attached</dt>
                <dd className="text-white/85">{letter.note}</dd>
              </>
            ) : null}
          </dl>
          {reason ? <p className="mt-3 text-xs text-amber-200">{reason}</p> : null}
          {letter.html ? (
            <iframe
              title={`The email to ${letter.name}`}
              sandbox=""
              srcDoc={inertEmailHtml(letter.html)}
              className="mt-3 h-[50vh] min-h-72 w-full rounded-lg border border-white/10 bg-navy-950"
            />
          ) : null}
        </div>
      ) : null}

      <p className="text-[10px] text-white/40">
        This is read only. To change the wording, use Settings, Letters.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-300">{ok}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary text-xs" disabled={pending || !!ok} onClick={onApprove}>
            {pending ? workingLabel : sendable > 0 ? approveLabel : approveLabel.replace(/ and send$/, "")}
          </button>
          <button type="button" className="btn-outline text-xs" disabled={pending || !!ok} onClick={onBack}>
            Back
          </button>
        </div>
        <button type="button" className="btn-ghost text-xs" disabled={pending} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
