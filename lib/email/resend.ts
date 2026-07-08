import "server-only";

export type SendResult = {
  sent: boolean;
  /** Set when we intentionally did not send (missing config). */
  skippedReason?: string;
  /** Set when a send was attempted but failed. */
  error?: string;
};

/** True only when both the API key and a verified From address are configured. */
export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/**
 * Send one transactional email via the Resend REST API (no SDK dependency).
 *
 * Silently no-ops (sent: false, skippedReason set) when RESEND_API_KEY or
 * RESEND_FROM is missing, so the app never crashes on a missing dependency, but
 * the caller can surface "email not sent" in the UI. Customer emails must use
 * branded CTA buttons, never plain-text links: see lib/email/templates.ts.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return {
      sent: false,
      skippedReason: "RESEND_API_KEY / RESEND_FROM not configured",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 240)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
