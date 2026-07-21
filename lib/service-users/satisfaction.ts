import "server-only";

/**
 * Be Care Compliant — Service User satisfaction.
 *
 * Satisfaction is scored from the "Feedback, Call Times and Outcomes" section of the
 * Individual Plan Review (the care_plan_review check's form). Three yes/no questions
 * count, a Yes being a satisfied response:
 *   - call_times_suit        Do the call times suit the individual at present?
 *   - review_previous_setup  Do the call times / visit quantities match the setup?
 *   - individuals_feedback   Did the individual give feedback on their care workers?
 *
 * The rate is measured over the PQS reporting window (the same last-6-months window
 * the PQS on-time report uses) so it can feed the PQS customer satisfaction question:
 * across every review completed in the window, the percentage of those answers that
 * were positive. Active service users only, branch scoped by the caller's RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { todayInLondon, addMonths, formatCivilDate } from "@/lib/recurrence";

export const SATISFACTION_QUESTIONS: { key: string; label: string }[] = [
  { key: "call_times_suit", label: "Call times suit the individual" },
  { key: "review_previous_setup", label: "Call times match the setup" },
  { key: "individuals_feedback", label: "Gave feedback on care workers" },
];

export type SatisfactionWindow = { from: string; to: string };

/** Default PQS window: the last 6 full months up to today (matches the PQS report). */
export function defaultSatisfactionWindow(now: Date = new Date()): SatisfactionWindow {
  const today = todayInLondon(now);
  return { from: formatCivilDate(addMonths(today, -6)), to: formatCivilDate(today) };
}

export type SatisfactionRow = {
  id: string;
  full_name: string;
  branch_name: string | null;
  reviewsInWindow: number;
  latestReviewAt: string | null;
  latestAnswers: Record<string, "Yes" | "No" | null>;
  positive: number;
  answered: number;
  pct: number | null;
};

export type SatisfactionResult = {
  window: SatisfactionWindow;
  pct: number | null; // overall positive rate across the window
  positive: number;
  answered: number;
  reviewCount: number;
  rows: SatisfactionRow[];
};

function normalise(v: unknown): "Yes" | "No" | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "Yes") return "Yes";
  if (s === "No") return "No";
  return null;
}

/** Day after a YYYY-MM-DD date, so we can filter submitted_at < end. */
function dayAfter(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export async function getSatisfaction(
  companyId: string,
  window: SatisfactionWindow = defaultSatisfactionWindow(),
  branchId: string | null = null,
): Promise<SatisfactionResult> {
  const supabase = await createClient();

  // The care plan review (Individual Plan Review) form for this company.
  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", "care_plan_review")
    .maybeSingle();
  const formId = (form?.id as string | undefined) ?? null;

  let suQuery = supabase
    .from("service_users")
    .select("id, full_name, branch_id, branches(name)")
    .eq("company_id", companyId)
    .eq("service_status", "active")
    .order("full_name", { ascending: true });
  if (branchId) suQuery = suQuery.eq("branch_id", branchId);
  const { data: sus } = await suQuery;
  const suList = (sus as Array<{ id: string; full_name: string; branch_id: string; branches: { name: string } | null }> | null) ?? [];
  const suById = new Map(suList.map((s) => [s.id, s]));

  const acc = new Map<string, { reviews: number; latestAt: string | null; latestAnswers: Record<string, "Yes" | "No" | null>; positive: number; answered: number }>();

  if (formId) {
    const { data: ev } = await supabase
      .from("evidence")
      .select("record_id, submitted_at, answers")
      .eq("company_id", companyId)
      .eq("form_id", formId)
      .eq("record_type", "service_user")
      .gte("submitted_at", window.from)
      .lt("submitted_at", dayAfter(window.to))
      .order("submitted_at", { ascending: false });

    for (const e of (ev as Array<{ record_id: string; submitted_at: string; answers: Record<string, unknown> }> | null) ?? []) {
      if (!suById.has(e.record_id)) continue; // active service users only

      // Score this review. Legacy reviews completed before the feedback section
      // existed answer none of these, so they do not count towards satisfaction.
      const answers: Record<string, "Yes" | "No" | null> = {};
      let answered = 0;
      let positive = 0;
      for (const q of SATISFACTION_QUESTIONS) {
        const val = normalise((e.answers ?? {})[q.key]);
        answers[q.key] = val;
        if (val !== null) {
          answered += 1;
          if (val === "Yes") positive += 1;
        }
      }
      if (answered === 0) continue; // no satisfaction data captured in this review

      const rec = acc.get(e.record_id) ?? { reviews: 0, latestAt: null, latestAnswers: {}, positive: 0, answered: 0 };
      rec.reviews += 1;
      rec.answered += answered;
      rec.positive += positive;
      // Evidence is ordered newest first, so the first scoring one is the latest.
      if (rec.latestAt === null) {
        rec.latestAt = e.submitted_at;
        rec.latestAnswers = answers;
      }
      acc.set(e.record_id, rec);
    }
  }

  let totalPositive = 0;
  let totalAnswered = 0;
  let reviewCount = 0;
  const rows: SatisfactionRow[] = suList.map((s) => {
    const rec = acc.get(s.id);
    const positive = rec?.positive ?? 0;
    const answered = rec?.answered ?? 0;
    totalPositive += positive;
    totalAnswered += answered;
    reviewCount += rec?.reviews ?? 0;
    return {
      id: s.id,
      full_name: s.full_name,
      branch_name: s.branches?.name ?? null,
      reviewsInWindow: rec?.reviews ?? 0,
      latestReviewAt: rec?.latestAt ?? null,
      latestAnswers: rec?.latestAnswers ?? {},
      positive,
      answered,
      pct: answered > 0 ? Math.round((positive / answered) * 100) : null,
    };
  });

  return {
    window,
    pct: totalAnswered > 0 ? Math.round((totalPositive / totalAnswered) * 100) : null,
    positive: totalPositive,
    answered: totalAnswered,
    reviewCount,
    rows,
  };
}
