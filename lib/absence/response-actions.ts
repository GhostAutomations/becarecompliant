"use server";

/**
 * PUBLIC absence meeting response action (Phase 6). The employee has no login:
 * the invitation letter links to /meeting-response/<token> and this action is
 * the only write path. Security model: the unguessable per-meeting token IS the
 * capability. Everything runs through the service client with an exact token
 * match; nothing else is readable or writable. A meeting can be answered once;
 * declining requires a reason. The booker (fallback: line manager) is emailed
 * the response, idempotently via notification_log.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/lib/forms";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function respondToMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const response = String(formData.get("response") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);

  if (!TOKEN_RE.test(token)) return { error: "This response link is not valid." };
  if (response !== "accepted" && response !== "declined") {
    return { error: "Choose accept or decline." };
  }
  if (response === "declined" && !reason) {
    return { error: "Please give the reason you cannot attend." };
  }

  const supabase = createServiceClient();
  const { data: meeting } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, response, booked_by, conducted_by")
    .eq("response_token", token)
    .maybeSingle();
  if (!meeting) return { error: "This response link is not valid." };
  if (meeting.response) {
    return { error: "This invitation has already been answered." };
  }

  const { error: updErr } = await supabase
    .from("absence_meetings")
    .update({
      response,
      response_reason: response === "declined" ? reason : null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", meeting.id)
    .is("response", null); // answer-once, even against a double submit
  if (updErr) return { error: "Your response could not be saved. Please try again." };

  const [{ data: person }, { data: company }] = await Promise.all([
    supabase.from("people").select("full_name, manager_id").eq("id", meeting.person_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", meeting.company_id).maybeSingle(),
  ]);

  await writeAudit({
    companyId: meeting.company_id as string,
    action: response === "accepted" ? "absence.meeting_accepted" : "absence.meeting_declined",
    entityType: "person",
    entityId: meeting.person_id as string,
    summary:
      response === "accepted"
        ? "Meeting invitation accepted by the employee"
        : "Meeting invitation declined by the employee",
    metadata: { meeting_id: meeting.id, response, reason: reason || null },
  });

  // Tell whoever is holding the meeting (fallbacks: booker, then line manager).
  const notifyId =
    (meeting.conducted_by as string | null) ??
    (meeting.booked_by as string | null) ??
    (person?.manager_id as string | null);
  if (notifyId) {
    const { data: notifyProfile } = await supabase
      .from("profiles").select("id, full_name, email").eq("id", notifyId).maybeSingle();
    if (notifyProfile?.email) {
      const stageLabel = meeting.stage ? `Stage ${meeting.stage} absence meeting` : "Absence meeting";
      const accepted = response === "accepted";
      const subject = accepted
        ? `${person?.full_name ?? "The employee"} accepted the ${stageLabel.toLowerCase()}`
        : `${person?.full_name ?? "The employee"} declined the ${stageLabel.toLowerCase()}`;
      const logId = await claimNotification({
        companyId: meeting.company_id as string,
        branchId: (meeting.branch_id as string | null) ?? null,
        recipientProfileId: notifyProfile.id,
        channel: "email",
        kind: "meeting_response",
        dedupeKey: `meeting_response:${meeting.id}`,
        toAddress: notifyProfile.email,
        subject,
      });
      if (logId) {
        const reasonHtml = !accepted
          ? `<p style="margin:12px 0 0 0;">Reason given: ${escapeHtml(reason)}</p>`
          : "";
        const result = await sendEmail({
          to: notifyProfile.email,
          subject,
          html: noticeEmailHtml({
            preheader: subject,
            heading: accepted ? "Invitation accepted" : "Invitation declined",
            bodyHtml: `<p style="margin:0;"><strong style="color:#ffffff;">${escapeHtml(person?.full_name ?? "The employee")}</strong> has ${accepted ? "accepted" : "declined"} the ${escapeHtml(stageLabel.toLowerCase())} booked for ${escapeHtml(String(meeting.meeting_date ?? ""))}${meeting.meeting_time ? ` at ${String(meeting.meeting_time).slice(0, 5)}` : ""} at ${escapeHtml(company?.name ?? "your company")}.</p>${reasonHtml}`,
            ctaLabel: "Open the Absence page",
            ctaUrl: `${siteUrl()}/people/absence`,
          }),
        });
        await settleNotification(
          logId,
          result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
          result.error ?? result.skippedReason,
        );
      }
    }
  }

  return {
    ok:
      response === "accepted"
        ? "Thank you. Your attendance is confirmed."
        : "Thank you. Your response has been recorded and the meeting organiser has been told.",
  };
}
