/**
 * Branded transactional email templates. Navy + gold, same family as the app.
 * HARD RULES:
 *  - Customer emails use a branded CTA button, never a plain-text link.
 *  - No dashes in customer-facing copy: use commas, colons and full stops.
 */

const NAVY = "#081231";
const NAVY_CARD = "#0d1d4b";
const GOLD = "#f59e0b";
const TEXT = "#e8ecf6";
const MUTED = "#a8b2cc";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Outer shell shared by all customer emails. The CTA button is optional:
 *  emails to people WITHOUT app accounts (employee meeting invitations and
 *  cancellations) omit it, since "Open Be Care Compliant" means nothing to
 *  them (Phil, 2026-07-12). Emails to app users keep it. */
function shell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote: string;
}): string {
  const ctaRow =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:24px 32px 8px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:${GOLD};">
          <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:12px;">${escapeHtml(opts.ctaLabel)}</a>
        </td></tr></table>
      </td></tr>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${NAVY};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${NAVY_CARD};border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <div style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">
          Be Care <span style="color:${GOLD};">Compliant</span>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:12px 0 8px 0;font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;">${escapeHtml(opts.heading)}</h1>
        <div style="font-size:14px;line-height:1.6;color:${TEXT};">${opts.bodyHtml}</div>
      </td></tr>
      ${ctaRow}
      <tr><td style="padding:20px 32px 28px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(opts.footerNote)}</p>
      </td></tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0 auto;font-size:11px;color:${MUTED};text-align:center;">
      Be Care Compliant, compliance management for UK care providers.
    </p>
  </td></tr>
</table>
</body>
</html>`;
}

/** "1 hour", "90 minutes", "2 hours" for email copy. */
function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} minutes`;
}

