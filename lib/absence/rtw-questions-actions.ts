"use server";

/**
 * Sending the Return to Work questions to the employee, and the employee sending their answers
 * back (Phil, 2026-09-25). See migration 0331 and lib/absence/rtw-questions.ts.
 *
 * NOTHING THE AI WROTE REACHES A CARER UNCHECKED. The person who drafted the questions reads
 * them, changes any they want, and only then presses Send. The questions they send are the ones
 * saved, so what the employee answers is exactly what the manager approved.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { getCompanyTier, tierHasFeature } from "@/lib/billing/tier";
import { sendSms, twilioConfigured } from "@/lib/sms/twilio";
import { SMS_OPTED_OUT } from "@/lib/sms/opt-out";
import { OUT_OF_SMS_CREDITS } from "@/lib/billing/sms-credits";
import { resendStaffInviteByEmail } from "@/lib/invites";
import { siteUrl } from "@/lib/site";
import { toAiQuestions, type ActionState } from "@/lib/forms";
import {
  RTW_LINK_DAYS,
  lastFour,
  rtwPortalPath,
  rtwSmsBody,
  ukMobileToE164,
} from "@/lib/absence/rtw-questions";

function firstName(full: string | null | undefined): string {
  return String(full ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Text the saved questions to the employee, with a link into their portal. Sending again
 *  (a lost text, an expired link) sends the same questions and starts a fresh week. */
