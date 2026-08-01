import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { recordUsage } from "@/lib/notifications/usage";
import { siteUrl } from "@/lib/site";
import {
  parseSmsKeyword,
  verifyTwilioSignature,
  twiml,
  STOP_REPLY,
  START_REPLY,
  HELP_REPLY,
  type SmsKeyword,
} from "@/lib/sms/inbound";
import { recordOptOut, clearOptOut } from "@/lib/sms/opt-out";

/**
 * Twilio inbound SMS webhook. Where a reply to one of our escalation texts lands.
 *
 * Until this existed SMS was one way: a manager who answered an overdue alert was talking to
 * nobody, because the reply reached Twilio and stopped. Phil ruled out an alphanumeric Sender ID
 * for exactly that reason, so the sending number is a real UK mobile and replies come back here.
 *
 * Security, mirroring the Stripe webhook next door:
 *  - FAILS CLOSED. No TWILIO_AUTH_TOKEN means 503, never "accept it anyway". Without the token
 *    there is no way to tell Twilio from anybody who has read our URL, and this endpoint writes
 *    to the database.
 *  - The X-Twilio-Signature is the auth. This path sits under the /api/webhooks PUBLIC_PATHS
 *    prefix, so there is no session and nothing else stands between the internet and the insert.
 *
 * THERE IS NO SECOND DELIVERY TO RELY ON. Twilio does not retry an inbound message webhook for a
 * plain number: a non 2xx is logged as error 11200 and the message is gone. Everything below is
 * therefore written so that ONE pass does the job, and so that no single failure can take both
 * the instruction and the record of it.
 *
 * THE ORDER OF WORK:
 *
 *   1. File the message. The insert is also the CLAIM: twilio_sid is unique, so of two deliveries
 *      of the same message only one can win it, which is what stops a duplicate opting somebody
 *      out twice, auditing twice or metering twice.
 *   2. Then act on the keyword, retrying the write, and mark the filed row when it succeeds.
 *
 * If step 1 fails outright we still do step 2. A record we could not keep is a small loss; an
 * opt out we did not obey is the one failure this endpoint cannot have. If step 2 fails, the row
 * from step 1 is still there with keyword_applied false, which is visible on the Notifications
 * page, and a replay of that message will try the keyword again rather than skipping it as a
 * duplicate.
 *
 * WHAT IT DOES NOT DO, yet. It does not route a reply to a shift, a briefing or an absence. Every
 * message is filed against the sender and shown to their Company Admin under
 * Settings > Notifications. Wiring specific words to specific actions is a separate decision.
 */

export const dynamic = "force-dynamic";

type Matched = {
  companyId: string | null;
  profileId: string | null;
  /** We hold this number, even where we will not say for whom. See matchSender. */
  known: boolean;
};

/**
 * The URLs Twilio might have signed.
 *
 * Twilio signs the URL exactly as it is typed into its console, and this app answers on both the
 * apex and the www host, so we cannot know which one it was. Offering both is not a weakening:
 * the attacker still has to produce a valid HMAC under the auth token for one of them. The
 * forwarded headers are included because that is what the request actually arrived on, which is
 * the case Twilio's own libraries use. Any query string is carried through, because Twilio signs
 * the whole URL including it.
 */
function candidateUrls(request: NextRequest): string[] {
  const path = `/api/webhooks/twilio/sms${request.nextUrl.search}`;
  const base = siteUrl();
  const urls = new Set<string>([`${base}${path}`]);

  // The same host with and without www, so a console entry either way verifies.
  try {
    const u = new URL(base);
    const host = u.host.startsWith("www.") ? u.host.slice(4) : `www.${u.host}`;
    urls.add(`${u.protocol}//${host}${path}`);
  } catch {
    // A malformed NEXT_PUBLIC_SITE_URL should not stop the forwarded host below from working.
  }

  const fwdHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (fwdHost) urls.add(`${fwdProto}://${fwdHost}${path}`);

  return [...urls];
}

