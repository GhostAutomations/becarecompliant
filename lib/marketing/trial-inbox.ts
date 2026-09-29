/**
 * A website trial request as a message in the Founder email Inbox (Phil, 2026-09-29: "when they
 * request a trial, it comes into the BeCare compliant founder email system").
 *
 * It is stored as an inbound message FROM the applicant, linked to the trial request, so
 * pressing Reply in the inbox writes straight back to them and the thread sits with the lead.
 * The alert to the founder's own address and the Trial requests list are unchanged.
 *
 * Pure and importless so node --test runs it.
 */

export type TrialRequestFields = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  tier_interest: string | null;
  /** 'monthly' | 'annual' | null (not sure). Asked on the form from 2026-09-29. */
  billing_interest?: string | null;
  team_size: string | null;
  message: string | null;
};

const PLAN_NAMES: Record<string, string> = { business: "Business", pro: "Pro" };
const BILLING_NAMES: Record<string, string> = { monthly: "Monthly", annual: "Annual" };

export function billingLabel(value: string | null | undefined): string {
  return value ? BILLING_NAMES[value] ?? value : "Not sure yet";
}

export function planLabel(value: string | null | undefined): string {
  return value ? PLAN_NAMES[value] ?? value : "Not sure yet";
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function trialRequestRows(f: TrialRequestFields): Array<[string, string]> {
  return [
    ["Company", f.company_name],
    ["Contact", f.contact_name],
    ["Email", f.email],
    ["Phone", f.phone || "Not given"],
    ["Interested in", planLabel(f.tier_interest)],
    ["Would pay", billingLabel(f.billing_interest)],
    ["Team size", f.team_size || "Not given"],
    ["Message", f.message || "None"],
  ];
}

export function trialRequestInboxMessage(f: TrialRequestFields): { subject: string; text: string; html: string } {
  const rows = trialRequestRows(f);
  const subject = `Trial request: ${f.company_name}`;
  const text = [
    "A free trial request came in from the website.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Reply here to answer them directly.",
  ].join("\n");
  const html =
    `<p>A free trial request came in from the website.</p>` +
    `<table style="border-collapse:collapse;font-size:14px;">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#8b93a7;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;">${esc(v).replace(/\n/g, "<br />")}</td></tr>`,
      )
      .join("") +
    `</table><p>Reply here to answer them directly.</p>`;
  return { subject, text, html };
}

/**
 * The text to the founder. Kept to one SMS: names are cut (company 32, contact 22 characters) so
 * nothing can push it into a second segment, and only plain GSM characters are used, because a
 * single curly quote or ellipsis switches the whole message to the 70 character encoding.
 * No dashes.
 */
function cut(value: string, max: number): string {
  const plain = value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  return plain.length > max ? `${plain.slice(0, max - 3).trimEnd()}...` : plain;
}

export function trialRequestSmsText(f: TrialRequestFields): string {
  const plan = f.tier_interest ? planLabel(f.tier_interest) : "No plan";
  const billing = f.billing_interest ? billingLabel(f.billing_interest).toLowerCase() : "no billing choice";
  return `Be Care Compliant: trial request from ${cut(f.company_name, 32)} (${cut(f.contact_name, 22)}). ${plan}, ${billing}. See the Founder inbox.`;
}
