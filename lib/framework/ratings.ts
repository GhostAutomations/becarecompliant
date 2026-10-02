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

/**
 * WHAT EACH CIW RATING MEANS, in CIW's own words (Annex E of CIW's guidance on carrying out a
 * quality of care review, CIW-DR-0052-E, July 2025, which summarises the descriptors in the
 * inspection framework of May 2025). Shown when a manager rates a theme themselves (0374): the
 * guidance says providers "may find it helpful to rate your service in relation to each theme"
 * using these descriptors. CQC levels carry no descriptor here until CQC's own are agreed.
 */
export const CIW_DESCRIPTORS: Record<string, string> = {
  excellent:
    "With few exceptions, the service is outstanding. This could be for exceptional leadership, for care and support that puts people at the centre of everything they do, or for making a significant positive difference to people's well-being.",
  good: "The service is consistently safe, caring, and meets people's outcomes through reliable practices with positive results.",
  requires_improvement:
    "The service sometimes falls short of expected standards with inconsistent practices and areas that need strengthening to ensure people's safety and well-being.",
  requires_significant_improvement:
    "The service is rarely effective, has weak or inadequate leadership, and significant gaps in care that risk people's safety and wellbeing. Immediate action is needed to make improvements.",
};

/** The one rule CIW fixes (framework paragraph 9): an open Priority Action Notice means the theme
 *  "must be rated as Requires significant improvement". A self rating above that is refused. */
export function selfRatingProblem(regulator: Regulator, rating: string, priorityOpen: number): string | null {
  if (!RATING_LEVELS[regulator].some((l) => l.value === rating)) return "Choose a rating from the list.";
  if (regulator === "ciw" && priorityOpen > 0 && rating !== "requires_significant_improvement") {
    return "This theme has an open Priority Action Notice, and CIW's framework says a theme with one must be rated Requires significant improvement.";
  }
  return null;
}
