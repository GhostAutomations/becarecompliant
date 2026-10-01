"use server";

import { createClient } from "@/lib/supabase/server";
import { parseDemoRatings } from "@/lib/demo/rules";
import { emailFounderDemoFeedback } from "@/lib/demo/feedback-alert";

export type DemoFeedbackState = { ok?: boolean; error?: string };

/**
 * Answer the demo survey (0356). Works with or without a login: the token IS the permission, and
 * the database answers each token once, so pressing Send twice cannot make two answers.
 */
export async function submitDemoFeedback(_prev: DemoFeedbackState, formData: FormData): Promise<DemoFeedbackState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { error: "That survey link is not valid." };
  const parsed = parseDemoRatings((k) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  });
  if (!parsed.ok) return { error: parsed.error };
  const text = (k: string) => String(formData.get(k) ?? "").slice(0, 4000);
  const r = parsed.ratings;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_demo_feedback", {
    p_token: token,
    p_ease: r.ease_of_use,
    p_looks: r.looks,
    p_registers: r.registers_checks,
    p_forms: r.forms_evidence,
    p_reports: r.reports,
    p_overall: r.overall,
    p_likely: r.likely_to_sign_up,
    p_liked: text("liked"),
    p_disliked: text("disliked"),
    p_better: text("better"),
    p_via: String(formData.get("via") ?? "") === "email" ? "email" : "app",
  });
  if (error) return { error: "Your answers could not be sent just now. Please try again." };
  if (data === "ok") {
    // First answer only ("already" is a second press): the founder hears about it once.
    await emailFounderDemoFeedback(token);
    return { ok: true };
  }
  if (data === "already") return { ok: true };
  if (data === "invalid") return { error: "Give every question a score from 1 to 5." };
  return { error: "That survey link is not valid." };
}
