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

/** The published path for a company's public form, e.g. /f/acme/holiday_requests. */
export function publicFormPath(companySlug: string, formKey: string): string {
  return `/f/${companySlug}/${formKey}`;
}
