/**
 * The one AI icon: a small gold sparkle shown on every button that uses AI credits
 * (Phil, 2026-09-28: "every AI button"), so staff can tell at a glance which actions
 * cost credits. Sized to the button text and placed before the label; the buttons are
 * inline-flex with a gap, so it never changes the button's size.
 * Add it to any NEW button that calls the AI.
 */
export function AiIcon({ className = "h-3.5 w-3.5 shrink-0 text-gold-400" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9L10 2.5z" />
      <path d="M18.5 13.5l.95 2.55 2.55.95-2.55.95-.95 2.55-.95-2.55L15 17l2.55-.95.95-2.55z" />
    </svg>
  );
}
