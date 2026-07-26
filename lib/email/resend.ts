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
export type EmailAttachment = {
  filename: string;
  /** Base64 encoded content. */
  content: string;
  /** e.g. "text/calendar; charset=utf-8; method=REQUEST" for .ics invites. */
  contentType?: string;
  /** Set to reference this attachment inline via <img src="cid:ID">. */
  contentId?: string;
};

/**
 * Reserved and demo domains we must NEVER email.
 *
 * Phil's register still carries seeded demo people on @example.com. A whole
 * company briefing would have posted 18 emails straight into the void, and
 * bounces at that rate damage the sending domain's reputation for the real
 * customers. RFC 2606 reserves these names precisely so software can refuse them.
 */
const UNSENDABLE_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "test.com",
  "localhost",
]);
const UNSENDABLE_SUFFIXES = [".test", ".invalid", ".example", ".localhost", ".local"];

/** True when an address is real enough to send to. Used before every bulk send. */
export function isSendableAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(trimmed)) return false;
  const domain = trimmed.split("@")[1] ?? "";
  if (UNSENDABLE_DOMAINS.has(domain)) return false;
  return !UNSENDABLE_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export type BatchMessage = { to: string; subject: string; html: string };

/**
 * Send many transactional emails in one call (Resend's /emails/batch, up to 100
 * per request).
 *
 * Why this exists: sending a briefing to a whole company is one Manager click and
 * dozens of emails, and Resend rate limits REQUESTS, not recipients. One batch
 * call for 41 people stays inside the limit; 41 separate calls would not. Results
 * come back index aligned with the input, so each notification_log row can be
 * settled correctly. If the batch endpoint itself fails, this falls back to
 * sending them one at a time rather than losing the lot.
 */
export async function sendEmailBatch(messages: BatchMessage[]): Promise<SendResult[]> {
  if (messages.length === 0) return [];
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return messages.map(() => ({
      sent: false,
      skippedReason: "RESEND_API_KEY / RESEND_FROM not configured",
    }));
  }

  const out: SendResult[] = [];
  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    let ok = false;
    let error = "";
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html })),
        ),
      });
      if (res.ok) ok = true;
      else error = `Resend ${res.status}: ${(await res.text()).slice(0, 240)}`;
    } catch (e) {
      error = (e as Error).message;
    }

    if (ok) {
      for (const _ of chunk) out.push({ sent: true });
      continue;
    }
    // Fall back to one at a time, so one bad address cannot silence the rest.
    console.error("[email] batch failed, falling back:", error);
    for (const m of chunk) {
      out.push(await sendEmail(m));
    }
  }
  return out;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
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
        ...(opts.attachments && opts.attachments.length > 0
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType ? { content_type: a.contentType } : {}),
                ...(a.contentId ? { content_id: a.contentId } : {}),
              })),
            }
          : {}),
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
