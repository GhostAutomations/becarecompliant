"use client";

/* Stars from 1 to max. Shared by the form renderer's rating field and the demo survey, so a
   score looks and behaves the same everywhere. Pressing the chosen star again clears it. No
   "3 of 5" text beside the stars (Phil, 2026-10-01): it appeared on the first press and made the
   row jump; the filled stars already say it. */
export default function RatingStars({
  value,
  max,
  disabled,
  onValue,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onValue: (v: number) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-label={`${n} of ${max}`}
          aria-pressed={value === n}
          onClick={() => onValue(value === n ? 0 : n)}
          className={`text-2xl leading-none ${n <= value ? "text-gold-300" : "text-white/25"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