/**
 * Find the profile that owns this number. Phones are stored in E.164, as Twilio sends them.
 *
 * ATTRIBUTION IS DECLINED WHERE IT WOULD BE A GUESS, but "we do not know whose this is" is not
 * the same as "we do not know this number". Nothing stops the same mobile appearing against
 * people in two different companies: a manager who works for two providers, a shared office
 * phone, or the same digits typed twice by mistake. A reply can name a Service User, so filing it
 * under the wrong tenant would put one company's words on another company's screen. In that case
 * the message is filed with no company, where only the founder sees it, and `known` stays true so
 * the person still gets an answer.
 */
async function matchSender(from: string): Promise<Matched> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, company_id, status")
    .eq("phone", from)
    .limit(50);
  if (error) {
    console.error("[twilio-in] sender lookup failed:", error.message);
    return { companyId: null, profileId: null, known: false };
  }

  const rows = data ?? [];
  // An active holder wins over a disabled or still invited one: that is the ordinary case of a
  // leaver replaced by a new starter on the same company mobile.
  const active = rows.filter((r) => r.status === "active");
  const candidates = active.length > 0 ? active : rows;
  if (candidates.length === 0) return { companyId: null, profileId: null, known: false };

  const companies = new Set(candidates.map((r) => r.company_id as string | null));
  if (companies.size > 1) {
    console.error("[twilio-in] number matches more than one company, filing it unattributed");
    return { companyId: null, profileId: null, known: true };
  }

  const row = candidates[0];
  return {
    companyId: (row.company_id as string | null) ?? null,
    profileId: row.id as string,
    known: true,
  };
}

/** The words each keyword is answered with. One mapping, used by the only place that replies. */
function replyFor(keyword: SmsKeyword): string {
  if (keyword === "stop") return STOP_REPLY;
  if (keyword === "start") return START_REPLY;
  return HELP_REPLY;
}

const OPT_WRITE_ATTEMPTS = 3;

/**
 * Act on STOP or START. HELP changes nothing, so there is nothing here to fail.
 *
 * Retried, because there is no redelivery to fall back on and a lost STOP is the one outcome
 * this endpoint may not have. Both writes are idempotent, so a repeat costs nothing.
 */
async function applyKeyword(
  keyword: SmsKeyword,
  from: string,
  matched: Matched,
): Promise<boolean> {
  if (keyword === "help") return true;

  for (let attempt = 1; attempt <= OPT_WRITE_ATTEMPTS; attempt++) {
    const res =
      keyword === "stop"
        ? await recordOptOut({
            phone: from,
            companyId: matched.companyId,
            profileId: matched.profileId,
          })
        : await clearOptOut(from);

    if (res.ok) {
      await writeAudit({
        companyId: matched.companyId,
        action: keyword === "stop" ? "sms.opted_out" : "sms.opted_in",
        entityType: "profile",
        entityId: matched.profileId,
        summary:
          keyword === "stop"
            ? "A number replied STOP to our texts"
            : "A number replied START and can be texted again",
        metadata: { phone: from },
      });
      return true;
    }

    console.error(
      `[twilio-in] ${keyword} write failed (attempt ${attempt}/${OPT_WRITE_ATTEMPTS}):`,
      res.detail,
    );
    if (attempt < OPT_WRITE_ATTEMPTS) await new Promise((r) => setTimeout(r, 200 * attempt));
  }
  return false;
}

