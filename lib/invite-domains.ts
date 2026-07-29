/**
 * Be Care Compliant — the optional invite email domain allowlist (Phase 10,
 * Phil 2026-07-29, migration 0149).
 *
 * SCOPE, WHICH IS THE WHOLE POINT OF THIS FILE. These helpers exist for ONE
 * caller: the invite an Admin types by hand on Settings > Users. They are never
 * applied to the automatic Team Member (staff) invite raised when a person is
 * added or bulk imported, because care companies do not hand out work email
 * addresses at carer level, so those addresses are personal BY DESIGN and
 * enforcing there would lock a company's whole workforce out the moment an
 * Admin switched the feature on. They are not applied to Founder invites, nor
 * to briefings, invoices, notifications or any other outbound mail either.
 *
 * The enforcement itself lives inside createAndSendInvite in lib/invites.ts,
 * right beside the existing isSendableAddress gate, and is opted into by the
 * one caller that wants it rather than being a second competing check.
 *
 * No server-only import here on purpose: this is pure string work with no
 * database and no secrets, so a page, an action or a test can all use it.
 */

/** How many domains one company may hold. Well past any real office, low
 *  enough that the list stays readable on the Settings screen. */
export const INVITE_DOMAIN_LIMIT = 25;

/** Labels only, letters, numbers and hyphens, at least one dot, no leading or
 *  trailing hyphen on a label. Deliberately stricter than the email RE. */
const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Endings that belong to everybody. Because matching includes subdomains,
 * allowing "co.uk" would wave through most of the country, which is the exact
 * opposite of what an Admin was reaching for. Refused with an explanation
 * rather than accepted and quietly useless.
 */
const PUBLIC_ENDINGS = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "sch.uk",
  "ac.uk",
  "gov.uk",
  "nhs.uk",
  "com.au",
  "co.nz",
  "co.za",
  "com.br",
]);

export type DomainCheck =
  | { ok: true; domain: string }
  | { ok: false; error: string };

/**
 * Turn what an Admin typed into a stored domain, or say why it will not do.
 * Accepts "sunrisecare.co.uk", "@sunrisecare.co.uk", "  SunriseCare.CO.UK  ".
 */
export function normaliseInviteDomain(raw: string): DomainCheck {
  const typed = String(raw ?? "").trim().toLowerCase();
  if (!typed) {
    return { ok: false, error: "Enter a domain, for example sunrisecare.co.uk" };
  }
  const value = typed.startsWith("@") ? typed.slice(1) : typed;
  if (/\s/.test(value)) {
    return {
      ok: false,
      error: "A domain cannot contain spaces. Enter it as sunrisecare.co.uk",
    };
  }
  if (value.includes("@")) {
    return {
      ok: false,
      error:
        "Enter the domain on its own, the part after the @, for example sunrisecare.co.uk",
    };
  }
  if (value.startsWith(".") || value.endsWith(".")) {
    return {
      ok: false,
      error: "A domain cannot start or end with a dot. Enter it as sunrisecare.co.uk",
    };
  }
  if (!value.includes(".")) {
    return {
      ok: false,
      error:
        "That is not a full domain. Include the ending too, for example sunrisecare.co.uk",
    };
  }
  if (value.length > 253) {
    return { ok: false, error: "That domain is too long." };
  }
  if (!DOMAIN_RE.test(value)) {
    return {
      ok: false,
      error:
        "That is not a valid domain. Use letters, numbers, dots and hyphens, for example sunrisecare.co.uk",
    };
  }
  if (PUBLIC_ENDINGS.has(value)) {
    return {
      ok: false,
      error: `${value} is a public ending shared by millions of addresses, so it would let almost anyone in. Enter your own domain, for example sunrisecare.co.uk`,
    };
  }
  return { ok: true, domain: value };
}

/** Read the stored column back as a clean list, whatever the row holds. */
export function readInviteDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const d = String(entry ?? "").trim().toLowerCase().replace(/^@/, "");
    if (d) seen.add(d);
  }
  return [...seen];
}

/**
 * Is this address inside the allowlist?
 *
 * Empty list means the feature is off, so everything passes. Matching is case
 * insensitive on the part after the @, and SUBDOMAINS COUNT: an address at
 * mail.sunrisecare.co.uk passes when sunrisecare.co.uk is listed. A subdomain
 * of a domain you own is still yours, branches and mail hosts routinely sit on
 * one, and the dot boundary means a lookalike such as
 * sunrisecare.co.uk.example.com is still refused.
 */
export function isEmailDomainAllowed(
  email: string,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return true;
  const address = String(email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const domain = address.slice(at + 1);
  if (!domain) return false;
  return allowed.some((a) => domain === a || domain.endsWith(`.${a}`));
}

/** "@a.co.uk", "@a.co.uk or @b.com", "@a.co.uk, @b.com or @c.org". */
export function listInviteDomains(allowed: readonly string[]): string {
  const parts = allowed.map((d) => `@${d}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/** The refusal an Admin reads. It NAMES the allowed domains, because the whole
 *  value of the message is being able to see at a glance what went wrong. */
export function inviteDomainRefusal(allowed: readonly string[]): string {
  return `That address is outside the email domains your company allows for invites sent from Settings > Users. Allowed: ${listInviteDomains(
    allowed,
  )}. Invite an address on one of those, or change the list on the Users screen. Team Member logins are not affected by this setting.`;
}
