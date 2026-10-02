import "server-only";
import { createClient } from "@/lib/supabase/server";
import { averageRating, demoPhase, summariseDemoUsage, type DemoPhase, type DemoUsage } from "@/lib/demo/rules";

export type DemoFeedbackRow = {
  login_id: string | null;
  ease_of_use: number | null;
  looks: number | null;
  registers_checks: number | null;
  forms_evidence: number | null;
  reports: number | null;
  overall: number | null;
  likely_to_sign_up: number | null;
  liked: string | null;
  disliked: string | null;
  better: string | null;
  submitted_at: string | null;
  submitted_via: string | null;
};

export type DemoLoginView = {
  id: string;
  email: string;
  fullName: string;
  aiUsed: number;
  aiAllowance: number;
  usage: DemoUsage;
  feedback: DemoFeedbackRow | null;
};

export type DemoView = {
  id: string;
  companyId: string | null;
  clientName: string;
  contactEmail: string | null;
  startsAt: string;
  endsAt: string;
  deletedAt: string | null;
  /** Taken off the Demos list by the founder (0372). Only ever set once the company is deleted. */
  archivedAt: string | null;
  feedbackEmailedAt: string | null;
  trialRequestId: string | null;
  phase: DemoPhase;
  usage: DemoUsage;
  logins: DemoLoginView[];
  averageScore: number | null;
  answered: number;
};

const FEEDBACK_COLS =
  "login_id, ease_of_use, looks, registers_checks, forms_evidence, reports, overall, likely_to_sign_up, liked, disliked, better, submitted_at, submitted_via";

export function feedbackAverage(f: DemoFeedbackRow | null): number | null {
  if (!f || !f.submitted_at) return null;
  return averageRating([f.ease_of_use, f.looks, f.registers_checks, f.forms_evidence, f.reports, f.overall]);
}

/** Every demo (or one), with its logins, usage and feedback, for Founder > Demos. Founder only (RLS). */
export async function listDemos(onlyId?: string): Promise<DemoView[]> {
  const supabase = await createClient();
  let q = supabase
    .from("demos")
    .select("id, company_id, client_name, contact_email, starts_at, ends_at, deleted_at, archived_at, feedback_emailed_at, trial_request_id")
    .order("created_at", { ascending: false });
  if (onlyId) q = q.eq("id", onlyId);
  const { data: demos } = await q;
  const rows = (demos ?? []) as Array<{
    id: string; company_id: string | null; client_name: string; contact_email: string | null; starts_at: string;
    ends_at: string; deleted_at: string | null; archived_at: string | null; feedback_emailed_at: string | null; trial_request_id: string | null;
  }>;
  if (rows.length === 0) return [];
  const ids = rows.map((d) => d.id);
  const { data: logins } = await supabase
    .from("demo_logins")
    .select("id, demo_id, email, full_name, ai_used, ai_allowance")
    .in("demo_id", ids)
    .order("created_at", { ascending: true });
  const loginRows = (logins ?? []) as Array<{ id: string; demo_id: string; email: string; full_name: string; ai_used: number; ai_allowance: number }>;
  const loginIds = loginRows.map((l) => l.id);
  const [{ data: visits }, { data: areas }, { data: feedback }] = await Promise.all([
    loginIds.length ? supabase.from("demo_visits").select("login_id, active_seconds, last_seen_at").in("login_id", loginIds) : Promise.resolve({ data: [] }),
    loginIds.length ? supabase.from("demo_area_time").select("login_id, area, seconds").in("login_id", loginIds) : Promise.resolve({ data: [] }),
    supabase.from("demo_feedback").select(`demo_id, ${FEEDBACK_COLS}`).in("demo_id", ids),
  ]);
  const v = (visits ?? []) as Array<{ login_id: string; active_seconds: number; last_seen_at: string }>;
  const a = (areas ?? []) as Array<{ login_id: string; area: string; seconds: number }>;
  const f = (feedback ?? []) as Array<DemoFeedbackRow & { demo_id: string }>;

  return rows.map((d) => {
    const mine = loginRows.filter((l) => l.demo_id === d.id);
    const mineIds = new Set(mine.map((l) => l.id));
    const loginViews: DemoLoginView[] = mine.map((l) => ({
      id: l.id,
      email: l.email,
      fullName: l.full_name,
      aiUsed: l.ai_used,
      aiAllowance: l.ai_allowance,
      usage: summariseDemoUsage(v.filter((x) => x.login_id === l.id), a.filter((x) => x.login_id === l.id)),
      feedback: f.find((x) => x.login_id === l.id) ?? null,
    }));
    const answered = f.filter((x) => x.demo_id === d.id && x.submitted_at);
    const scores = answered.map((x) => feedbackAverage(x)).filter((n): n is number => n !== null);
    return {
      id: d.id,
      companyId: d.company_id,
      clientName: d.client_name,
      contactEmail: d.contact_email,
      startsAt: d.starts_at,
      endsAt: d.ends_at,
      deletedAt: d.deleted_at,
      archivedAt: d.archived_at,
      feedbackEmailedAt: d.feedback_emailed_at,
      trialRequestId: d.trial_request_id,
      phase: demoPhase(d.ends_at),
      usage: summariseDemoUsage(v.filter((x) => mineIds.has(x.login_id)), a.filter((x) => mineIds.has(x.login_id))),
      logins: loginViews,
      averageScore: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null,
      answered: answered.length,
    };
  });
}
