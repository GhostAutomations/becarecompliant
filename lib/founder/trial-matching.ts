/**
 * Founder > Trial requests: "have we seen this one before?"
 *
 * Pure string work, no database and no server-only import, so the page, the action and a
 * future test all share one definition. The COMPANY NAME key is deliberately NOT here: it
 * lives in SQL as public.company_name_key() and arrives on the row as a generated column,
 * because the same rule written twice drifts apart and then lies (the Evidence page once
 * said a signature was missing while the PDF said it was captured). TypeScript compares
 * keys the database produced; it never recomputes one.
 *
 * THE ONE PER DOMAIN RULE AND WHY THIS LIST EXISTS. A trial is limited to one per company
 * domain. Applying that to a personal provider would be a disaster: the first applicant on
 * gmail.com would block every applicant on gmail.com afterwards, and small UK care
 * providers run on personal addresses constantly. So an address on a personal provider has
 * NO trial domain at all, and falls back to the one per address rule instead.
 *
 * Over-including a domain here is SAFE: the worst case is that a genuine company domain is
 * treated as personal, so we enforce one trial per address rather than one per company.
 * Under-including is the risky direction, so when in doubt, add it.
 */

/** Providers whose addresses belong to a person, not to a company. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "rocketmail.com",
  "aol.com",
  "aol.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "btinternet.com",
  "btopenworld.com",
  "talktalk.net",
  "tiscali.co.uk",
  "sky.com",
  "virginmedia.com",
  "blueyonder.co.uk",
  "ntlworld.com",
  "o2.co.uk",
  "ee.co.uk",
  "orange.net",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.co.uk",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "hushmail.com",
  "fastmail.com",
]);

/** The part after the @, lowercased, or null when it is not an address at all. */
export function emailDomain(email: string | null | undefined): string | null {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !/\s/.test(domain) ? domain : null;
}

export function isPersonalEmailDomain(domain: string | null): boolean {
  return domain !== null && PERSONAL_EMAIL_DOMAINS.has(domain);
}

/**
 * The domain a trial is claimed against, or null when the address is personal.
 *
 * Null is the whole mechanism, not an absence: companies.trial_owner_domain is written
 * from this, and a partial unique index cannot constrain a NULL, so a personal address
 * simply never takes part in the one per domain rule.
 */
export function trialDomainFor(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  if (!domain || isPersonalEmailDomain(domain)) return null;
  return domain;
}

/**
 * A phone number reduced to something two typings of the same number agree on: digits
 * only, 44 read as a leading 0, then the last ten. Feeds a WARNING a person reads, never
 * a block, so being approximate is the right trade.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("44")) digits = `0${digits.slice(2)}`;
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export type TrialMatchKind = "email" | "domain" | "name" | "phone";

export type TrialMatch = {
  kind: TrialMatchKind;
  /** True only for the two rules that stop the Provision button: same address, same
   *  company domain. A name or phone lookalike always warns and never blocks, because
   *  only a person can tell a second service in a group from somebody having another go. */
  blocking: boolean;
  /** What the founder reads. Written as a full sentence so the panel needs no legend. */
  text: string;
  /** Where to look before deciding. */
  href?: string;
};

/** Blocking matches first, then warnings, so the reason the button is off is at the top. */
export function sortMatches(matches: TrialMatch[]): TrialMatch[] {
  return [...matches].sort((a, b) => Number(b.blocking) - Number(a.blocking));
}
