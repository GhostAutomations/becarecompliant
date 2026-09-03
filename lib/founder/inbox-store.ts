import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
export { verifyResendSignature } from "@/lib/founder/webhook-signature";
import { sendEmail } from "@/lib/email/resend";
import {
  parseFrom,
  matchLead,
  looksAutomated,
  replySubject,
  buildReferences,
  type LeadForMatching,
} from "@/lib/founder/inbox";

/**
 * Storing and sending the founder's correspondence.
 *
 * The archive is OUR table, not Resend: Resend keeps received mail for 30 days on every plan,
 * Pro included, so anything we do not copy out is gone. The webhook stores metadata the moment
 * it arrives and then fetches the body, so a failure to fetch loses the body but never the fact
 * that somebody wrote to us.
 */

/** Where console replies go out from. Falls back to the sending address if unset. */
export function replyFromAddress(): string {
  return process.env.RESEND_REPLY_FROM || process.env.RESEND_FROM || "";
}

/* ---------------------------------------------------------------------------
 * Receiving
 * ------------------------------------------------------------------------- */

type ReceivedPayload = {
  email_id?: string;
  message_id?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  created_at?: string;
  attachments?: unknown[];
};

type ReceivedBody = {
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | null;
  message_id?: string | null;
};

/**
 * Fetch the body. The webhook carries metadata ONLY — no body, no headers — so the content has
 * to be asked for separately. Returns null on any failure; the caller stores the message anyway.
 */
export async function fetchReceivedBody(emailId: string): Promise<ReceivedBody | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error("[inbox] body fetch failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    return (await res.json()) as ReceivedBody;
  } catch (e) {
    console.error("[inbox] body fetch threw:", (e as Error).message);
    return null;
  }
}

function headerValue(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

export type StoreResult = { stored: boolean; id?: string; reason?: string };

/** Store one received email, matched to a lead where the address says so. */
export async function storeReceivedEmail(payload: ReceivedPayload): Promise<StoreResult> {
  const emailId = payload.email_id;
  if (!emailId) return { stored: false, reason: "No email_id in payload" };

  const supabase = createServiceClient();

  // Resend retries. The unique index on resend_email_id is the real guard; this just avoids
  // fetching a body we already have.
  const { data: seen } = await supabase
    .from("founder_emails")
    .select("id")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (seen) return { stored: false, id: seen.id as string, reason: "Already stored" };

  const body = await fetchReceivedBody(emailId);
  const from = parseFrom(payload.from);

  const { data: leads } = await supabase
    .from("trial_requests")
    .select("id, email, created_at");

  const trialRequestId = matchLead(
    from.address,
    ((leads ?? []) as LeadForMatching[]),
  );

  const { data, error } = await supabase
    .from("founder_emails")
    .insert({
      direction: "in",
      resend_email_id: emailId,
      message_id: payload.message_id ?? body?.message_id ?? null,
      in_reply_to: headerValue(body?.headers, "in-reply-to"),
      reference_ids: headerValue(body?.headers, "references"),
      from_address: from.address || "unknown",
      from_name: from.name,
      to_addresses: payload.to ?? [],
      cc_addresses: payload.cc ?? [],
      subject: payload.subject ?? null,
      body_text: body?.text ?? null,
      body_html: body?.html ?? null,
      attachments: payload.attachments ?? [],
      trial_request_id: trialRequestId,
      /* Bounces and out-of-office replies are parked rather than sitting in the list looking
         like a customer waiting on an answer. Nothing is deleted — it is one filter away. */
      is_spam: looksAutomated(from.address, payload.subject),
      occurred_at: payload.created_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { stored: false, reason: "Already stored (race)" };
    console.error("[inbox] store failed:", error.message);
    return { stored: false, reason: error.message };
  }
  return { stored: true, id: data.id as string };
}

/* ---------------------------------------------------------------------------
 * Sending
 * ------------------------------------------------------------------------- */

export type SendReplyInput = {
  to: string;
  subject: string;
  bodyText: string;
  /** The message being replied to, when there is one. Drives threading. */
  inReplyToMessageId?: string | null;
  existingReferences?: string | null;
  trialRequestId?: string | null;
  sentBy: string;
};

/**
 * Send a reply and keep our copy.
 *
 * The outbound row is written EITHER WAY. A send that failed is part of the record — the whole
 * reason this feature exists is that a fire and forget email left no trace when it did not
 * arrive (DEF-017).
 */
export async function sendFounderReply(input: SendReplyInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const from = replyFromAddress();
  if (!from) return { ok: false, error: "No sending address is configured." };

  const subject = replySubject(input.subject);
  const references = buildReferences(input.existingReferences, input.inReplyToMessageId);

  const headers: Record<string, string> = {};
  if (input.inReplyToMessageId) headers["In-Reply-To"] = input.inReplyToMessageId;
  if (references) headers["References"] = references;

  /* The founder types plain text. The HTML part is that text escaped and line broken — never
     interpolated as markup, because it goes out over our own domain's reputation. */
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111;white-space:pre-wrap;">${escapeForHtml(
    input.bodyText,
  )}</div>`;

  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    text: input.bodyText,
    fromOverride: from,
    replyTo: from,
    headers,
  });

  const { error } = await supabase.from("founder_emails").insert({
    direction: "out",
    message_id: null,
    in_reply_to: input.inReplyToMessageId ?? null,
    reference_ids: references,
    from_address: from,
    to_addresses: [input.to],
    subject,
    body_text: input.bodyText,
    trial_request_id: input.trialRequestId ?? null,
    sent_by: input.sentBy,
    send_error: result.sent ? null : (result.error ?? result.skippedReason ?? "Unknown failure"),
    is_read: true,
    occurred_at: new Date().toISOString(),
  });
  if (error) console.error("[inbox] could not store the sent copy:", error.message);

  return result.sent
    ? { ok: true }
    : { ok: false, error: result.error ?? result.skippedReason ?? "The email did not send." };
}

function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
