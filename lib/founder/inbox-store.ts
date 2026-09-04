import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
export { verifyResendSignature } from "@/lib/founder/webhook-signature";
import { sendEmail } from "@/lib/email/resend";
import { fromHeaderOf } from "@/lib/founder/mime";
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
  /** The full From, display name included. The webhook event only carries a bare address. */
  from?: string | null;
  /** Signed URL to the original message. The last resort for the sender's real name. */
  raw?: string | { url?: string | null } | null;
};

/**
 * Fetch the body. The webhook carries metadata ONLY — no body, no headers — so the content has
 * to be asked for separately. Returns null on any failure; the caller stores the message anyway.
 */
export type BodyFetch =
  | { ok: true; body: ReceivedBody }
  | { ok: false; error: string };

/**
 * Fetch the body. The webhook carries metadata ONLY — no body, no headers — so the content has
 * to be asked for separately.
 *
 * RETURNS THE REASON ON FAILURE, and that is the whole point of this signature. The first real
 * email through this feature (3 Sep 2026) stored with a null body because the API key had
 * "Sending access" only, and a null body reads exactly like an email somebody sent with no text
 * in it. A 401 must look like a 401.
 */
export async function fetchReceivedBody(emailId: string): Promise<BodyFetch> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured." };
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const raw = (await res.text()).slice(0, 400);
      /* The provider answers with JSON. Printing `{"statusCode":401,"message":...}` at a person
         is not a message, it is a stack trace with a colon in it. */
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        /* Not JSON. The raw text is the best we have. */
      }
      /* Name the fix in the message. A 401 or 403 here is almost always a sending-only key, and
         the person reading it should not have to work that out twice. */
      const hint =
        res.status === 401 || res.status === 403
          ? " The API key needs Full access, not Sending access, to read received mail."
          : "";
      const error = `${detail}${hint}`;
      console.error("[inbox] body fetch failed:", error);
      return { ok: false, error };
    }
    return { ok: true, body: (await res.json()) as ReceivedBody };
  } catch (e) {
    const error = (e as Error).message;
    console.error("[inbox] body fetch threw:", error);
    return { ok: false, error };
  }
}

/**
 * One header, from whichever shape the provider used.
 *
 * Providers return headers either as an object keyed by name or as an array of {name, value}.
 * The first version of this assumed an object, so on an array it looked for keys called "0" and
 * "1" and quietly found nothing — which is part of why the sender's name never appeared.
 */
function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  const wanted = name.toLowerCase();

  if (Array.isArray(headers)) {
    const hit = (headers as Array<{ name?: string; key?: string; value?: string }>).find(
      (h) => (h?.name ?? h?.key ?? "").toLowerCase() === wanted,
    );
    return hit?.value ?? null;
  }

  if (typeof headers === "object") {
    const obj = headers as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => k.toLowerCase() === wanted);
    const value = key ? obj[key] : null;
    return typeof value === "string" ? value : null;
  }

  return null;
}

/**
 * The best From we can find.
 *
 * The webhook event carries a BARE ADDRESS, which is why the list read "phil.davies@outlook.com"
 * where Outlook and Mail show "Phil Davies". The display name only exists on the retrieved
 * message — as its own `from` field, or failing that in the raw headers.
 */
async function senderHeader(body: ReceivedBody | null | undefined): Promise<string | null> {
  if (!body) return null;

  // 1. The provider's own parsed field, when it carries a display name.
  const parsed = body.from ?? null;
  if (parsed && parsed.includes("<")) return parsed;

  // 2. The headers it hands back, in whichever shape.
  const header = headerValue(body.headers, "from");
  if (header) return header;

  /* 3. THE ORIGINAL MESSAGE. The provider's parsed fields do not reliably carry the display
        name — its own dashboard shows a bare address — so the last resort is the message
        itself. Only the head is needed, so the read stops after 16KB rather than pulling a
        whole email with its attachments down for one line. */
  const url = typeof body.raw === "string" ? body.raw : (body.raw?.url ?? null);
  if (!url) return parsed;
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-16383" } });
    if (!res.ok) return parsed;
    const head = await res.text();
    return fromHeaderOf(head) ?? parsed;
  } catch (e) {
    console.error("[inbox] raw fetch for sender name failed:", (e as Error).message);
    return parsed;
  }
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

  const fetched = await fetchReceivedBody(emailId);
  const body = fetched.ok ? fetched.body : null;

  /* THE SENDER'S NAME IS IN THE HEADERS, NOT THE WEBHOOK. Resend's event carries a bare
     address, so the list showed "phil.davies@outlook.com" where Outlook and Mail show "Phil
     Davies". The full From header comes back with the body, so the name is taken from there and
     the payload is only the fallback. */
  const from = parseFrom((await senderHeader(body)) || payload.from);

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
      body_error: fetched.ok ? null : fetched.error,
      body_fetched_at: fetched.ok ? new Date().toISOString() : null,
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
  /** A reply gets "Re:" and threading headers. A new message gets neither. */
  isReply?: boolean;
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

  const subject = input.isReply === false ? input.subject.trim() : replySubject(input.subject);
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

