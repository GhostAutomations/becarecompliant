"use client";

/**
 * Be Care Compliant — Book a formal absence management meeting (Phase 6).
 * Booking is the invitation step: stage, who is holding it (Manager/Admin),
 * date, time and duration, then the employee and the conductor receive the
 * formal letter email with a timed .ics invite. Recording the meeting
 * afterwards (Record meeting) attaches the Evidence to this booking.
 *
 * The form lives in an inner component keyed per open, so reopening after a
 * successful booking always starts clean (a stale success state was closing
 * the dialog instantly: Phil, 2026-07-12).
 *
 * Built like the outcome letter (Phil, 2026-10-08): the details across the top, the letter's words
 * (editable for this one letter) on the left and the real invitation letter PDF on the right,
 * redrawn a second after either changes. Then Save and send (emailed with a
 * calendar invite) or Save and print (kept, opened to print and post or hand over). The person
 * holding the meeting is emailed their invite either way. Nothing is booked until one is pressed,
 * and only once the letter on screen matches the details.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { bookAbsenceMeeting, previewBookingLetterPdf } from "@/lib/absence/actions";
import PolicyReader from "@/components/staff/policy-reader";
import type { ConductorLite, MeetingOffice } from "@/lib/absence/data";

/** Earliest bookable date for the picker: 48 hours from now (server enforces
 *  the exact date + time cutoff). */
function minNoticeDate(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1 hour 30" },
  { value: 120, label: "2 hours" },
];

export default function BookMeetingDialog({
  personId,
  personName,
  defaultStage,
  minStage,
  maxStage,
  conductors,
  offices,
  stageActions = {},
}: {
  personId: string;
  personName: string;
  /** Stage number to "Up to and including" wording from Settings, Absence (Phil, 2026-09-29).
   *  Only stages with an action set appear. */
  stageActions?: Record<number, string>;
  /** Suggested stage from the card's derived position, clamped 1 to 4. */
  defaultStage: number;
  /** Stages below this were already held or booked and are not offered
   *  (Phil, 2026-07-12); the "no further action" reset arrives with meeting
   *  outcomes (Additions). Server enforces the same rule. */
  minStage: number;
  /** Only stages the person's absence level actually calls for are offered
   *  (Phil, 2026-07-12): nothing above their derived stage. */
  maxStage: number;
  /** Active Managers + Admins: the only people who can hold the meeting. */
  conductors: ConductorLite[];
  /** Named offices (company office + branch offices) for the Location. */
  offices: MeetingOffice[];
}) {
  const [openInstance, setOpenInstance] = useState(0);
  /*
   * Stable on purpose. The form's success effect lists onClose and calls router.refresh(); the
   * refresh re-renders this component, so an inline arrow gave a new onClose every time, which re
   * ran the effect, which refreshed again: an endless refresh loop that kept the box open and hit
   * the server until it answered 503 (found live 2026-09-29).
   */
  const close = useCallback(() => setOpenInstance(0), []);
  const open = openInstance > 0;

  return (
    <>
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        onClick={() => setOpenInstance((n) => n + 1)}
      >
        Book meeting
      </button>
      {open &&
        createPortal(
          <BookMeetingForm
            key={openInstance}
            personId={personId}
            personName={personName}
            defaultStage={defaultStage}
            minStage={minStage}
            maxStage={maxStage}
            conductors={conductors}
            offices={offices}
            stageActions={stageActions}
            onClose={close}
          />,
          document.body,
        )}
    </>
  );
}

function toBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** The fields the letter is built from; the preview redraws when any of them changes. */
const LETTER_FIELDS = ["stage", "conducted_by", "meeting_date", "meeting_time", "duration", "location_choice"];