export async function sendRtwQuestions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  const absenceId = String(formData.get("absence_event_id") ?? "");
  if (!absenceId) return { error: "Missing absence." };

  // Through the caller's own client: if RLS will not show it to them, they cannot send it.
  const supabase = await createClient();
  const { data: q } = await supabase
    .from("rtw_questionnaires")
    .select("id, status, questions, person_id, send_count")
    .eq("absence_event_id", absenceId)
    .maybeSingle();
  if (!q) return { error: "Draft the questions first, then send them." };
  if (q.status === "answered") return { error: "They have already sent their answers back." };
  if (q.status === "recorded") return { error: "This Return to Work has already been recorded." };

  // The questions as the manager left them on screen. Only a draft can still be changed: once
  // a text has gone, the employee may already be looking at the saved set.
  let questions = toAiQuestions(q.questions);
  if (q.status === "drafted") {
    let edited: unknown = null;
    try {
      edited = JSON.parse(String(formData.get("questions") ?? "null"));
    } catch {
      edited = null;
    }
    const cleaned = toAiQuestions(edited);
    if (cleaned.length > 0) questions = cleaned;
  }
  if (questions.length === 0) return { error: "There are no questions to send." };

  if (!tierHasFeature(await getCompanyTier(companyId), "sms_reminders")) {
    return { error: "Sending texts is part of the Pro plan." };
  }
  if (!twilioConfigured()) {
    return { error: "Texts are not set up yet, so nothing was sent. Please tell support." };
  }

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, mobile, work_email, profile_id, employment_status, companies(name)")
    .eq("id", q.person_id as string)
    .maybeSingle();
  if (!person) return { error: "That person could not be found." };
  const name = String(person.full_name ?? "They");
  if (person.employment_status !== "active") {
    return { error: `${name} is not an active member of staff, so nothing was sent.` };
  }
  const to = ukMobileToE164(person.mobile as string | null);
  if (!to) {
    return {
      error: person.mobile
        ? `The number on ${name}'s record is not a UK mobile, so it cannot be texted. Correct it on their record, then send again.`
        : `${name} has no mobile number on their record. Add one, then send again.`,
    };
  }
  if (!person.profile_id) {
    return {
      error: `${name} has no portal login yet, so they could not open the questions. Invite them from their record first.`,
    };
  }

  // profiles is readable by Company Admins only, and a Supervisor may be the one sending. The
  // caller has already proved they can run this Return to Work, so read just the status.
  const { data: login } = await createServiceClient()
    .from("profiles")
    .select("status")
    .eq("id", person.profile_id as string)
    .maybeSingle();
  const loginStatus = (login?.status as string | undefined) ?? null;
  if (loginStatus === "disabled") {
    return { error: `${name}'s portal login is switched off, so they could not open the questions.` };
  }

  const companyName =
    ((person as { companies?: { name?: string } | null }).companies?.name as string | undefined) ?? "Your employer";
  const link = `${siteUrl()}${rtwPortalPath(q.id as string)}`;
  const sms = await sendSms({
    to,
    companyId,
    body: rtwSmsBody({ firstName: firstName(name), companyName, link }),
    metadata: { kind: "rtw_questions", absence_event_id: absenceId, rtw_questionnaire_id: q.id },
  });
  if (!sms.sent) {
    if (sms.skippedReason === SMS_OPTED_OUT) {
      return { error: `${name} has replied STOP to our texts, so they cannot be texted. Ask them to reply START, or go through the questions with them.` };
    }
    if (sms.skippedReason === OUT_OF_SMS_CREDITS) {
      return { error: "Your company has no texts left this month, so nothing was sent." };
    }
    return { error: `The text could not be sent. ${sms.error ?? sms.skippedReason ?? ""}`.trim() };
  }

  const now = new Date();
  const { data: updated } = await supabase
    .from("rtw_questionnaires")
    .update({
      questions,
      questions_changed_at: q.status === "drafted" ? now.toISOString() : undefined,
      status: "sent",
      sent_at: now.toISOString(),
      sent_by: user.id,
      sent_by_name: profile.full_name,
      sent_to_last4: lastFour(to),
      send_count: Number(q.send_count ?? 0) + 1,
      expires_at: new Date(now.getTime() + RTW_LINK_DAYS * 86_400_000).toISOString(),
    })
    .eq("id", q.id as string)
    .in("status", ["drafted", "sent"])
    .select("id");
  if (!updated || updated.length === 0) {
    return { error: "The text went, but the Return to Work could not be updated. Please refresh the page." };
  }

  /* A login they never set up would stop them at the sign in page, so send the set up email
     again. Straight to the resend: inviteOrResendForPerson stops at "already has a login" for a
     person whose login exists but was never accepted, and sends nothing (found live 2026-09-25,
     when it reported the email as sent and none arrived). Only say it went if it did. */
  let loginNote = "";
  if (loginStatus === "invited") {
    const again = person.work_email
      ? await resendStaffInviteByEmail(companyId, person.work_email as string, {
          id: user.id,
          name: profile.full_name,
          email: profile.email,
          role: profile.role,
        })
      : null;
    loginNote =
      again?.ok && again.emailSent
        ? " They have not set up their portal login yet, so their set up email has been sent again too."
        : ` They have not set up their portal login yet, and their set up email could not be sent${again && !again.ok ? ` (${again.error})` : ""}. Use Send invite on their record.`;
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.rtw_questions_sent",
    entityType: "person",
    entityId: person.id as string,
    summary: `Texted the Return to Work questions to the phone ending ${lastFour(to)}`,
    metadata: { absence_event_id: absenceId, rtw_questionnaire_id: q.id, questions: questions.length },
  });

  revalidatePath("/people/absence");
  revalidatePath("/dashboard");
  return { ok: `Sent to ${firstName(name)} on the phone ending ${lastFour(to)}.${loginNote}` };
}

/** The employee's answers, from their portal. The database checks they are answering their own
 *  questions (auth.uid()), that the link is still live, and that every question has an answer. */
export async function submitMyRtwAnswers(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCompany();
  const id = String(formData.get("questionnaire_id") ?? "");
  if (!id) return { error: "These questions could not be found." };
  let answers: unknown;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "[]"));
  } catch {
    return { error: "Your answers could not be read." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_my_rtw_answers", {
    p_id: id,
    p_answers: answers,
  });
  if (error) return { error: error.message };
  revalidatePath("/my");
  return { ok: data === "already" ? "already" : "answered" };
}
