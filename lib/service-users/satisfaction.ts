import "server-only";

/**
 * Be Care Compliant — Service User satisfaction.
 *
 * Scored from the Customer Satisfaction section of the Individual Plan Review (the
 * care_plan_review form). Three yes/no questions count, a Yes being a satisfied answer:
 *   - schedule_matches       Does the care schedule match the calls being delivered?
 *   - call_times_suit        Do the call times suit the individual at present?
 *   - review_previous_setup  Do the call times / visit quantities match the setup?
 *
 * WHAT IS NOT COUNTED, AND WHY (Phil, 2026-09-12, asking whether the PQS tile was right).
 *
 * `individuals_feedback` used to be the third question: "Do you wish to give any feedback
 * on your Care Workers?" — with Yes scored as satisfied and No as dissatisfied. That asks
 * whether somebody WANTS TO SAY SOMETHING, not whether they are happy. A service user who
 * wants to complain scored FOR us; a contented one with nothing to add scored AGAINST us.
 * It was the only thing moving Thistle's figure. It stays on the form, because "would you
 * like to tell us something" is a good question to ask; it is simply not a measure of
 * satisfaction and no longer pretends to be.
 *
 * `schedule_matches` replaces it and is the honest signal: the review shows the person the
 * schedule the office holds and asks whether that is what is actually arriving. A No there
 * is a real service failure, in the individual's own words.
 *
 * The rate is measured over the PQS reporting window (the same last-6-months window the PQS
 * on-time report uses) so it can feed the PQS customer satisfaction question: across every
 * review completed in the window, the percentage of those answers that were positive.
 * Active service users only, branch scoped by the caller's RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { todayInLondon, addMonths, formatCivilDate } from "@/lib/recurrence";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { satisfactionQuestions, scoreAnswers } from "./satisfaction-questions";

/**
 * The questions THIS company currently scores, for the register's columns and its CSV.
 *
 * Read from the company's own Individual Plan Review rather than a constant, because the
 * list is theirs to edit in Settings. Scoring does NOT use this: each review is scored on
 * the questions frozen into its own Evidence, so the columns on screen show today's
 * questions while a January review is still scored on January's.
 */
export async function getSatisfactionQuestions(
  companyId: string,
): Promise<{ key: string; label: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("current_version, form_versions(version, schema)")
    .eq("company_id", companyId)
    .eq("key", "care_plan_review")
    .maybeSingle<{
      current_version: number | null;
      form_versions: Array<{ version: number; schema: unknown }> | null;
    }>();
  const current = (data?.form_versions ?? []).find((v) => v.version === data?.current_version);
  if (!current || !isFormSchema(current.schema)) return [];
  return satisfactionQuestions(current.schema as FormSchema).map((q) => ({
    key: q.key,
    label: q.label,
  }));
}

export type SatisfactionWindow = { from: string; to: string };

/** Default PQS window: the last 6 full months up to today (matches the PQS report). */
export function defaultSatisfactionWindow(now: Date = new Date()): SatisfactionWindow {
  const today = todayInLondon(now);
  return { from: formatCivilDate(addMonths(today, -6)), to: formatCivilDate(today) };
}

export type SatisfactionRow = {
  id: string;
  full_name: string;
  branch_id: string | null;
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
    .order("surname_key", { ascending: true });
  if (branchId) suQuery = suQuery.eq("branch_id", branchId);
  const { data: sus } = await suQuery;
  const suList = (sus as Array<{ id: string; full_name: string; branch_id: string; branches: { name: string } | null }> | null) ?? [];
  const suById = new Map(suList.map((s) => [s.id, s]));

  const acc = new Map<string, { reviews: number; latestAt: string | null; latestAnswers: Record<string, "Yes" | "No" | null>; positive: number; answered: number }>();

  if (formId) {
    const { data: ev } = await supabase
      .from("evidence")
      .select("record_id, submitted_at, answers, schema_snapshot")
      .eq("company_id", companyId)
      .eq("form_id", formId)
      .eq("record_type", "service_user")
      .gte("submitted_at", window.from)
      .lt("submitted_at", dayAfter(window.to))
      .order("submitted_at", { ascending: false });

    for (const e of (ev as Array<{
      record_id: string;
      submitted_at: string;
      answers: Record<string, unknown>;
      schema_snapshot: unknown;
    }> | null) ?? []) {
      if (!suById.has(e.record_id)) continue; // active service users only

      /*
       * SCORED ON ITS OWN SNAPSHOT, not on today's questions (Phil, 2026-09-12).
       *
       * A company may add and remove satisfaction questions in Settings. Scoring every
       * review against the CURRENT list would mean a question removed in March silently
       * rewrites the figure reported to CIW in January. Evidence freezes the schema it was
       * filled in on, so each review is scored on the questions it actually asked, and a
       * number already reported stays that number.
       *
       * A review that answered none of them contributes nothing rather than a zero: a
       * question nobody was asked is not a question they failed.
       */
      if (!isFormSchema(e.schema_snapshot)) continue;
      const scored = scoreAnswers(e.schema_snapshot as FormSchema, e.answers ?? {});
      const answers = scored.byKey;
      const answered = scored.answered;
      const positive = scored.positive;
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
      branch_id: s.branch_id ?? null,
      branch_name: s.branches?.name ?? null,
      reviewsInWindow: rec?.reviews ?? 0,
      latestReviewAt: rec?.latestAt ?? null,
      latestAnswers: rec?.latestAnswers ?? {},
      positive,
      answered,
      // Rounded DOWN, never up: 84.6% satisfaction is not 85%, and 85 is a PQS band boundary.
      pct: answered > 0 ? Math.floor((positive / answered) * 100) : null,
    };
  });

  return {
    window,
    pct: totalAnswered > 0 ? Math.floor((totalPositive / totalAnswered) * 100) : null,
    positive: totalPositive,
    answered: totalAnswered,
    reviewCount,
    rows,
  };
}