function BookMeetingForm({
  personId,
  personName,
  defaultStage,
  minStage,
  maxStage,
  conductors,
  offices,
  stageActions,
  onClose,
}: {
  personId: string;
  personName: string;
  defaultStage: number;
  minStage: number;
  maxStage: number;
  conductors: ConductorLite[];
  offices: MeetingOffice[];
  stageActions: Record<number, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [stage, setStage] = useState(defaultStage);
  const stageAction = stageActions[stage];

  /* The details at the top; the letter's words on the left (the company's wording, editable for
     this one letter); the real PDF on the right, redrawn a second after either changes (Phil,
     2026-10-08). Until the words are edited they follow the details, so a new date or stage is
     never left behind in them. */
  const [details, setDetails] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [drawnSig, setDrawnSig] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const urlRef = useRef<string | null>(null);

  const [result, setResult] = useState<ActionState>(IDLE_STATE);
  const [saving, startSaving] = useTransition();
  const [savingAs, setSavingAs] = useState<"send" | "print" | null>(null);
  const busy = saving || !!result.ok;

  function readDetails(): string {
    const f = formRef.current;
    if (!f) return "";
    const fd = new FormData(f);
    return LETTER_FIELDS.map((k) => String(fd.get(k) ?? "")).join("|");
  }
  const ready = (() => {
    const [, who, date, , , place] = details.split("|");
    return Boolean(who && date && place);
  })();
  const sig = `${details}#${edited ? body : ""}`;

  /** The details, plus the words when they have been edited. */
  function bookingData(): FormData | null {
    const f = formRef.current;
    if (!f) return null;
    const fd = new FormData(f);
    if (edited && body.trim()) fd.set("letter_body", body);
    return fd;
  }

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const fd = bookingData();
      if (!fd) return;
      setDrawing(true);
      const res = await previewBookingLetterPdf(fd);
      if (cancelled) return;
      setDrawing(false);
      if (res.pdf) {
        const bytes = toBytes(res.pdf);
        setPdfBytes(bytes);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfUrl(url);
        setPdfError(null);
        setEmailTo(res.to ?? null);
        if (!edited && res.standard !== undefined) setBody(res.standard);
        setDrawnSig(sig);
      } else {
        setPdfError(res.error ?? "The letter could not be drawn.");
        setDrawnSig(null);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // The letter on screen matches the details and the words, so saving sends or prints exactly it.
  const current = ready && !drawing && drawnSig === sig && !pdfError;

  /* Both buttons run the booking from this closure, not through an effect: booking moves the
     person's card (Tracking to Action required), which can unmount this box before an effect runs
     (found in Chrome, 2026-10-08). Save and print opens its tab on the click, so it is never
     blocked as a pop up, and points it at the kept letter once the booking is done. */
  function save(delivery: "send" | "print") {
    const fd = bookingData();
    if (!fd || !current) return;
    fd.set("delivery", delivery);
    setResult(IDLE_STATE);
    setSavingAs(delivery);
    const tab = delivery === "print" ? window.open("", "_blank") : null;
    tab?.document.write('<p style="font-family:sans-serif">Preparing the letter…</p>');
    startSaving(async () => {
      const res = await bookAbsenceMeeting(IDLE_STATE, fd);
      if (delivery === "print") {
        if (res.ok && res.data?.letterId) {
          if (tab) tab.location.href = `/api/absence/meeting-letter/${res.data.letterId}`;
        } else {
          tab?.close();
        }
      }
      setResult(res);
    });
  }

  // Close on success and refresh the register (booked meetings advance the stage).
  useEffect(() => {
    if (result.ok) {
      router.refresh();
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [result.ok, router, onClose]);

  const hint = "mt-1 text-[10px] text-white/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[97vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Book meeting: {personName}</h2>
            <p className="mt-1 text-xs text-white/50">
              Fill in the meeting, check the words and the letter, then save and send it or save and print it.
              The person holding the meeting is emailed their invite either way. Nothing is booked until you choose.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" disabled={saving} onClick={onClose}>
            Close
          </button>
        </div>

        {/* The meeting, across the top. */}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          onChange={() => setDetails(readDetails())}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input type="hidden" name="person_id" value={personId} />
          <div>
            <label htmlFor="bm-stage" className="form-label">Stage</label>
            <select
              id="bm-stage"
              name="stage"
              value={String(stage)}
              onChange={(e) => setStage(Number(e.target.value))}
              disabled={busy}
            >
              {([1, 2, 3, 4].filter((s) => s >= minStage && s <= maxStage)).map((s) => (
                <option key={s} value={s}>Stage {s}</option>
              ))}
            </select>
            {stageAction ? (
              <p className={hint}>
                Up to and including <span className="font-semibold text-white/70">{stageAction}</span>.
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="bm-conductor" className="form-label">Who is holding it</label>
            <select id="bm-conductor" name="conducted_by" defaultValue="" required disabled={busy}>
              <option value="" disabled>Choose a Manager or Admin</option>
              {conductors.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.full_name || c.email) + (c.role === "company_admin" ? " (Admin)" : " (Manager)")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bm-date" className="form-label">Date</label>
            <input id="bm-date" name="meeting_date" type="date" min={minNoticeDate()} required disabled={busy} />
            <p className={hint}>At least 48 hours notice.</p>
          </div>
          <div>
            <label htmlFor="bm-time" className="form-label">Time</label>
            <input id="bm-time" name="meeting_time" type="time" defaultValue="10:00" required disabled={busy} />
          </div>
          <div>
            <label htmlFor="bm-duration" className="form-label">Duration</label>
            <select id="bm-duration" name="duration" defaultValue="60" disabled={busy}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bm-location" className="form-label">Location</label>
            <select id="bm-location" name="location_choice" defaultValue="" required disabled={busy}>
              <option value="" disabled>Choose a location</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.hasAddress}>
                  {o.label}{o.hasAddress ? "" : " (no address set)"}
                </option>
              ))}
              <option value="teams">Teams</option>
            </select>
          </div>
        </form>

        {/* The words on the left, the letter on the right (on a phone, the letter underneath). */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor="bm-letter" className="form-label mb-0">The words</label>
              {edited ? (
                <button
                  type="button"
                  className="text-xs text-white/60 underline"
                  disabled={busy}
                  onClick={() => setEdited(false)}
                >
                  Back to the standard wording
                </button>
              ) : null}
            </div>
            {ready ? (
              <>
                <textarea
                  id="bm-letter"
                  className="h-[620px] max-h-[62vh] min-h-72"
                  value={body}
                  disabled={busy || (!edited && !body)}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setEdited(true);
                  }}
                />
                <p className={hint}>
                  The company&apos;s wording from Settings, Letters, for this letter only. Leave a blank line
                  between paragraphs. The meeting details and the absences go in after the first paragraph,
                  from the boxes above.
                  {edited ? " Once you change the words, check them again if you change the details." : null}
                </p>
              </>
            ) : (
              <div className="flex h-[620px] max-h-[62vh] min-h-72 items-center justify-center rounded-lg border border-white/10 p-6 text-center text-sm text-white/50">
                Choose who is holding the meeting, the date and the location, and the words appear here.
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="form-label mb-0">The invitation letter</span>
              <span className="text-xs text-white/50">
                {drawing ? "Updating…" : pdfUrl && current ? (
                  <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
                    Open full size
                  </a>
                ) : null}
              </span>
            </div>
            {pdfUrl && ready ? (
              /* Drawn page by page with pdf.js, the same reader the outcome letter uses: a PDF in a
                 frame is blocked by the site's no framing rule, and an iPhone shows only page one. */
              <div className="h-[620px] max-h-[62vh] min-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
                <PolicyReader key={pdfUrl} url={pdfUrl} data={pdfBytes ?? undefined} onRendered={() => {}} onFailed={() => {}} />
              </div>
            ) : (
              <div className="flex h-[620px] max-h-[62vh] min-h-72 w-full items-center justify-center rounded-lg border border-white/10 p-6 text-center text-sm text-white/50">
                {!ready
                  ? "The letter appears here once the meeting is filled in."
                  : pdfError ?? "Preparing the letter…"}
              </div>
            )}
            {pdfUrl && ready && pdfError ? <p className="form-error mt-2">{pdfError}</p> : null}
          </div>
        </div>

        {/* Centred under both. */}
        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          {current ? (
            <p className="text-xs text-white/60">
              {emailTo
                ? `Save and send emails this letter to ${personName} (${emailTo}).`
                : `${personName} has no email address, so print this letter and post it or hand it over.`}
            </p>
          ) : null}
          {result.error ? <p className="form-error">{result.error}</p> : null}
          {result.ok ? <p className="text-sm text-emerald-300">{result.ok}</p> : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {emailTo || !current ? (
              <button type="button" className="btn-primary text-xs" disabled={!current || busy} onClick={() => save("send")}>
                {saving && savingAs === "send" ? "Sending…" : "Save and send"}
              </button>
            ) : null}
            <button
              type="button"
              className={emailTo || !current ? "btn-outline text-xs" : "btn-primary text-xs"}
              disabled={!current || busy}
              onClick={() => save("print")}
            >
              {saving && savingAs === "print" ? "Saving…" : "Save and print"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
