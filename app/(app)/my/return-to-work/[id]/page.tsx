import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { toAiQuestions } from "@/lib/forms";
import BackLink from "@/components/back-link";
import RtwAnswerForm from "@/components/staff/rtw-answer-form";

export const metadata: Metadata = { title: "Return to Work questions" };

/**
 * Where the text lands (Phil, 2026-09-25). Signing in is required: the middleware sends anyone
 * signed out to the login page and brings them back here afterwards. my_rtw_questions only ever
 * returns the SIGNED IN person's own questions, so a link forwarded to somebody else, or an id
 * typed by hand, shows the "not available" message and nothing else.
 */
export default async function MyReturnToWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/my");
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_rtw_questions", { p_id: id });
  const q = data as {
    id: string;
    first_name: string | null;
    company_name: string | null;
    questions: unknown;
    status: string;
    expires_at: string | null;
    answered_at: string | null;
    expired: boolean;
  } | null;

  const questions = q ? toAiQuestions(q.questions) : [];
  const answeredOn = q?.answered_at
    ? new Date(q.answered_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      })
    : null;

  return (
    <div className="page-form space-y-6">
      <div>
        <BackLink href="/my" label="Back to My area" />
        <h1 className="page-title mt-1">Return to Work questions</h1>
        <p className="page-subtitle">
          {q?.company_name ?? "Your employer"} would like to know how you are before your Return
          to Work meeting. Only your manager and the people who run your branch see your answers.
        </p>
      </div>

      <div className="glass-card p-6">
        {!q || questions.length === 0 ? (
          <p className="text-sm text-white/70">
            These questions are not available. They may have been sent to someone else, or your
            manager may have finished your Return to Work already. If you think this is wrong,
            please ask your manager.
          </p>
        ) : q.status !== "sent" ? (
          <p className="text-sm text-white/70">
            Thank you{q.first_name ? `, ${q.first_name}` : ""}. Your answers were sent
            {answeredOn ? ` on ${answeredOn}` : ""}, so there is nothing more to do here. Your
            manager will talk them through with you.
          </p>
        ) : q.expired ? (
          <p className="text-sm text-white/70">
            This link has run out. Please ask your manager to send the questions again.
          </p>
        ) : (
          <RtwAnswerForm questionnaireId={q.id} questions={questions} />
        )}
      </div>
    </div>
  );
}
