/**
 * Be Care Compliant: the homepage scenes' styles (Phil, 2026-10-14).
 *
 * INLINE, NOT A STYLESHEET FILE. As a CSS module these were a second stylesheet the browser had
 * to fetch before it could draw anything, and first paint moved from 0.9s to 1.2s (Lighthouse,
 * mobile). Written into the homepage itself instead (app/page.tsx renders SCENES_CSS once), so
 * there is nothing extra to fetch. Every class and animation is prefixed hs- (homepage scene)
 * and the styles exist only in the homepage's own document, so nothing in the app can pick one
 * up. The site's content security policy allows inline styles (lib/supabase/middleware.ts).
 *
 * The scenes reuse the app's own classes (.matrix, .rag-cell, .pill-*, .done-late, .btn-primary)
 * read only, so they always look like the real screens.
 *
 * HOW A STORY RUNS. The markup is drawn in its FINAL state, which is what a reader with reduced
 * motion, no script or a slow phone sees. While a story is on screen the player loops it:
 * "fadeOut" (the picture fades), "armed" (the opening frame fades in), "run" (each step animates
 * from the opening frame to the final one, at its own delay, and holds), "done" (held, then again). Only opacity
 * and transform move, so nothing reflows: a value that changes is two layers stacked in one grid
 * cell, the old one fading out as the new one fades in, and the cell is already as wide as the
 * wider of the two.
 */

export { s } from "./class-names";

