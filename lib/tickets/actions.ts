"use server";

/**
 * Tickets (Phil, 2026-10-08): raise, reply, set the status.
 *
 * Every write goes through a definer function (0432) with the caller's own session, so the
 * database decides who may do what. The service client is used only for what a definer function
 * cannot do: putting the screenshots in the private evidence bucket, and recording on the ticket
 * whether the founder's text went.
 *
 * NOTHING FAILS QUIETLY. The founder's text records when it went or why it did not on the ticket,
 * and the Founder console shows that. The company's emails say in the reply message when email is
 * not set up.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompany, requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { sendPlatformSms } from "@/lib/sms/twilio";
import { ukMobileToE164 } from "@/lib/absence/rtw-questions";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { notifyFounder } from "@/lib/founder/notify";
import { siteUrl } from "@/lib/site";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import type { ActionState } from "@/lib/forms";
import {
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_TYPES,
  TICKET_RAISER_ROLES,
  statusOf,
  ticketProblem,
  ticketRef,
  ticketSmsText,
} from "@/lib/tickets/options";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "screenshot";
}

export async function raiseTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (profile.role === "platform_admin") {
    return { error: "Tickets are raised by the company's own staff, not in support mode." };
  }
  if (!profile.company_id || !TICKET_RAISER_ROLES.includes(profile.role)) {
    return { error: "Your role cannot raise a ticket." };
  }

  const kind = String(formData.get("kind") ?? "");
  const department = String(formData.get("department") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const subject = String(formData.get("subject") ?? "");
  const description = String(formData.get("description") ?? "");
  const rag = String(formData.get("rag") ?? "");
  const ack = formData.get("ack") === "1";
  const problem = ticketProblem({ kind, department, subject, description, rag, ack });
  if (problem) return { error: problem };

  const files = formData
    .getAll("screenshots")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_SCREENSHOTS) return { error: `Up to ${MAX_SCREENSHOTS} screenshots.` };
  for (const f of files) {
    if (!SCREENSHOT_TYPES[f.type]) return { error: `${f.name} is not a picture. Use PNG, JPEG, WebP or HEIC.` };
    if (f.size > MAX_SCREENSHOT_BYTES) return { error: `${f.name} is too big. Each screenshot can be up to 5 MB.` };
  }

  const supabase = await createClient();
  const { data: ticketId, error } = await supabase.rpc("raise_support_ticket", {
    p_kind: kind,
    p_department: kind === "problem" ? department : null,
    p_area: kind === "problem" ? area : null,
    p_subject: subject,
    p_description: description,
    p_rag: rag,
    p_chargeable_ack: ack,
  });
  if (error || !ticketId) return { error: error?.message ?? "The ticket could not be raised." };
  const id = ticketId as string;
  const companyId = profile.company_id;
  const admin = createServiceClient();

  /* THE SCREENSHOTS. A failed upload does not lose the ticket: it is raised, and the reply says
     which pictures did not go, so they can be sent in a reply instead. */
  const attached: Array<{ path: string; name: string; type: string }> = [];
  const failed: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = `${companyId}/tickets/${id}/${i + 1}-${safeName(f.name)}`;
    const { error: upErr } = await admin.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: true });
    if (upErr) failed.push(f.name);
    else attached.push({ path, name: f.name, type: f.type });
  }
  if (attached.length > 0) {
    const { error: attErr } = await supabase.rpc("attach_support_ticket_screenshots", {
      p_ticket: id,
      p_files: attached,
    });
    if (attErr) failed.push(...attached.map((a) => a.name));
  }

  const { data: row } = await supabase
    .from("support_tickets")
    .select("ticket_number, companies(name)")
    .eq("id", id)
    .maybeSingle();
  const number = (row as { ticket_number?: number } | null)?.ticket_number ?? "";
  const companyRel = (row as { companies?: { name: string } | Array<{ name: string }> } | null)?.companies;
  const companyName = (Array.isArray(companyRel) ? companyRel[0]?.name : companyRel?.name) ?? "A company";

  /* THE FOUNDER'S TEXT (Phil: "I will get an SMS to say a ticket has been raised by X company").
     To every platform admin with a mobile on their profile, from the platform, so no company's SMS
     allowance is spent. Whether it went is kept on the ticket. */
  let textedAt: string | null = null;
  let textError: string | null = null;
  const { data: founders } = await admin.from("profiles").select("phone").eq("role", "platform_admin");
  const mobiles = ((founders as Array<{ phone: string | null }> | null) ?? [])
    .map((f) => ukMobileToE164(f.phone))
    .filter((m): m is string => Boolean(m));
  if (mobiles.length === 0) {
    textError = "No mobile on the founder's profile.";
  } else {
    const body = ticketSmsText({
      number,
      company: companyName,
      raisedBy: profile.full_name || profile.email,
      kind,
      rag,
      subject,
      department,
      area,
      url: `${siteUrl()}/founder/tickets/${id}`,
    });
    const problems: string[] = [];
    for (const to of mobiles) {
      const r = await sendPlatformSms({ to, body });
      if (r.sent) textedAt = new Date().toISOString();
      else problems.push(r.error ?? r.skippedReason ?? "Unknown send failure");
    }
    if (problems.length > 0) textError = problems.join("; ").slice(0, 500);
  }
  await admin.from("support_tickets").update({ founder_texted_at: textedAt, founder_text_error: textError }).eq("id", id);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "ticket.raised",
    entityType: "support_ticket",
    entityId: id,
    summary: `${ticketRef(number)} raised: ${subject.trim().slice(0, 120)}`,
    metadata: { kind, rag, department: department || null, area: area || null, screenshots: attached.length },
  });

  revalidatePath("/tickets");
  if (failed.length > 0) {
    // The ticket exists; say plainly which pictures did not go, with the way to it. No redirect
    // with a query string (the Next 15 router bug noted in lib/forms).
    return {
      error: `${ticketRef(number)} was raised, but ${failed.join(", ")} did not upload. Open the ticket and describe it in a reply instead.`,
      data: { ticketId: id },
    };
  }
  redirect(`/tickets/${id}`);
}