/** 11 July 2026 style, en-GB, for email copy. */
function formatDateUk(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type DigestEmailItem = {
  recordName: string;
  checkName: string;
  branchName: string;
  population: "people" | "service_users";
  dueDate: string; // ISO
  rag: "red" | "amber";
};

const RED_PILL = "#fca5a5";
const AMBER_PILL = "#fcd34d";

/** Rows table shared by the digest and chaser emails. Capped by the caller. */
function itemsTableHtml(items: DigestEmailItem[], moreCount: number): string {
  const rows = items
    .map((i) => {
      const pillColor = i.rag === "red" ? RED_PILL : AMBER_PILL;
      const pillLabel = i.rag === "red" ? "Overdue" : "Due soon";
      const population = i.population === "people" ? "Person" : "Service User";
      return `<tr>
        <td style="padding:8px 10px 8px 0;font-size:13px;color:${TEXT};vertical-align:top;">
          <strong style="color:#ffffff;">${escapeHtml(i.recordName)}</strong><br />
          <span style="font-size:11px;color:${MUTED};">${escapeHtml(population)}${i.branchName ? `, ${escapeHtml(i.branchName)}` : ""}</span>
        </td>
        <td style="padding:8px 10px 8px 0;font-size:13px;color:${TEXT};vertical-align:top;">${escapeHtml(i.checkName)}</td>
        <td style="padding:8px 0;font-size:13px;vertical-align:top;white-space:nowrap;">
          <span style="color:${pillColor};font-weight:700;">${pillLabel}</span><br />
          <span style="font-size:11px;color:${MUTED};">${escapeHtml(formatDateUk(i.dueDate))}</span>
        </td>
      </tr>`;
    })
    .join("");
  const more =
    moreCount > 0
      ? `<p style="margin:10px 0 0 0;font-size:12px;color:${MUTED};">Plus ${moreCount} more in the app.</p>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.10);">${rows}</table>${more}`;
}

const DIGEST_MAX_ROWS = 40;

export function digestSubject(overdue: number, dueSoon: number): string {
  if (overdue > 0) {
    return `Compliance digest: ${overdue} overdue, ${dueSoon} due soon`;
  }
  return `Compliance digest: ${dueSoon} due soon`;
}

/** The 07:00 daily digest: one email per recipient, their scope only. */
export function digestEmailHtml(opts: {
  recipientName: string;
  companyName: string;
  dateIso: string;
  items: DigestEmailItem[];
  actionUrl: string;
}): string {
  const overdue = opts.items.filter((i) => i.rag === "red").length;
  const dueSoon = opts.items.length - overdue;
  const shown = opts.items.slice(0, DIGEST_MAX_ROWS);
  const summary =
    overdue > 0
      ? `<strong style="color:${RED_PILL};">${overdue} overdue</strong> and <strong style="color:${AMBER_PILL};">${dueSoon} due soon</strong>`
      : `<strong style="color:${AMBER_PILL};">${dueSoon} due soon</strong>`;
  const body = `
    <p style="margin:0 0 12px 0;">Good morning ${escapeHtml(opts.recipientName)}. Here is your compliance position for
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> on ${escapeHtml(formatDateUk(opts.dateIso))}: ${summary}.</p>
    ${itemsTableHtml(shown, opts.items.length - shown.length)}`;
  return shell({
    preheader: `${overdue} overdue, ${dueSoon} due soon at ${opts.companyName}.`,
    heading: "Your daily compliance digest",
    bodyHtml: body,
    ctaLabel: "Open Be Care Compliant",
    ctaUrl: opts.actionUrl,
    footerNote:
      "You receive this digest because you manage compliance for this company on Be Care Compliant. A Company Admin can change notification settings in the app.",
  });
}

export function chaserSubject(count: number, thresholdDays: number): string {
  const noun = count === 1 ? "check is" : "checks are";
  return `Action needed: ${count} ${noun} ${thresholdDays} or more days overdue`;
}

/** Escalating overdue chaser to Managers and Admins at 7 and 14 days. */
export function chaserEmailHtml(opts: {
  recipientName: string;
  companyName: string;
  thresholdDays: number;
  items: DigestEmailItem[];
  actionUrl: string;
}): string {
  const shown = opts.items.slice(0, DIGEST_MAX_ROWS);
  const noun = opts.items.length === 1 ? "check has" : "checks have";
  const body = `
    <p style="margin:0 0 12px 0;">${escapeHtml(opts.recipientName)}, ${opts.items.length} ${noun} now been overdue for
    <strong style="color:${RED_PILL};">${opts.thresholdDays} days or more</strong> at
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong>. These need attention before your next inspection.</p>
    ${itemsTableHtml(shown, opts.items.length - shown.length)}`;
  return shell({
    preheader: `${opts.items.length} compliance checks are ${opts.thresholdDays} or more days overdue.`,
    heading: "Overdue compliance needs attention",
    bodyHtml: body,
    ctaLabel: "Review overdue checks",
    ctaUrl: opts.actionUrl,
    footerNote:
      "You receive escalation emails because you manage compliance for this company on Be Care Compliant. A Company Admin can change the escalation thresholds in the app.",
  });
}

/**
 * Calendar invite email (SU Planned Review, absence management meeting). The
 * .ics goes on as an attachment; this is the branded body around it.
 */
export function calendarInviteEmailHtml(opts: {
  recipientName: string;
  companyName: string;
  eventTitle: string;
  dateIso: string;
  /** "HH:MM" Europe/London; shown after the date when present. */
  timeHHMM?: string | null;
  durationMinutes?: number | null;
  detailHtml: string;
  /** Omit for recipients without app accounts: no CTA button is rendered. */
  actionUrl?: string;
}): string {
  const when = opts.timeHHMM
    ? `${formatDateUk(opts.dateIso)} at ${opts.timeHHMM}${opts.durationMinutes ? ` (${formatDuration(opts.durationMinutes)})` : ""}`
    : formatDateUk(opts.dateIso);
  const body = `
    <p style="margin:0 0 12px 0;">${escapeHtml(opts.recipientName)}, you have been invited to
    <strong style="color:#ffffff;">${escapeHtml(opts.eventTitle)}</strong> on
    <strong style="color:#ffffff;">${escapeHtml(when)}</strong>
    at ${escapeHtml(opts.companyName)}.</p>
    ${opts.detailHtml}
    <p style="margin:12px 0 0 0;font-size:13px;color:${MUTED};">The attached calendar file adds this to your phone or Outlook calendar.</p>`;
  return shell({
    preheader: `${opts.eventTitle} on ${when}.`,
    heading: opts.eventTitle,
    bodyHtml: body,
    ctaLabel: opts.actionUrl ? "Open Be Care Compliant" : undefined,
    ctaUrl: opts.actionUrl,
    footerNote:
      "You receive this invitation because of your role with this company. If the date changes you will receive an updated invitation.",
  });
}

/**
 * Generic branded notice (holiday request submitted, holiday decision, and
 * similar single-message emails). Keeps every customer email inside the same
 * shell: branded CTA button, never a plain-text link.
 */
export function noticeEmailHtml(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  /** Omit both for recipients without app accounts: no CTA is rendered. */
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  return shell({
    preheader: opts.preheader,
    heading: opts.heading,
    bodyHtml: opts.bodyHtml,
    ctaLabel: opts.ctaLabel,
    ctaUrl: opts.ctaUrl,
    footerNote:
      opts.footerNote ??
      "You receive this email because of your role with this company on Be Care Compliant.",
  });
}

export { escapeHtml, formatDateUk };

export function inviteSubject(companyName: string): string {
  return `You have been invited to ${companyName} on Be Care Compliant`;
}

/** Invite email for a new user. actionUrl is the one time secure link. */
export function inviteEmailHtml(opts: {
  companyName: string;
  inviterName: string;
  roleLabel: string;
  actionUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 12px 0;">${escapeHtml(opts.inviterName)} has invited you to join
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> on Be Care Compliant
    as <strong style="color:#ffffff;">${escapeHtml(opts.roleLabel)}</strong>.</p>
    <p style="margin:0;">Use the button below to set your password and sign in. This link is personal to you,
    so please do not forward it.</p>`;
  return shell({
    preheader: `Join ${opts.companyName} on Be Care Compliant.`,
    heading: "Your invitation",
    bodyHtml: body,
    ctaLabel: "Accept invitation",
    ctaUrl: opts.actionUrl,
    footerNote:
      "If you were not expecting this invitation you can ignore this email and no account will be created. This link expires for your security.",
  });
}
