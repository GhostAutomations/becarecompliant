import { ukDate } from "@/lib/dates";
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
  /**
   * How wide the card is. 520 suits a sentence and a button, which is every email here except
   * the daily reports: those carry a four column table and at 520 the Planned column squeezed
   * the name and the date into two words a line (Phil, 2026-09-22: "you will need to widen the
   * tile in the email so it isnt squashed"). Only the reports pass a different number, so no
   * other email moves.
   */
  maxWidth?: number;
}): string {
  const cardWidth = opts.maxWidth ?? 520;
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${cardWidth}px;background:${NAVY_CARD};border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;">
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
    <p style="max-width:${cardWidth}px;margin:16px auto 0 auto;font-size:11px;color:${MUTED};text-align:center;">
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

/** 11 July 2026 style, en-GB, for email copy. The ONE date helper, so an impossible date cannot
 *  roll forward in an email while it is refused everywhere else. */
const formatDateUk = ukDate;

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

// ---------------------------------------------------------------------------
// Daily People / Service User reporting emails. Two sections: records overdue,
// and records with a check due in the next 14 days, each record listed with its
// checks and dates. Sent to Managers and Admins. Compliance checks only.
// ---------------------------------------------------------------------------

export type ReportingRow = {
  recordId: string;
  recordName: string;
  branchName: string;
  checkName: string;
  dueDate: string; // ISO
  /** Whole days overdue as of today; used to flag escalations in the overdue
   *  section (folded in from the old separate chaser emails). */
  daysOverdue?: number;
  /** The next visit booked for this check on the Planner, or null/absent when nothing is in
   *  the diary for it (Phil, 2026-09-22). */
  planned?: { conductorName: string | null; scheduledDate: string } | null;
};

/** The width the daily reports need for four columns. Everything else stays at the default. */
const REPORT_CARD_WIDTH = 680;

const REPORTING_MAX_ROWS = 100;

function populationLabel(population: "people" | "service_users"): string {
  return population === "people" ? "People" : "Service User";
}

/** DD/MM/YYYY for the reporting tables (the format Phil asked for). */
function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Distinct records in a set of rows (used for the summary counts). */
function distinctRecords(rows: ReportingRow[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.recordId)) {
      seen.add(r.recordId);
      order.push(r.recordId);
    }
  }
  return order;
}

/**
 * The Planned cell: who is going out and when, or a red cross when nobody is (Phil, 2026-09-22:
 * "if it is not planned in, have a red X if it is planned in, have the name of the person doing
 * it and the date").
 *
 * THE CROSS IS A CHARACTER, NOT AN IMAGE. Outlook and Gmail both strip or block remote images by
 * default, and an icon that does not load is a blank cell that reads as "planned" — the exact
 * opposite of what it means. A heavy multiplication sign renders in every client.
 *
 * The name and the date sit on two lines, so a column a quarter of the email wide does not
 * break "Hayley Davies" across three of them.
 */
function plannedCellHtml(planned: ReportingRow["planned"]): string {
  if (!planned) {
    return `<span style="color:${RED_PILL};font-size:16px;font-weight:700;line-height:1;" aria-label="Not planned">&#10005;</span>`;
  }
  const who = (planned.conductorName ?? "").trim();
  const when = `<span style="color:${MUTED};white-space:nowrap;">${escapeHtml(formatDateShort(planned.scheduledDate))}</span>`;
  /* A booking whose conductor has left the company still has a date, and the date is the half
     that matters: it is booked. Saying so without a name beats showing a cross. */
  return who
    ? `<span style="color:#ffffff;">${escapeHtml(who)}</span><br />${when}`
    : `<span style="color:${MUTED};">Booked</span><br />${when}`;
}

/** One section (Overdue or Due in the next 14 days) as a four column table:
 *  Name, Task, Date, Planned. One row per check. Empty renders a calm all clear line. */
