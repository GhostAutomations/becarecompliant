/**
 * Be Care Compliant: the words of every text the site sends, each fitted into ONE SMS (Phil,
 * 2026-10-15; docs/decisions/sms-one-segment.md). Pure, so node --test runs it. The variable parts
 * are shortened in the order listed (the company name first, then the person's name), never the
 * link; a text that still does not fit is refused by the sender rather than sent as two.
 */

import { fitSms, type FittedSms } from "./segments.ts";

/** How a short link is written in a text: no https, no www (lib/sms/links.ts makes the code). */
export const SMS_LINK_HOST = "becarecompliant.com/s/";
export function smsLinkText(code: string): string {
  return `${SMS_LINK_HOST}${code}`;
}

/** The Return to Work questions, to the employee. */
export function rtwQuestionsText(opts: { firstName: string; companyName: string; link: string }): FittedSms {
  return fitSms(
    (v) => `Hi ${v.first || "there"}, ${v.company} has a few questions for your Return to Work meeting. Answer here: ${opts.link}`,
    [
      { key: "company", value: opts.companyName || "Your employer", min: 12 },
      { key: "first", value: opts.firstName, min: 2 },
    ],
  );
}

/** The overdue chaser, to a manager. */
export function overdueChaserText(opts: { companyName: string; count: number; days: number }): FittedSms {
  const noun = opts.count === 1 ? "check is" : "checks are";
  return fitSms(
    (v) => `${v.company}: ${opts.count} ${noun} ${opts.days} or more days overdue. Sign in to review: becarecompliant.com`,
    [{ key: "company", value: opts.companyName, min: 12 }],
  );
}

/** A new ticket, to the Founder. No link (Phil's popup, 2026-10-15: "I don't need the link"). */
export function ticketText(opts: { number: number | string; rating: string; companyName: string; subject: string }): FittedSms {
  return fitSms(
    (v) => `Ticket ${opts.number} ${opts.rating} from ${v.company}: ${v.subject}.`,
    [
      { key: "subject", value: opts.subject.trim().replace(/[.\s]+$/, ""), min: 20 },
      { key: "company", value: opts.companyName, min: 12 },
    ],
  );
}

/** A trial request from the website, to the Founder. */
export function trialRequestText(opts: { companyName: string; contactName: string; plan: string; billing: string }): FittedSms {
  return fitSms(
    (v) => `Be Care Compliant: trial request from ${v.company} (${v.contact}). ${opts.plan}, ${opts.billing}. See the Founder inbox.`,
    [
      { key: "company", value: opts.companyName, min: 12 },
      { key: "contact", value: opts.contactName, min: 8 },
    ],
  );
}

/** The rota for a week has been published, to each carer on it (Rota and Visits, Stage 1). */
export function rotaPublishedText(opts: { firstName: string; companyName: string; weekLabel: string; link: string }): FittedSms {
  return fitSms(
    (v) => `Hi ${v.first || "there"}, ${v.company} has published your rota for the week of ${opts.weekLabel}. See your shifts: ${opts.link}`,
    [
      { key: "company", value: opts.companyName || "Your employer", min: 12 },
      { key: "first", value: opts.firstName, min: 2 },
    ],
  );
}

/** A published shift of theirs has changed (times, cancelled, taken off, put on). */
export function rotaChangedText(opts: { firstName: string; companyName: string; link: string }): FittedSms {
  return fitSms(
    (v) => `Hi ${v.first || "there"}, ${v.company} has changed your rota. See your shifts: ${opts.link}`,
    [
      { key: "company", value: opts.companyName || "Your employer", min: 12 },
      { key: "first", value: opts.firstName, min: 2 },
    ],
  );
}

/** The office offers an open shift to a carer they picked. */
export function rotaOfferText(opts: { firstName: string; companyName: string; when: string; link: string }): FittedSms {
  return fitSms(
    (v) => `Hi ${v.first || "there"}, ${v.company} has an open shift on ${opts.when}. Ask for it here: ${opts.link}`,
    [
      { key: "company", value: opts.companyName || "Your employer", min: 12 },
      { key: "first", value: opts.firstName, min: 2 },
    ],
  );
}
