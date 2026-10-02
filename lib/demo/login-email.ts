import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, isSendableAddress, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { DEMO_AI_PER_LOGIN, formatDemoDate } from "@/lib/demo/rules";
import { RESET_FORM_PATH } from "@/lib/auth/password-reset-rules";

/**
 * THE DEMO LOGIN EMAIL (Phil, 2026-10-01, popup; changed 2026-10-02). Sent when a demo login is
 * made (Set up a demo, Add another login) or when the founder presses Send a new link.
 *
 * NO PASSWORD IN IT (Phil, 2026-10-02: "can we issue a link where they set the password, it will
 * look more secure to them"). It carries a one time button instead. A login that has never been
 * used gets a sign in link that lands on the Welcome page, where they choose their own password;
 * one that has already chosen a password gets the ordinary set a new password link. Nobody, the
 * founder included, ever knows their password.
 *
 * Branded button (never a bare link), and a short how to get the most from the demo.
 */

function contactAddress(): string {
  return process.env.CONTACT_EMAIL || "hello@becarecompliant.com";
}

const TIPS = (ai: number) => [
  "Start on the dashboard. One glance shows what is in date, due soon and overdue across three branches.",
  "Click an overdue figure to go straight to the check, complete its form and watch the next due date set itself.",
  "Open a person or a service user to see their checks, Evidence and history in one place.",
  "Open Reports for the PQS report and inspection readiness, ready to hand to an inspector.",
  `Press Try the AI in the gold bar at the top. You have ${ai} AI credits to spend on the things that save the most time.`,
];

export type DemoLinkKind = "set" | "reset";

export function demoLoginEmailHtml(opts: {
  fullName: string;
  email: string;
  endsAt: string;
  actionUrl: string;
  kind: DemoLinkKind;
}): string {
  const first = opts.fullName.trim().split(/\s+/)[0] || "there";
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#a8b2cc;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#e8ecf6;font-weight:600;">${escapeHtml(v)}</td></tr>`;
  const body = [
    `<p>Hi ${escapeHtml(first)},</p>`,
    "<p>Your own demo of Be Care Compliant is ready. Everything in it is made up, so click anything and try everything: nothing you do can affect a real person.</p>",
    `<table role="presentation" style="margin:12px 0 16px;border-collapse:collapse;">${row("Your login", opts.email)}${row("Your demo ends", formatDemoDate(opts.endsAt))}</table>`,
    opts.kind === "set"
      ? "<p>Press the button below to choose your own password. Nobody else ever sees it, not even us. After that you sign in at becarecompliant.com with this email and your password.</p>"
      : "<p>Press the button below to choose a new password. After that you sign in at becarecompliant.com with this email and your new password.</p>",
    "<p style=\"margin-top:18px;\"><strong>Getting the most from it</strong></p>",
    `<ol style="padding-left:20px;margin:8px 0 16px;">${TIPS(DEMO_AI_PER_LOGIN).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol>`,
    "<p>Two days before your demo ends we will ask what you thought. It takes two minutes and helps us a great deal.</p>",
    "<p>Any questions, just reply to this email.</p>",
  ].join("");
  return noticeEmailHtml({
    preheader: opts.kind === "set" ? "Choose your password and five things to try first." : "Choose a new password for your demo.",
    heading: "Your Be Care Compliant demo is ready",
    bodyHtml: body,
    ctaLabel: opts.kind === "set" ? "Set your password" : "Choose a new password",
    ctaUrl: opts.actionUrl,
    footerNote:
      "The button works once and only for a limited time, so please do not forward this email. If it has stopped working, go to becarecompliant.com/login, choose Forgot your password and enter your email, and we will send you a new one.",
  });
}

export function demoLoginEmailText(opts: { fullName: string; email: string; endsAt: string; actionUrl: string; kind: DemoLinkKind }): string {
  const first = opts.fullName.trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${first},`,
    "",
    "Your own demo of Be Care Compliant is ready. Everything in it is made up, so click anything and try everything: nothing you do can affect a real person.",
    "",
    `Your login: ${opts.email}`,
    `Your demo ends: ${formatDemoDate(opts.endsAt)}`,
    "",
    opts.kind === "set" ? "Choose your own password here (works once):" : "Choose a new password here (works once):",
    opts.actionUrl,
    "",
    "Getting the most from it",
    ...TIPS(DEMO_AI_PER_LOGIN).map((t, i) => `${i + 1}. ${t}`),
    "",
    "Two days before your demo ends we will ask what you thought. It takes two minutes and helps us a great deal.",
    "",
    "If the link has stopped working, go to becarecompliant.com/login, choose Forgot your password and enter your email.",
    "",
    "Any questions, just reply to this email.",
  ].join("\n");
}

/**
 * A fresh one time link for this login. Never used yet (status invited): a sign in link to the
 * Welcome page, where they choose their password and the login becomes active. Already active: the
 * ordinary password reset link to the new password form.
 */
async function demoLoginLink(email: string): Promise<{ ok: true; url: string; kind: DemoLinkKind } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const { data: profile } = await admin.from("profiles").select("status").eq("email", email).maybeSingle();
  const kind: DemoLinkKind = (profile as { status?: string } | null)?.status === "active" ? "reset" : "set";
  const link = await admin.auth.admin.generateLink({ type: kind === "set" ? "magiclink" : "recovery", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) return { ok: false, error: link.error?.message ?? "No sign in link could be made." };
  const url = new URL(`${siteUrl()}/auth/confirm`);
  url.searchParams.set("token_hash", hash);
  url.searchParams.set("type", kind === "set" ? "magiclink" : "recovery");
  url.searchParams.set("next", kind === "set" ? "/welcome" : RESET_FORM_PATH);
  return { ok: true, url: url.toString(), kind };
}

/** Send it. Never throws; says why when it did not go. */
export async function sendDemoLoginEmail(opts: {
  demoId: string;
  fullName: string;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!resendConfigured()) return { ok: false, error: "Email is not set up on the server (RESEND_API_KEY / RESEND_FROM)." };
  if (!isSendableAddress(opts.email)) return { ok: false, error: "That is a test or sample address, so nothing was sent." };
  const admin = createServiceClient();
  const { data: demo } = await admin.from("demos").select("ends_at").eq("id", opts.demoId).maybeSingle();
  if (!demo) return { ok: false, error: "That demo no longer exists." };
  const link = await demoLoginLink(opts.email.trim().toLowerCase());
  if (!link.ok) return { ok: false, error: `The set password link could not be made: ${link.error}` };
  const args = {
    fullName: opts.fullName,
    email: opts.email,
    endsAt: demo.ends_at as string,
    actionUrl: link.url,
    kind: link.kind,
  };
  const sent = await sendEmail({
    to: opts.email,
    subject: "Your Be Care Compliant demo login",
    html: demoLoginEmailHtml(args),
    replyTo: contactAddress(),
    // A real plain text part: the one Resend makes from the HTML runs the details table together.
    text: demoLoginEmailText(args),
  });
  if (!sent.sent) return { ok: false, error: sent.skippedReason ?? sent.error ?? "The email service did not accept it." };
  return { ok: true };
}