export const SCENES_CSS = `
/* ---- The story frame ---------------------------------------------------------------------- */

.hs-story {
  position: relative;
}

/* While off screen part way through, everything holds where it is. */
/* The whole picture fades out before each new pass and back in on the opening frame, so the loop
   never jumps from the finished picture straight to the start. */
.hs-stage {
  transition: opacity 300ms ease;
}
.hs-story[data-state="fadeOut"] .hs-stage {
  opacity: 0;
}

/* ---- Stacked layers: a value that changes without moving anything ------------------------- */

.hs-swap {
  display: inline-grid;
  justify-items: center;
  align-items: center;
}
.hs-swapStart {
  justify-items: start;
}
.hs-swap > * {
  grid-area: 1 / 1;
}

/* FINAL state (default): the "after" layer shows, the "before" layer is hidden. */
.hs-before {
  opacity: 0;
}
.hs-after {
  opacity: 1;
}
.hs-appear {
  opacity: 1;
  transform: none;
}
.hs-leave {
  opacity: 0;
}

/* ARMED: the opening frame, held still. */
.hs-story[data-state="armed"] .hs-before {
  opacity: 1;
}
.hs-story[data-state="armed"] .hs-after {
  opacity: 0;
}
.hs-story[data-state="armed"] .hs-appear {
  opacity: 0;
  transform: translateY(10px);
}
.hs-story[data-state="armed"] .hs-leave {
  opacity: 1;
}

/* RUN: each layer animates at its own delay (--d) and holds the end. */
.hs-story[data-state="run"] .hs-before {
  animation: hs-fadeOut 400ms cubic-bezier(0.4, 0, 0.2, 1) var(--d, 0ms) both;
}
.hs-story[data-state="run"] .hs-after {
  animation: hs-fadeIn 450ms cubic-bezier(0.2, 0, 0, 1) var(--d, 0ms) both;
}
.hs-story[data-state="run"] .hs-appear {
  animation: hs-rise 500ms cubic-bezier(0.2, 0, 0, 1) var(--d, 0ms) both;
}
.hs-story[data-state="run"] .hs-leave {
  animation: hs-fadeOut 400ms cubic-bezier(0.4, 0, 0.2, 1) var(--d, 0ms) both;
}

/* A figure that counts down: the old one lifts away, the new one rises into its place. */
.hs-story[data-state="armed"] .hs-countOld {
  opacity: 1;
  transform: none;
}
.hs-story[data-state="armed"] .hs-countNew {
  opacity: 0;
  transform: translateY(40%);
}
.hs-countOld {
  opacity: 0;
  transform: translateY(-40%);
}
.hs-countNew {
  opacity: 1;
  transform: none;
}
.hs-story[data-state="run"] .hs-countOld {
  animation: hs-countOut 450ms cubic-bezier(0.4, 0, 0.2, 1) var(--d, 0ms) both;
}
.hs-story[data-state="run"] .hs-countNew {
  animation: hs-countIn 500ms cubic-bezier(0.2, 0, 0, 1) var(--d, 0ms) both;
}

/* A button being pressed: a short squeeze, then back. */
.hs-story[data-state="run"] .hs-press {
  animation: hs-press 260ms ease-in-out var(--d, 0ms) both;
}

/* A soft highlight that passes over a changed row and fades. Final state: gone. */
.hs-glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(251, 191, 36, 0.1);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.35);
  opacity: 0;
  pointer-events: none;
}
.hs-story[data-state="run"] .hs-glow {
  animation: hs-glow 1600ms ease-in-out var(--d, 0ms) both;
}

/* A card that comes in, does its job and goes. Final state: gone. */
.hs-visit {
  /* Above the matrix's sticky headings (z-index 20 and 30 in the app's .matrix th). */
  z-index: 40;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  pointer-events: none;
}
.hs-story[data-state="armed"] .hs-visit {
  opacity: 0;
}
.hs-story[data-state="run"] .hs-visit {
  animation: hs-visit var(--len, 1800ms) cubic-bezier(0.2, 0, 0, 1) var(--d, 0ms) both;
}

@keyframes hs-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes hs-fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes hs-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@keyframes hs-countOut {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(-40%); }
}
@keyframes hs-countIn {
  from { opacity: 0; transform: translateY(40%); }
  to { opacity: 1; transform: none; }
}
@keyframes hs-press {
  0%, 100% { transform: none; }
  50% { transform: scale(0.95); }
}
@keyframes hs-glow {
  0% { opacity: 0; }
  25% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes hs-visit {
  0% { opacity: 0; transform: translateY(8px) scale(0.98); }
  18% { opacity: 1; transform: none; }
  82% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-6px) scale(0.99); }
}

/* Reduced motion: the final frame, no movement at all. The player never arms, and in case a
   state was set anyway, every animation is switched off and the final styles apply. */
@media (prefers-reduced-motion: reduce) {
  .hs-story * {
    animation: none !important;
    transition: none !important;
  }
  .hs-story .hs-before,
  .hs-story .hs-leave,
  .hs-story .hs-countOld,
  .hs-story .hs-visit,
  .hs-story .hs-glow {
    opacity: 0 !important;
  }
  .hs-story .hs-after,
  .hs-story .hs-appear,
  .hs-story .hs-countNew {
    opacity: 1 !important;
    transform: none !important;
  }
  .hs-stage {
    opacity: 1 !important;
  }
}

/* ---- Scene furniture ---------------------------------------------------------------------- */

/* The app window a scene sits in: the app's own navy, a hairline, no fake browser chrome. */
.hs-frame {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(135deg, #081231, #0d1d4b 60%, #14306b);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  text-align: left;
}

/* The matrix inside a scene: the app's table, never wider than its frame, with a fade at the
   right edge on a narrow screen to say "there is more" instead of a scroll bar. */
.hs-matrixClip {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(13, 29, 75, 0.4);
}
.hs-matrixClip table {
  width: 100%;
}
.hs-matrixClip::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2.5rem;
  background: linear-gradient(to right, rgba(13, 29, 75, 0), rgba(13, 29, 75, 0.9));
  pointer-events: none;
}
@media (min-width: 1280px) {
  .hs-matrixClip::after {
    display: none;
  }
}

/* A little less padding in a scene's matrix than in the app, so the columns that tell the story
   fit a half width card and a phone. Same labels, same cells, same order. */
.hs-compact th,
.hs-compact td {
  padding-left: 0.6rem;
  padding-right: 0.6rem;
}
/* The lead story sits in half a page: its headings take two lines at every width. */
.hs-wrapHead th {
  white-space: normal;
  line-height: 1.25;
}
@media (min-width: 640px) {
  .hs-wrapHead th {
    min-width: 5.5rem;
  }
}

/* On a phone the headings may take two lines ("Supervision 2 / Due"), so four columns fit. */
@media (max-width: 639px) {
  .hs-compact th {
    white-space: normal;
    line-height: 1.25;
  }
  .hs-compact th,
  .hs-compact td {
    padding-left: 0.35rem;
    padding-right: 0.35rem;
  }
  .hs-compact th {
    min-width: 4rem;
  }
  .hs-compact td {
    font-size: 0.75rem;
  }
}

/* A phone, drawn simply: for the Return to Work text. */
.hs-phone {
  border-radius: 1.75rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #081231;
  padding: 0.85rem 0.7rem 1.1rem;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.55);
}
.hs-bubble {
  border-radius: 1rem 1rem 1rem 0.3rem;
  background: rgba(255, 255, 255, 0.12);
  padding: 0.6rem 0.75rem;
  font-size: 0.72rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.9);
  overflow-wrap: anywhere;
}
`;
