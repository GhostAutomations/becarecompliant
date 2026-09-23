/**
 * Be Care Compliant — somebody leaving. Pure and IMPORTLESS, so node --test can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-23, DEF-058). Mohammad left Thistle and making him a leaver
 * showed three gaps: the app stamped TODAY as his leaving day with no way to say otherwise, his
 * login stayed open until somebody remembered to revoke it by hand, and nothing was asked about
 * why he went. Agreed by popup the same day:
 *
 *  - The leaving date may be past, today or future. With today or a future date they STAY
 *    ACTIVE until 23:59 of that day, on the register and in every email, because they are still
 *    working. A date already gone takes effect at once.
 *  - Leaving closes their login. Coming back gets a new login, and everything on file is there.
 *  - Leaving asks, and REQUIRES: the reason (a fixed list plus Other), whether you would
 *    re-employ them, whether they are going to a competitor (and which), and a score out of ten
 *    for attitude, attendance, lateness, professionalism, privacy and team work. Fixed questions
 *    on the leaver screen, not a form (Phil's choice).
 */

export const LEAVING_REASONS = [
  { value: "resigned", label: "Resigned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "end_of_contract", label: "End of contract" },
  { value: "failed_probation", label: "Failed probation" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
] as const;

export type LeavingReason = (typeof LEAVING_REASONS)[number]["value"];

export const COMPETITOR_ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Don't know" },
] as const;

export type CompetitorAnswer = (typeof COMPETITOR_ANSWERS)[number]["value"];

/** The six scores, in the order Phil listed them. The key is the database column. */
export const LEAVING_SCORES = [
  { key: "score_attitude", label: "Attitude" },
  { key: "score_attendance", label: "Attendance" },
  { key: "score_lateness", label: "Lateness" },
  { key: "score_professionalism", label: "Professionalism" },
  { key: "score_privacy", label: "Privacy" },
  { key: "score_teamwork", label: "Team work" },
] as const;

export type LeavingScoreKey = (typeof LEAVING_SCORES)[number]["key"];

export type LeavingAnswers = {
  leaving_date: string;
  reason: LeavingReason;
  reason_other: string | null;
  re_employ: boolean;
  competitor: CompetitorAnswer;
  competitor_name: string | null;
} & Record<LeavingScoreKey, number>;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function realDate(iso: string): boolean {
  const m = ISO.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Read and check the leaver answers from a submitted form. Every answer is required.
 * `get` returns the raw value of a field, as FormData.get would.
 */
export function parseLeaving(
  get: (name: string) => unknown,
  opts: { startDate: string | null },
): { ok: true; value: LeavingAnswers } | { ok: false; error: string } {
  const text = (name: string) => String(get(name) ?? "").trim();

  const leaving_date = text("leaving_date");
  if (!leaving_date) return { ok: false, error: "Enter their leaving date." };
  if (!realDate(leaving_date)) return { ok: false, error: "Enter a real leaving date." };
  if (opts.startDate && leaving_date < opts.startDate.slice(0, 10)) {
    return { ok: false, error: "The leaving date cannot be before their start date." };
  }

  const reason = text("reason") as LeavingReason;
  if (!LEAVING_REASONS.some((r) => r.value === reason)) {
    return { ok: false, error: "Choose the reason for leaving." };
  }
  const reason_other = text("reason_other");
  if (reason === "other" && !reason_other) {
    return { ok: false, error: "Say what the other reason for leaving is." };
  }

  const reEmploy = text("re_employ");
  if (reEmploy !== "yes" && reEmploy !== "no") {
    return { ok: false, error: "Say whether you would re-employ them." };
  }

  const competitor = text("competitor") as CompetitorAnswer;
  if (!COMPETITOR_ANSWERS.some((c) => c.value === competitor)) {
    return { ok: false, error: "Say whether they are moving to a competitor." };
  }
  const competitor_name = text("competitor_name");
  if (competitor === "yes" && !competitor_name) {
    return { ok: false, error: "Enter the competitor they are moving to." };
  }

  const scores = {} as Record<LeavingScoreKey, number>;
  for (const s of LEAVING_SCORES) {
    const raw = text(s.key);
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < 1 || n > 10) {
      return { ok: false, error: `Score ${s.label.toLowerCase()} from 1 to 10.` };
    }
    scores[s.key] = n;
  }

  return {
    ok: true,
    value: {
      leaving_date,
      reason,
      reason_other: reason === "other" ? reason_other : null,
      re_employ: reEmploy === "yes",
      competitor,
      competitor_name: competitor === "yes" ? competitor_name : null,
      ...scores,
    },
  };
}

/**
 * Does the leaving take effect now, or at the end of the leaving day?
 *
 * They stay active until 23:59 of their leaving date (Phil, 2026-09-23), so only a date that has
 * already gone makes them a leaver at once. Today or later waits for the nightly run after it.
 */
export function leavingTakesEffectNow(leavingDateIso: string, todayIso: string): boolean {
  return leavingDateIso < todayIso;
}

export function reasonLabel(reason: string, other: string | null): string {
  if (reason === "other") return other ? `Other: ${other}` : "Other";
  return LEAVING_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export function competitorLabel(answer: string, name: string | null): string {
  if (answer === "yes") return name ? `Yes, ${name}` : "Yes";
  return COMPETITOR_ANSWERS.find((c) => c.value === answer)?.label ?? answer;
}
