/**
 * Be Care Compliant — the forms a company can publish as a PUBLIC page.
 *
 * Standing decision: Team Members do not get app logins. A company publishes a
 * short link on its own team page and staff fill the form with no account. Only
 * the forms listed here can ever be published, so a company cannot accidentally
 * expose a manager-only form (supervisions, appraisals, complaint investigations)
 * to the public internet.
 *
 * Isomorphic: no side effects, safe to import from client components.
 */

export type PublicFormDef = {
  /** The company form key (forms.key). */
  key: string;
  /** What the Admin sees in Settings. */
  label: string;
  /** One line explaining what publishing it does. */
  blurb: string;
  /** Heading shown at the top of the public page. */
  publicTitle: string;
  /** Intro line shown to the person filling it in. */
  publicIntro: string;
  /** Confirmation shown after a successful submission. */
  publicThanks: string;
};

export const PUBLIC_FORM_DEFS: PublicFormDef[] = [
  {
    key: "holiday_requests",
    label: "Holiday request",
    blurb:
      "Your team asks for holiday without logging in. Each request arrives in Holiday for a Manager to approve or decline.",
    publicTitle: "Holiday request",
    publicIntro:
      "Fill this in to request holiday. Your manager will be told as soon as you send it.",
    publicThanks:
      "Thank you, your holiday request has been sent. Your manager will let you know the outcome.",
  },
];

export function publicFormDef(key: string): PublicFormDef | undefined {
  return PUBLIC_FORM_DEFS.find((d) => d.key === key);
}

/**
 * The published path for a link, e.g. /f/k3m9qa. One short segment: the whole
 * URL has to fit on a poster, and the company name stays out of it.
 */
export function publicFormPath(code: string): string {
  return `/f/${code}`;
}

/**
 * Characters a link code can contain. No 0/O/1/l/I, so nobody mistypes a code
 * they are reading off a screen or a printed sheet.
 */
export const LINK_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const LINK_CODE_LENGTH = 6;

/** Is this a plausible link code? Cheap guard before any lookup. */
export function isLinkCode(value: string): boolean {
  return new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`, "i").test(value);
}
