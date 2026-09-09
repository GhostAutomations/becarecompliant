"use client";

/**
 * Be Care Compliant -- a folded section that opens in the middle of the screen.
 *
 * WHY (Phil, 2026-09-09): "when someone clicks on the evidence history, history and manage
 * record dont have them as a drop down, have them as a pop up in the centre of the screen."
 *
 * These three are the long ones. Opened in place, Evidence history unrolled forty rows and
 * Manage record unrolled an entire edit form, pushing everything below them down the page and
 * leaving the person to scroll back up to find where they had been. Now they are the same
 * card, and clicking one puts its content in the middle of the screen with the record still
 * behind it.
 *
 * The trigger keeps the closed <summary> look exactly -- same padding, same weight, same hover
 * -- so a row of three reads as it did before anybody clicked.
 *
 * Escape closes it, the backdrop closes it, and the body stops scrolling while it is open so
 * the page behind does not slide about under the dialog.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function PanelDialog({
  title,
  count,
  children,
}: {
  title: string;
  /** Shown after the title, as the folded version showed it. */
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const label = `${title}${count && count > 0 ? ` (${count})` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="glass-card section-card flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left text-sm font-semibold text-white/90 hover:bg-white/5"
      >
        <span>{label}</span>
        <span aria-hidden className="text-white/40">
          &rsaquo;
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
              onClick={() => setOpen(false)}
              role="presentation"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                /* Wide, because what goes in here is a table of evidence or a full edit form,
                   and the whole point of moving it out of the page was to stop it being
                   squeezed into a third of a row. */
                className="glass-card my-auto w-full max-w-4xl"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <h2 className="text-sm font-semibold text-white">{label}</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-[75vh] overflow-y-auto">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
