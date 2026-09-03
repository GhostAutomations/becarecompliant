/**
 * Be Care Compliant — the rules of the founder inbox.
 *
 * PURE, no runtime imports.
 *
 * WHY THIS EXISTS. The product could send but never receive. becarecompliant.com had no MX
 * record, and the trial acknowledgement ended "just reply to this email" — from a no-reply
 * address, into a domain with no inbox. Two real care companies were told that on 27 August 2026.
 *
 * Resend receives, but keeps received mail for 30 days on EVERY plan. That is a postbox, not a
 * record, so the mail is stored in our own database and Resend just carries it.
 *
 * Three things are decided here rather than scattered through the route and the page:
 *   1. which lead a message belongs to,
 *   2. what makes a reply land in the same thread in the sender's mail client,
 *   3. what a subject line looks like once it is a reply.
 */

/** Addresses are compared lowercased and trimmed, everywhere, always. */
export function normaliseAddress(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * "Sean Kuuya <info@livitycare.co.uk>" is one string in an email header. Split it so the console
 * can show a name and the matcher can compare an address.
 */
export function parseFrom(raw: string | null | undefined): { name: string | null; address: string } {
  const value = (raw ?? "").trim();
  const angled = value.match(/^(.*)<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name || null, address: normaliseAddress(angled[2]) };
  }
  return { name: null, address: normaliseAddress(value) };
}

/** The domain half, used for a softer match when the exact address does not appear. */
export function domainOf(address: string): string {
  const at = normaliseAddress(address).lastIndexOf("@");
  return at === -1 ? "" : normaliseAddress(address).slice(at + 1);
}

export type LeadForMatching = {
  id: string;
  email: string;
  created_at: string;
};

/**
 * Which lead a received message belongs to.
 *
 * EXACT ADDRESS ONLY, and that is deliberate. A domain match would attach a message from
 * anyone@livitycare.co.uk to Sean's request, which is usually right and occasionally very wrong —
 * shared mailboxes, agencies handling several providers, a competitor at the same host. An
 * unmatched message is a small annoyance in the inbox; a message filed against the wrong company
 * is a data protection problem. When more than one lead used the same address, the most recent
 * one wins, because that is the live conversation.
 */
export function matchLead(
  fromAddress: string,
  leads: readonly LeadForMatching[],
): string | null {
  const from = normaliseAddress(fromAddress);
  if (!from) return null;
  const hits = leads
    .filter((l) => normaliseAddress(l.email) === from)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return hits[0]?.id ?? null;
}

/** "Re: " once, never "Re: Re: Re:". Case-insensitive, because mail clients disagree. */
export function replySubject(subject: string | null | undefined): string {
  const value = (subject ?? "").trim();
  if (!value) return "Re: (no subject)";
  return /^re\s*:/i.test(value) ? value : `Re: ${value}`;
}

/**
 * The References header for a reply: every message id in the thread so far, oldest first, then
 * the one being replied to. Mail clients thread on this. Duplicates and empties are dropped
 * because a malformed References header breaks threading in Outlook specifically.
 */
export function buildReferences(
  existing: string | null | undefined,
  replyingTo: string | null | undefined,
): string | null {
  const ids = [...(existing ?? "").split(/\s+/), replyingTo ?? ""]
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique.join(" ") : null;
}

/** A one-line preview for the list, from the plain text body. */
export function previewOf(bodyText: string | null | undefined, max = 140): string {
  const flat = (bodyText ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "No text content";
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * Quoted history, stripped for the preview only. The full body is always kept and always shown
 * in the thread — this just stops every reply previewing as the email it is replying to.
 */
export function withoutQuotedReply(bodyText: string | null | undefined): string {
  const lines = (bodyText ?? "").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+ wrote:\s*$/.test(line)) break;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Is this address one of ours? Used to label a message and to stop the console treating our own
 * bounce and auto-reply traffic as a customer writing in.
 */
export function isOurAddress(address: string, ourDomains: readonly string[]): boolean {
  const domain = domainOf(address);
  return ourDomains.some((d) => {
    const ours = normaliseAddress(d);
    return domain === ours || domain.endsWith(`.${ours}`);
  });
}

/**
 * Obvious machine mail. Not spam filtering — just enough to keep "Mail Delivery Subsystem" and
 * out-of-office replies from looking like a customer waiting on an answer.
 */
export function looksAutomated(fromAddress: string, subject: string | null | undefined): boolean {
  const from = normaliseAddress(fromAddress);
  const local = from.split("@")[0] ?? "";
  if (["mailer-daemon", "postmaster", "no-reply", "noreply", "donotreply"].includes(local)) {
    return true;
  }
  const s = (subject ?? "").toLowerCase();
  return (
    s.startsWith("automatic reply") ||
    s.startsWith("out of office") ||
    s.includes("undeliverable") ||
    s.includes("delivery status notification")
  );
}
