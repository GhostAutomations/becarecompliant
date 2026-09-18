"use client";

/**
 * Be Care Compliant — the one piece of wiring that keeps a part-finished Form.
 *
 * Every Form in the product is rendered by the same FormRenderer, so drafting is
 * built once here and handed to each of the places that mount one. It is the On
 * Call Handover's behaviour exactly: save a second after the last keystroke, hand
 * it back for twelve hours, throw it away the moment the form is filed.
 *
 * Two ways in, because there are two shapes of form:
 *  - a COMPLETION PAGE reads the draft on the server and passes it as `initial`.
 *    The form opens already filled in, with nothing to wait for.
 *  - a SLIDE-OVER has no server render of its own, so it omits `initial` and the
 *    draft is fetched when the dialog opens. The dialog holds its content back
 *    until `ready`, so nobody can type into a form that is about to be replaced.
 *
 * `version` is bumped when a draft lands, and the caller uses it as the renderer's
 * React key: FormRenderer takes `defaultValue` once, on mount, so restoring means
 * mounting it again.
 *
 * WHAT A DRAFT DOES NOT HOLD: a chosen file. The answers keep the file's NAME (that
 * is all the renderer ever puts in them) but the file itself is never uploaded until
 * the form is submitted, so a restored draft asks for the attachment again.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Answers } from "@/lib/form-schema";
import { clearFormDraft, loadFormDraft, saveFormDraft } from "@/lib/forms/drafts";

export type FormDraftHandle = {
  /** The draft (if any) has been settled: safe to render the form. */
  ready: boolean;
  /** What was handed back, or null. */
  restored: Answers | null;
  /** Bumped when a draft lands; use as the renderer's key. */
  version: number;
  /** Call on every answer change. Debounced by a second. */
  record: (answers: Answers) => void;
  /** Call when the form is filed or deliberately abandoned. */
  discard: () => void;
};

export function useFormDraft(opts: {
  /** null turns drafting off entirely (an edit, a preview, a public form). */
  key: string | null;
  /** Server-read draft. undefined means "fetch it here". */
  initial?: Answers | null;
  /** Only load and save while true -- a dialog that is open. */
  active?: boolean;
}): FormDraftHandle {
  const { key, initial, active = true } = opts;
  const serverRead = initial !== undefined;

  const [restored, setRestored] = useState<Answers | null>(serverRead ? (initial ?? null) : null);
  const [ready, setReady] = useState(!key || serverRead);
  const [version, setVersion] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(!key || serverRead);
  const finished = useRef(false);
  const fetchedFor = useRef<string | null>(null);

  // Fetch the draft once per key, for the dialogs. A completion page has already
  // been handed one by the server and never comes through here.
  useEffect(() => {
    if (serverRead || !key || !active) return;
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;
    finished.current = false;
    setReady(false);
    readyRef.current = false;
    let live = true;
    const settle = (answers: Answers | null) => {
      if (!live) return;
      if (answers && Object.keys(answers).length > 0) {
        setRestored(answers);
        setVersion((v) => v + 1);
      }
      setReady(true);
      readyRef.current = true;
    };
    void loadFormDraft(key).then(settle, () => settle(null));
    return () => {
      live = false;
    };
  }, [key, active, serverRead]);

  // Never leave a save pending against a form that is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const record = useCallback(
    (answers: Answers) => {
      if (!key || !active || finished.current || !readyRef.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void saveFormDraft(key, answers);
      }, 1000);
    },
    [key, active],
  );

  const discard = useCallback(() => {
    if (!key) return;
    finished.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void clearFormDraft(key);
    /* Forget it here too. A slide-over is not unmounted when it closes, so the next
       time it is opened it must show an EMPTY form and not the answers that have just
       been filed. Bumping the version remounts the renderer on the cleared defaults;
       clearing the fetch marker lets a reopen look again. */
    fetchedFor.current = null;
    setRestored(null);
    setVersion((v) => v + 1);
  }, [key]);

  return { ready, restored, version, record, discard };
}
