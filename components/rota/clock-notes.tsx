"use client";

/**
 * Be Care Compliant: care notes and concerns on a visit card, on the carer's Clock in page (Rota and
 * Visits Stage 5, Phil's popups 2026-10-16; docs/decisions/rota-visits.md, Stage 5 decisions).
 *
 *  - Pinned notes ("Pin Note (48hrs)") from other visits, at the top for 48 hours.
 *  - The carer's own notes on this visit; a sent note is never edited, "Correct this note" writes a
 *    new note linked to it.
 *  - Notes for this service user from the last 24 hours, folded away (Phil, 2026-10-16).
 *  - Raise a concern: the type (the incident types) and what it is; the office is told and decides
 *    whether an incident form is needed.
 *
 * Everything is saved on the phone first and sent when there is signal, like clock taps.
 */

import { useState } from "react";
import { CentreDialog } from "@/components/panel-dialog";
import { azOtherLast } from "@/lib/rota/az";
import { CONCERN_STATUS_WORDS, CONCERN_TYPES, NOTE_MAX, concernProblem, noteProblem, type CardNotes, type ShownNote } from "@/lib/rota/notes";

export type SaveNote = (body: string, forNextCarer: boolean, correctsEventId: string | null) => Promise<void>;
export type SaveConcern = (category: string, body: string) => Promise<void>;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function when(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return `${day}, ${hhmm(iso)}`;
}

function NoteLine({ n, onCorrect }: { n: ShownNote; onCorrect?: () => void }) {
  return (
    <li className="rounded-lg bg-white/5 px-3 py-2">
      <p className="text-xs text-white/55">
        {n.mine ? hhmm(n.at) : `${n.author}, ${when(n.at)}`}
        {n.forNextCarer ? " · pinned" : ""}
        {n.correctsAt ? ` · correction to the ${hhmm(n.correctsAt)} note` : ""}
        {n.waiting ? " · waiting to send" : ""}
      </p>
      <p className={`whitespace-pre-wrap text-sm ${n.correctedAt ? "text-white/50" : "text-white/90"}`}>{n.body}</p>
      {n.correctedAt ? <span className="pill pill-amber mt-1 inline-block">Corrected at {hhmm(n.correctedAt)}</span> : null}
      {onCorrect && !n.correctedAt ? (
        <button type="button" className="btn-ghost mt-1 px-2 py-1 text-xs" onClick={onCorrect}>
          Correct this note
        </button>
      ) : null}
    </li>
  );
}

export default function VisitNotesPanel({
  card,
  canWrite,
  onNote,
  onConcern,
}: {
  card: CardNotes;
  /** The visit is open or the carer has clocked in: they may write. */
  canWrite: boolean;
  onNote: SaveNote;
  onConcern: SaveConcern;
}) {
  const [text, setText] = useState("");
  const [forNext, setForNext] = useState(false);
  const [correcting, setCorrecting] = useState<ShownNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concernOpen, setConcernOpen] = useState(false);
  const problem = noteProblem(text);

  async function save() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onNote(text.trim(), correcting ? false : forNext, correcting?.eventId ?? null);
      setText("");
      setForNext(false);
      setCorrecting(null);
      setSaved(true);
    } catch {
      // Kept as typed: nothing is cleared unless it was saved.
      setError("The note could not be saved on this phone. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const hasAnything = card.handover.length + card.mine.length + card.earlier.length + card.concerns.length > 0;
  if (!canWrite && !hasAnything) return null;

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-2" aria-label="Care notes">
      {card.handover.length ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs font-semibold text-amber-200">Pinned notes</p>
          <ul className="space-y-1.5">
            {card.handover.map((n) => (
              <NoteLine key={n.key} n={n} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs font-semibold text-white/75">Your notes for this visit</p>
      {card.mine.length ? (
        <ul className="space-y-1.5">
          {card.mine.map((n) => (
            <NoteLine
              key={n.key}
              n={n}
              onCorrect={
                canWrite
                  ? () => {
                      setCorrecting(n);
                      setSaved(false);
                      setError(null);
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/45">No note yet.</p>
      )}

      {canWrite ? (
        <div className="space-y-2">
          {correcting ? (
            <p className="text-xs text-amber-200">
              Correcting your {hhmm(correcting.at)} note. The first note stays, marked as corrected.{" "}
              <button type="button" className="btn-ghost px-1 py-0.5 text-xs" onClick={() => setCorrecting(null)}>
                Cancel
              </button>
            </p>
          ) : null}
          <textarea
            rows={4}
            maxLength={NOTE_MAX}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder={correcting ? "Write the correction" : "How the visit went: what you did, how they were, anything the office or the next carer should know"}
            aria-label={correcting ? "Correction" : "Care note"}
          />
          {!correcting ? (
            <label className="flex items-center gap-2 text-xs text-white/80">
              <input type="checkbox" checked={forNext} onChange={(e) => setForNext(e.target.checked)} />
              Pin Note (48hrs)
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={saved && !text ? "btn-saved px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
              disabled={saving || (!text.trim() && !saved)}
              onClick={save}
            >
              {saving ? "Saving…" : saved && !text ? "Saved" : correcting ? "Save correction" : "Save note"}
            </button>
            <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setConcernOpen(true)}>
              Raise a concern
            </button>
            {error ? <span className="text-xs text-red-300">{error}</span> : null}
          </div>
          <p className="text-[11px] text-white/40">A saved note cannot be changed. To put something right, use Correct this note.</p>
        </div>
      ) : null}

      {card.concerns.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-white/75">Concerns you raised</p>
          <ul className="space-y-1.5">
            {card.concerns.map((c) => (
              <li key={c.key} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-xs text-white/60">
                  {hhmm(c.at)} · {c.category} · {c.waiting ? "waiting to send" : CONCERN_STATUS_WORDS[c.status] ?? c.status}
                </p>
                <p className="whitespace-pre-wrap text-sm text-white/90">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.earlier.length ? (
        <details className="rounded-lg bg-white/5 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-white/75">Notes from the last 24 hours ({card.earlier.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {card.earlier.map((n) => (
              <NoteLine key={n.key} n={n} />
            ))}
          </ul>
        </details>
      ) : null}

      <ConcernDialog open={concernOpen} onClose={() => setConcernOpen(false)} onConcern={onConcern} />
    </div>
  );
}

function ConcernDialog({ open, onClose, onConcern }: { open: boolean; onClose: () => void; onConcern: SaveConcern }) {
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = concernProblem(category, body);

  async function raise() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConcern(category, body.trim());
      setCategory("");
      setBody("");
      onClose();
    } catch {
      setError("The concern could not be saved on this phone. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CentreDialog open={open} onClose={onClose} label="Raise a concern">
      <div className="space-y-3 p-5">
        <p className="text-sm text-white/75">
          Tell the office about something that worries you. Your supervisor is told and decides whether an incident form is needed. If someone is in danger, call 999
          first.
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-white/70">What kind of concern is it?</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of concern">
            <option value="">Pick one…</option>
            {azOtherLast(CONCERN_TYPES, (c) => c).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/70">What is the concern?</span>
          <textarea rows={5} maxLength={NOTE_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What you saw or were told, and what you did" />
        </label>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <button type="button" className="btn-primary w-full px-4 py-3 text-base" disabled={saving} onClick={raise}>
          {saving ? "Saving…" : "Raise the concern"}
        </button>
      </div>
    </CentreDialog>
  );
}
