/**
 * Trial request vocabulary and presentational helpers for the founder console.
 *
 * Pure functions and constants only. No "use server", no server-only import, so the
 * page, the server action and a future test can all share one definition of what a
 * valid status is. The list is the same one the 0151 check constraint enforces, so a
 * value the UI offers can never be refused by the database and vice versa.
 */

export const TRIAL_REQUEST_STATUSES = [
  "new",
  "contacted",
  "provisioned",
  "declined",
] as const;

export type TrialRequestStatus = (typeof TRIAL_REQUEST_STATUSES)[number];

/** Narrowing guard for anything arriving from a form post. */
export function isTrialRequestStatus(value: string): value is TrialRequestStatus {
  return (TRIAL_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Founder-facing wording. Falls back to the raw value so an unknown one still shows. */
export function trialRequestStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "provisioned":
      return "Provisioned";
    case "declined":
      return "Declined";
    default:
      return status;
  }
}

/** Status to pill class. New is amber because it is the one waiting on the founder. */
export function trialRequestStatusPillClass(status: string): string {
  if (status === "new") return "pill-amber";
  if (status === "provisioned") return "pill-green";
  return "pill-neutral";
}

/**
 * Everything on a trial request was typed by an anonymous visitor on the internet, so
 * a value is only ever turned into a mailto: or tel: link when it plainly is one.
 * React escapes text content by construction, but an href is a different matter: an
 * attacker-controlled string in there could carry a javascript: scheme. These two
 * guards mean the href is either a well formed address or the value is rendered as
 * plain text instead. Nothing on that page is ever passed to dangerouslySetInnerHTML.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-.\s\d]{5,30}$/;

export function safeMailto(email: string | null): string | null {
  const value = (email ?? "").trim();
  // Already proved to hold no whitespace and exactly one @, so it cannot carry another
  // scheme once prefixed with mailto:. React escapes the attribute value itself.
  return EMAIL_RE.test(value) ? `mailto:${value}` : null;
}

export function safeTel(phone: string | null): string | null {
  const value = (phone ?? "").trim();
  return PHONE_RE.test(value) ? `tel:${value.replace(/[^+\d]/g, "")}` : null;
}

/** Date and time in London, the only timezone this product operates in. */
export function formatReceivedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