function reportingSectionHtml(
  title: string,
  rows: ReportingRow[],
  overdue: boolean,
  emptyText: string,
): string {
  const accent = overdue ? RED_PILL : AMBER_PILL;
  const heading = `<p style="margin:22px 0 8px 0;font-size:13px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.4px;">${escapeHtml(title)}</p>`;
  if (rows.length === 0) {
    return `${heading}<p style="margin:0;font-size:13px;color:${MUTED};">${escapeHtml(emptyText)}</p>`;
  }
  const shown = rows.slice(0, REPORTING_MAX_ROWS);
  /* ROOM BETWEEN THE COLUMNS (Phil, 2026-09-22: "maybe space the columns out a little more").
     18px of gutter rather than 8, and a little more air above and below each row: four columns
     of dates butting up against each other is a wall of numbers, and the eye needs the gap to
     tell which date belongs to which heading. The last column carries no right padding, so the
     extra gutter never pushes the table wider than the card. */
  const th = `font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.3px;text-align:left;padding:0 18px 8px 0;border-bottom:1px solid rgba(255,255,255,0.16);`;
  const cell = `padding:10px 18px 10px 0;font-size:13px;vertical-align:top;border-bottom:1px solid rgba(255,255,255,0.07);`;
  const lastTh = th.replace("padding:0 18px 8px 0;", "padding:0 0 8px 0;");
  const lastCell = cell.replace("padding:10px 18px 10px 0;", "padding:10px 0 10px 0;");
  const header = `<tr>
    <th style="${th}width:26%;">Name</th>
    <th style="${th}width:22%;">Task</th>
    <th style="${th}width:24%;">Date</th>
    <th style="${lastTh}width:28%;">Planned</th>
  </tr>`;
  const body = shown
    .map((r) => {
      /* Overdue rows lead with how many days overdue (the escalation signal that used to be a
         separate chaser email), then the due date — on TWO LINES since 2026-09-22. In one line
         "43 days overdue · 10/08/2026" is far wider than any other cell, and because it cannot
         wrap it stretched the Date column and squeezed the names beside it. Stacked, every
         column keeps the width its heading says it has. */
      const dateCell = overdue
        ? `${
            r.daysOverdue != null && r.daysOverdue > 0
              ? `${r.daysOverdue} ${r.daysOverdue === 1 ? "day" : "days"} overdue`
              : "Overdue"
          }<br /><span style="color:${MUTED};font-weight:400;">${escapeHtml(formatDateShort(r.dueDate))}</span>`
        : escapeHtml(formatDateShort(r.dueDate));
      const weight = overdue && r.daysOverdue != null && r.daysOverdue >= 7 ? "font-weight:700;" : "";
      return `<tr>
        <td style="${cell}color:#ffffff;font-weight:600;">${escapeHtml(r.recordName)}</td>
        <td style="${cell}color:${TEXT};">${escapeHtml(r.checkName)}</td>
        <td style="${cell}color:${accent};white-space:nowrap;${weight}">${dateCell}</td>
        <td style="${lastCell}">${plannedCellHtml(r.planned ?? null)}</td>
      </tr>`;
    })
    .join("");
  const more =
    rows.length > shown.length
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:${MUTED};">Plus ${rows.length - shown.length} more in the app.</p>`
      : "";
  return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${header}${body}</table>${more}`;
}

export function reportingSubject(
  population: "people" | "service_users",
  overdueRecords: number,
  dueSoonRecords: number,
): string {
  const label = populationLabel(population);
  if (overdueRecords > 0) {
    return `${label} compliance report: ${overdueRecords} overdue, ${dueSoonRecords} due in 14 days`;
  }
  if (dueSoonRecords > 0) {
    return `${label} compliance report: ${dueSoonRecords} due in 14 days`;
  }
  return `${label} compliance report: all compliant`;
}

/** The daily People or Service User compliance report for one recipient. */
export function reportingEmailHtml(opts: {
  recipientName: string;
  companyName: string;
  dateIso: string;
  population: "people" | "service_users";
  overdue: ReportingRow[];
  dueSoon: ReportingRow[];
  actionUrl: string;
}): string {
  const label = populationLabel(opts.population);
  const overdueRecords = distinctRecords(opts.overdue).length;
  const dueSoonRecords = distinctRecords(opts.dueSoon).length;
  const noun = opts.population === "people" ? "people" : "service users";

  const summary =
    overdueRecords > 0
      ? `<strong style="color:${RED_PILL};">${overdueRecords} ${overdueRecords === 1 ? "record" : "records"} overdue</strong> and <strong style="color:${AMBER_PILL};">${dueSoonRecords} due in the next 14 days</strong>`
      : dueSoonRecords > 0
        ? `<strong style="color:${AMBER_PILL};">${dueSoonRecords} ${dueSoonRecords === 1 ? "record" : "records"} due in the next 14 days</strong>, nothing overdue`
        : `every ${noun} record is compliant, nothing overdue or due in the next 14 days`;

  const body = `
    <p style="margin:0 0 4px 0;">Good morning ${escapeHtml(opts.recipientName)}. Your ${escapeHtml(label)} compliance position for
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> on ${escapeHtml(formatDateUk(opts.dateIso))}: ${summary}.</p>
    ${reportingSectionHtml("Records overdue", opts.overdue, true, "Nothing overdue.")}
    ${reportingSectionHtml("Records due in the next 14 days", opts.dueSoon, false, "Nothing due in the next 14 days.")}`;

  return shell({
    maxWidth: REPORT_CARD_WIDTH,
    preheader: reportingSubject(opts.population, overdueRecords, dueSoonRecords),
    heading: `Daily ${label} compliance report`,
    bodyHtml: body,
    ctaLabel: "Open Be Care Compliant",
    ctaUrl: opts.actionUrl,
    footerNote:
      "You receive this report because you manage compliance for this company on Be Care Compliant. A Company Admin can change notification settings in the app.",
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

/**
 * Company-branded invoice email. UNLIKE every other template here, this carries
 * the CARE COMPANY's brand, not Be Care Compliant's: the client is theirs, so the
 * email leads with the company's logo and name and never mentions Be Care
 * Compliant. Light theme to read like a normal business invoice email. The logo
 * is passed as an inline attachment (cid) so it renders in Gmail and Outlook,
 * which strip data-URI images. No amount or bank details in the body (those live
 * on the attached PDF only).
 */
export function companyInvoiceEmailHtml(opts: {
  companyName: string;
  invoiceNumber: string;
  dueDateIso?: string | null;
  /** content-id of the inline logo attachment, or null to show the name only. */
  logoCid?: string | null;
  /** True when a reply-to inbox is configured, so "reply to this email" is honest. */
  replyable?: boolean;
}): string {
  const due = opts.dueDateIso ? ` It is due by ${escapeHtml(formatDateUk(opts.dueDateIso))}.` : "";
  const name = escapeHtml(opts.companyName);
  const closing = opts.replyable
    ? "The invoice is attached as a PDF. If you have any questions, please reply to this email."
    : "The invoice is attached as a PDF.";
  const header = opts.logoCid
    ? `<img src="cid:${escapeHtml(opts.logoCid)}" alt="${name}" style="max-height:56px;max-width:220px;margin:0 0 6px 0;" />`
    : `<div style="font-size:18px;font-weight:700;color:#0d1d4b;">${name}</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;color:#0d1d4b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">Invoice ${escapeHtml(opts.invoiceNumber)} from ${name}.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e8f2;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:26px 32px 6px 32px;">${header}</td></tr>
      <tr><td style="padding:6px 32px 0 32px;">
        <h1 style="margin:10px 0 8px 0;font-size:20px;line-height:1.3;color:#0d1d4b;font-weight:700;">Invoice ${escapeHtml(opts.invoiceNumber)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#243459;">
          <p style="margin:0 0 12px 0;">Please find attached invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> from <strong>${name}</strong>.${due}</p>
          <p style="margin:0;">${closing}</p>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7794;">This invoice was sent to you by ${name}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