export async function replyToTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!ticketId) return { error: "Missing ticket." };
  if (!body) return { error: "Write a reply first." };
  if (body.length > 5000) return { error: "Keep a reply under 5,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_support_ticket", { p_ticket: ticketId, p_body: body });
  if (error) return { error: error.message };

  const { data: t } = await supabase
    .from("support_tickets")
    .select("ticket_number, company_id, subject, raised_by_email, raised_by_name, companies(name)")
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = t as {
    ticket_number: number;
    company_id: string;
    subject: string;
    raised_by_email: string | null;
    raised_by_name: string;
    companies: { name: string } | Array<{ name: string }> | null;
  } | null;
  if (!ticket) return { ok: "Reply sent." };
  const ref = ticketRef(ticket.ticket_number);
  const companyName = (Array.isArray(ticket.companies) ? ticket.companies[0]?.name : ticket.companies?.name) ?? "A company";
  let note = "";

  if (profile.role === "platform_admin") {
    // The founder replied: email whoever raised it, with a button back to the ticket.
    note = await emailRaiser(ticket, `${ref}: a reply from Be Care Compliant`, `We have replied to your ticket "${ticket.subject}".`, body, ticketId);
  } else {
    // The company replied: into the founder's inbox and email, like every founder notice.
    await notifyFounder({
      subject: `${ref} reply from ${companyName}`,
      heading: `${companyName} replied on ${ref}`,
      preheader: ticket.subject,
      bodyHtml: `<p><strong>${escapeHtml(profile.full_name || profile.email)}</strong> wrote:</p><p style="white-space:pre-wrap">${escapeHtml(body)}</p>`,
      bodyText: `${profile.full_name || profile.email} wrote:\n\n${body}`,
      ctaLabel: "Open the ticket",
      ctaUrl: `${siteUrl()}/founder/tickets/${ticketId}`,
      companyId: ticket.company_id,
    });
  }

  await writeAudit({
    companyId: ticket.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "ticket.replied",
    entityType: "support_ticket",
    entityId: ticketId,
    summary: `Replied on ${ref}`,
  });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/founder/tickets/${ticketId}`);
  return { ok: `Reply sent.${note}` };
}

export async function setTicketStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ticketId) return { error: "Missing ticket." };
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("support_tickets")
    .select("ticket_number, company_id, subject, status, raised_by_email, raised_by_name")
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = before as {
    ticket_number: number;
    company_id: string;
    subject: string;
    status: string;
    raised_by_email: string | null;
    raised_by_name: string;
  } | null;
  if (!ticket) return { error: "That ticket could not be found." };
  if (ticket.status === status) return { ok: "No change." };

  const { error } = await supabase.rpc("set_support_ticket_status", { p_ticket: ticketId, p_status: status });
  if (error) return { error: error.message };

  const label = statusOf(status).label;
  const ref = ticketRef(ticket.ticket_number);
  const note = await emailRaiser(
    ticket,
    `${ref} is now ${label.toLowerCase()}`,
    `Your ticket "${ticket.subject}" is now ${label.toLowerCase()}.`,
    null,
    ticketId,
  );
  await writeAudit({
    companyId: ticket.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "ticket.status_set",
    entityType: "support_ticket",
    entityId: ticketId,
    summary: `${ref} set to ${label}`,
    metadata: { from: ticket.status, to: status },
  });
  revalidatePath(`/founder/tickets/${ticketId}`);
  revalidatePath("/founder/tickets");
  return { ok: `Set to ${label}.${note}` };
}

/** Email whoever raised the ticket. Returns a note for the on screen message when it could not go. */
async function emailRaiser(
  ticket: { company_id: string; raised_by_email: string | null; raised_by_name: string },
  subject: string,
  lead: string,
  reply: string | null,
  ticketId: string,
): Promise<string> {
  if (!ticket.raised_by_email) return " They have no email address, so they were not emailed.";
  if (!resendConfigured()) return " Email is not set up (RESEND_API_KEY / RESEND_FROM), so they were not emailed.";
  const html = noticeEmailHtml({
    preheader: lead,
    heading: subject,
    bodyHtml:
      `<p>Hello ${escapeHtml(ticket.raised_by_name.split(" ")[0] || ticket.raised_by_name)},</p><p>${escapeHtml(lead)}</p>` +
      (reply ? `<p style="white-space:pre-wrap">${escapeHtml(reply)}</p>` : ""),
    ctaLabel: "View your ticket",
    ctaUrl: `${siteUrl()}/tickets/${ticketId}`,
  });
  const r = await sendEmail({ to: ticket.raised_by_email, subject, html, companyId: ticket.company_id });
  if (r.sent) return ` ${ticket.raised_by_name} has been emailed.`;
  return ` The email to ${ticket.raised_by_name} did not go: ${r.error ?? r.skippedReason ?? "unknown reason"}.`;
}