/** TwiML, always 200 unless we genuinely want the failure recorded against us. */
function xml(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    // Fail CLOSED. Unsigned input must never reach the writes below.
    return NextResponse.json({ error: "Twilio webhook is not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const ok = verifyTwilioSignature({
    candidateUrls: candidateUrls(request),
    params,
    signature: request.headers.get("x-twilio-signature"),
    authToken,
  });
  if (!ok) {
    console.error("[twilio-in] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const sid = params.MessageSid || params.SmsMessageSid || "";
  const from = params.From || "";
  const to = params.To || "";
  const body = params.Body ?? "";
  if (!sid || !from) {
    // Signed but not a message. Nothing to file, nothing to answer.
    return xml(twiml());
  }

  const keyword = parseSmsKeyword(body);
  const matched = await matchSender(from);
  const supabase = createServiceClient();

  /*
   * STEP 1: file it, and win the claim.
   *
   * twilio_sid is unique, so 23505 means another delivery of this same message got here first.
   * That is what makes the side effects below happen once and not twice.
   */
  const { data: filed, error: insertError } = await supabase
    .from("sms_inbound")
    .insert({
      twilio_sid: sid,
      company_id: matched.companyId,
      profile_id: matched.profileId,
      from_number: from,
      to_number: to,
      body,
      keyword,
      metadata: {
        num_media: params.NumMedia ?? "0",
        unattributed: matched.profileId === null,
        // Flipped to true once the instruction has actually been carried out. A row sitting at
        // false is a STOP or START we accepted and failed to act on, which is worth being able
        // to find.
        keyword_applied: keyword === null,
      },
    })
    .select("id")
    .maybeSingle();

  if (insertError && insertError.code === "23505") {
    /*
     * Already seen. Say nothing: the first delivery already answered, and a reply here is an
     * outbound message Phil pays for. The one exception is a message we filed but never acted
     * on, which is a genuine retry rather than a duplicate.
     */
    const { data: prior } = await supabase
      .from("sms_inbound")
      .select("id, metadata")
      .eq("twilio_sid", sid)
      .maybeSingle();
    const applied = (prior?.metadata as { keyword_applied?: boolean } | null)?.keyword_applied;
    if (!keyword || applied !== false) return xml(twiml());

    const done = await applyKeyword(keyword, from, matched);
    if (done && prior?.id) {
      await supabase
        .from("sms_inbound")
        .update({ metadata: { ...(prior.metadata as object), keyword_applied: true } })
        .eq("id", prior.id);
    }
    // Silent either way: the first delivery already answered this message.
    return done ? xml(twiml()) : xml(twiml(), 500);
  }

  if (insertError) {
    // The record is lost, the obligation is not. Carry on to the keyword.
    console.error("[twilio-in] insert failed:", insertError.message);
  }

  if (!keyword) return xml(twiml());

  // STEP 2: carry out the instruction.
  const applied = await applyKeyword(keyword, from, matched);
  if (applied && filed?.id) {
    const { error: markError } = await supabase
      .from("sms_inbound")
      .update({
        metadata: {
          num_media: params.NumMedia ?? "0",
          unattributed: matched.profileId === null,
          keyword_applied: true,
        },
      })
      .eq("id", filed.id);
    if (markError) console.error("[twilio-in] could not mark applied:", markError.message);
  }

  /*
   * WE ONLY ANSWER NUMBERS WE HOLD.
   *
   * Every reply is an outbound message Phil pays for, and this endpoint is reachable by anyone
   * who has seen one of our texts. Answering strangers turns one inbound text into one paid
   * outbound text on demand. A number we do not hold is on no list of ours, so there is nothing
   * to confirm to it. The message is still filed, and a STOP from it is still obeyed.
   */
  if (!matched.known) return xml(twiml(), applied ? 200 : 500);

  /*
   * The reply is sent by Twilio from this TwiML, so it never passes through sendSms and never
   * claims an SMS credit. That is deliberate: an opt out confirmation is a legal courtesy and
   * must not be refused because a company has used its allowance. It is still METERED, so the
   * cost shows up where every other text does rather than appearing out of nowhere on the bill.
   */
  if (matched.companyId) {
    await recordUsage({
      companyId: matched.companyId,
      kind: "sms",
      units: 1,
      ref: sid,
      metadata: { kind: `sms_${keyword}_reply`, to: from, auto_reply: true },
    });
  } else {
    // A number we hold but cannot attribute: answered, but there is no company to meter it to.
    console.warn("[twilio-in] auto reply not metered, no company for", sid);
  }

  /*
   * A 500 when the instruction failed, so it is loud in Twilio's error log as well as ours, and
   * NO reply with it. Twilio does not act on TwiML returned with a non 2xx, and that is the right
   * behaviour here anyway: answering "you will get no more texts" when the opt out did not save
   * would be a lie told to the one person who must be able to trust it.
   */
  if (!applied) return xml(twiml(), 500);
  return xml(twiml(replyFor(keyword)));
}
