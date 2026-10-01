/**
 * The regulator's own ratings, as recorded from an inspection report (0363, Phil 2026-10-01).
 *
 * CIW rates each theme separately for each registered service, with no overall rating, and a
 * domiciliary support service gets no Environment rating. Levels, as CIW publishes them (Ratings
 * for care homes and domiciliary support services, seven months on, 4 Dec 2025): Excellent, Good,
 * Requires improvement, Requires significant improvement. CQC rates each key question with
 * Outstanding, Good, Requires improvement, Inadequate.
 *
 * Pure and importless so it can be unit tested.
 */

export type Regulator = "ciw" | "cqc";

export const RATING_LEVELS: Record<Regulator, Array<{ value: string; label: string; tone: "green" | "amber" | "red" }>> = {
  ciw: [
    { value: "excellent", label: "Excellent", tone: "green" },
    { value: "good", label: "Good", tone: "green" },
    { value: "requires_improvement", label: "Requires improvement", tone: "amber" },
    { value: "requires_significant_improvement", label: "Requires significant improvement", tone: "red" },
  ],
  cqc: [
    { value: "outstanding", label: "Outstanding", tone: "green" },
    { value: "good", label: "Good", tone: "green" },
    { value: "requires_improvement", label: "Requires improvement", tone: "amber" },
    { value: "inadequate", label: "Inadequate", tone: "red" },
  ],
};

export function ratingLabel(regulator: Regulator, value: string | null | undefined): string | null {
  if (!value) return null;
  return RATING_LEVELS[regulator].find((l) => l.value === value)?.label ?? null;
}

export function ratingTone(regulator: Regulator, value: string | null | undefined): "green" | "amber" | "red" | null {
  if (!value) return null;
  return RATING_LEVELS[regulator].find((l) => l.value === value)?.tone ?? null;
}

/**
 * Read the ratings from a submitted form: one field per theme code, "rating_<code>". A theme left
 * blank is simply not rated (CIW gives a domiciliary service no Environment rating, and reports
 * from before April 2025 carry no ratings at all). An unknown value is refused.
 */
export function parseRatings(
  regulator: Regulator,
  codes: string[],
  get: (key: string) => string | null,
): { ok: true; ratings: Record<string, string> } | { ok: false; error: string } {
  const allowed = new Set(RATING_LEVELS[regulator].map((l) => l.value));
  const out: Record<string, string> = {};
  for (const code of codes) {
    const v = (get(`rating_${code}`) ?? "").trim();
    if (!v) continue;
    if (!allowed.has(v)) return { ok: false, error: "Choose a rating from the list for each theme, or leave it blank." };
    out[code] = v;
  }
  return { ok: true, ratings: out };
}
