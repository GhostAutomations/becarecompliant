import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, isSendableAddress, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { DEMO_AI_PER_LOGIN, formatDemoDate } from "@/lib/demo/rules";

/**
 * THE DEMO LOGIN EMAIL (Phil, 2026-10-01, popup). Sent when the founder ticks "Email them their
 * login details" on Set up a demo or Add another login, or presses Send login email on the demo
 * page. It carries the password, because that is the point of it, so it is only ever built from
 * the password the founder has just typed: the password itself is never stored anywhere.
 *
 * Branded button to log in (never a bare link), and a short how to get the most from the demo.
 */

function contactAddress(): string {
  return process.env.CONTACT_EMAIL || "hello@becarecompliant.com";
}

export function demoLoginEmailHtml(opts: {
  fullName: string;
  email: string;
  password: string;
  endsAt: string;
}): string {
  const first = opts.fullName.trim().split(/\s+/)[0] || "there";
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#a8b2cc;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#e8ecf6;font-weight:600;">${escapeHtml(v)}</td></tr>`;
  const body = [
    `<p>Hi ${escapeHtml(first)},</p>`,
    "<p>Your own demo of Be Care Compliant is ready. Everything in it is made up, so click anything and try everything: nothing you do can affect a real person.</p>",
    `<table role="presentation" style="margin:12px 0 16px;border-collapse:collapse;">${row("Email", opts.email)}${row("Password", opts.password)}${row("Your demo ends", formatDemoDate(opts.endsAt))}</table>`,
    "<p style=\"margin-top:18px;\"><strong>Getting the most from it</strong></p>",
    "<ol style=\"padding-left:20px;margin:8px 0 16px;\">",
    "<li>Start on the dashboard. One glance shows what is in date, due soon and overdue across three branches.</li>",
    "<li>Click an overdue figure to go straight to the check, complete its form and watch the next due date set itself.</li>",
    "<li>Open a person or a service user to see their checks, Evidence and history in one place.</li>",
    "<li>Open Reports for the PQS report and inspection readiness, ready to hand to an inspector.</li>",
    `<li>Press Try the AI in the gold bar at the top. You have ${DEMO_AI_PER_LOGIN} AI credits to spend on the things that save the most time.</li>`,
    "</ol>",
    "<p>Two days before your demo ends we will ask what you thought. It takes two minutes and helps us a great deal.</p>",
    "<p>Any questions, just reply to this email.</p>",
  ].join("");
  return noticeEmailHtml({
    preheader: "Your login details and five things to try first.",
    heading: "Your Be Care Compliant demo is ready",
    bodyHtml: body,
    ctaLabel: "Log in to your demo",
    ctaUrl: `${siteUrl()}/login`,
    footerNote:
      "You receive this email because you asked for a demo of Be Care Compliant. It contains your password, so keep it to yourself.",
  });
}

/** Send it. Never throws; says why when it did not go. */
export async function sendDemoLoginEmail(opts: {
  demoId: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!resendConfigured()) return { ok: false, error: "Email is not set up on the server (RESEND_API_KEY / RESEND_FROM)." };
  if (!isSendableAddress(opts.email)) return { ok: false, error: "That is a test or sample address, so nothing was sent." };
  const admin = createServiceClient();
  const { data: demo } = await admin.from("demos").select("ends_at").eq("id", opts.demoId).maybeSingle();
  if (!demo) return { ok: false, error: "That demo no longer exists." };
  const sent = await sendEmail({
    to: opts.email,
    subject: "Your Be Care Compliant demo login",
    html: demoLoginEmailHtml({
      fullName: opts.fullName,
      email: opts.email,
      password: opts.password,
      endsAt: demo.ends_at as string,
    }),
    replyTo: contactAddress(),
  });
  if (!sent.sent) return { ok: false, error: sent.skippedReason ?? sent.error ?? "The email service did not accept it." };
  return { ok: true };
}