/* ---------------------------------------------------------------------------
 * Collecting bodies that did not arrive first time
 * ------------------------------------------------------------------------- */

export type BackfillResult = { attempted: number; recovered: number; errors: string[] };

/**
 * Re-fetch the content of received messages that still have none.
 *
 * THIS IS TIME LIMITED AND THAT IS WHY IT EXISTS. Resend keeps received mail for 30 days on
 * every plan, so a body we never collected stops existing — and the row would sit in the
 * archive for ever looking like an email somebody sent blank. Run nightly, and available as a
 * button on any message that is missing its text.
 */
export async function backfillMissingBodies(limit = 50): Promise<BackfillResult> {
  const supabase = createServiceClient();
  const errors: string[] = [];

  /* MISSING A BODY **OR** MISSING A NAME.
     The first version asked only for rows with no body, so every message that arrived before
     the sender's name was being read stayed nameless for ever — there was no path back to it.
     Found by Phil, 2026-09-04: "i have synced by the emails and not the names are showing." */
  const { data, error } = await supabase
    .from("founder_emails")
    .select("id, resend_email_id")
    .eq("direction", "in")
    .not("resend_email_id", "is", null)
    .or("and(body_text.is.null,body_html.is.null),from_name.is.null")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) return { attempted: 0, recovered: 0, errors: [error.message] };

  const rows = (data ?? []) as Array<{ id: string; resend_email_id: string }>;
  let recovered = 0;

  for (const row of rows) {
    const fetched = await fetchReceivedBody(row.resend_email_id);
    const named = fetched.ok ? parseFrom(await senderHeader(fetched.body)).name : null;
    const patch = fetched.ok
      ? {
          body_text: fetched.body.text ?? null,
          body_html: fetched.body.html ?? null,
          body_error: null,
          body_fetched_at: new Date().toISOString(),
          ...(named ? { from_name: named } : {}),
        }
      : { body_error: fetched.error };

    const { error: upErr } = await supabase
      .from("founder_emails")
      .update(patch)
      .eq("id", row.id);
    if (upErr) errors.push(`${row.id}: ${upErr.message}`);
    else if (fetched.ok && (fetched.body.text || fetched.body.html)) recovered += 1;
    else if (!fetched.ok) errors.push(`${row.id}: ${fetched.error}`);
  }

  return { attempted: rows.length, recovered, errors };
}

/** The single-message version of the backfill, behind the button on a message with no text. */
export async function refetchOneBody(
  rowId: string,
  resendEmailId: string,
): Promise<{ ok: boolean; recovered: boolean; error?: string }> {
  const supabase = createServiceClient();
  const fetched = await fetchReceivedBody(resendEmailId);

  const namedFrom = fetched.ok ? parseFrom(await senderHeader(fetched.body)).name : null;
  const patch = fetched.ok
    ? {
        body_text: fetched.body.text ?? null,
        body_html: fetched.body.html ?? null,
        body_error: null,
        body_fetched_at: new Date().toISOString(),
        /* The From header arrives with the body, so collecting content is also where a message
           stored before this existed finally gets its sender's NAME. */
        ...(namedFrom ? { from_name: namedFrom } : {}),
      }
    : { body_error: fetched.error };

  const { error } = await supabase.from("founder_emails").update(patch).eq("id", rowId);
  if (error) return { ok: false, recovered: false, error: error.message };
  if (!fetched.ok) return { ok: false, recovered: false, error: fetched.error };

  /* A GENUINELY EMPTY EMAIL IS NOT A FAILURE. Somebody can send a subject and no body, and the
     console must say that rather than implying something went wrong. */
  return { ok: true, recovered: Boolean(fetched.body.text || fetched.body.html || namedFrom) };
}

