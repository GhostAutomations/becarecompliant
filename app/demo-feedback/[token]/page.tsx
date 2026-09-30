import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import DemoSurveyForm from "@/components/demo/demo-survey-form";

/**
 * THE DEMO SURVEY (0356). Public on purpose (middleware PUBLIC_PATHS): the emailed link reaches
 * somebody whose demo has ended and who can no longer sign in. The token in the path is the only
 * key, it answers once, and it says nothing about the demo company or its data.
 */
export const metadata: Metadata = { title: "Your demo feedback" };

export default async function DemoFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { token } = await params;
  const { from } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  let status = { found: false, submitted: false, first_name: "" };
  if (valid) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("demo_feedback_status", { p_token: token });
    if (data) status = data as typeof status;
  }

  return (
    <main className="app-bg min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-bold text-white">
            Be Care <span className="text-gold-400">Compliant</span>
          </p>
          <h1 className="page-title mt-3">How was your demo{status.first_name ? `, ${status.first_name}` : ""}?</h1>
          <p className="page-subtitle">It takes about two minutes. Thank you for trying Be Care Compliant.</p>
        </div>
        {!status.found ? (
          <div className="glass-card p-6 text-sm text-white/70">
            This survey link is not valid. If you copied it from an email, check the whole link came across.
          </div>
        ) : status.submitted ? (
          <div className="glass-card p-6 text-sm text-white/70">
            You have already sent your answers. Thank you, they have reached us.
          </div>
        ) : (
          <DemoSurveyForm token={token} via={from === "email" ? "email" : "app"} />
        )}
      </div>
    </main>
  );
}
