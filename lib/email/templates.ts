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
  recordId: string;
  recordName: string;
  checkName: string;
  branchName: string;
  population: "people" | "service_users";
  dueDate: string; // ISO
  rag: "red" | "amber";
  /** Whole days late, for the "04/02/2026, 231 days overdue" date cell (DEF-055). */
  daysOverdue?: number;
  /** The visit booked for it on the Planner, or null for a red cross (DEF-055). */
  planned?: { conductorName: string | null; scheduledDate: string } | null;
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

/**
 * The grey heading a digest row sits under: "Swansea, People". A supervisor's digest can span
 * branches and both populations, and saying the branch once above its rows replaces saying it
 * under every single name (DEF-055).
 */
function digestGroup(r: ReportingRow): string {
  const population = r.population === "service_users" ? "Service Users" : "People";
  return r.branchName ? `${r.branchName}, ${population}` : population;
}

/** One section's rows, grouped by branch then population, oldest date first inside a group. */
function digestRows(items: DigestEmailItem[], rag: "red" | "amber"): ReportingRow[] {
  const popOrder = (p: "people" | "service_users") => (p === "people" ? 0 : 1);
  return items
    .filter((i) => i.rag === rag)
    .slice()
    .sort(
      (a, b) =>
        a.branchName.localeCompare(b.branchName) ||
        popOrder(a.population) - popOrder(b.population) ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.recordName.localeCompare(b.recordName),
    )
    .map((i) => ({
      recordId: i.recordId,
      recordName: i.recordName,
      branchName: i.branchName,
      population: i.population,
      checkName: i.checkName,
      dueDate: i.dueDate,
      daysOverdue: i.daysOverdue,
      planned: i.planned ?? null,
    }));
}

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
  const summary =
    overdue > 0
      ? `<strong style="color:${RED_PILL};">${overdue} overdue</strong> and <strong style="color:${AMBER_PILL};">${dueSoon} due soon</strong>`
      : `<strong style="color:${AMBER_PILL};">${dueSoon} due soon</strong>`;
  const body = `
    <p style="margin:0 0 12px 0;">Good morning ${escapeHtml(opts.recipientName)}. Here is your compliance position for
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> on ${escapeHtml(formatDateUk(opts.dateIso))}: ${summary}.</p>
    ${reportingSectionHtml("Overdue", digestRows(opts.items, "red"), true, "Nothing overdue.", digestGroup)}
    ${reportingSectionHtml("Due soon", digestRows(opts.items, "amber"), false, "Nothing due soon.", digestGroup)}`;
  /* THE SAME CARD AS THE PEOPLE REPORT (DEF-055, Phil 2026-09-23, agreed by popup). The digest
     used to stack every row onto three lines: name, then "Person, Swansea" under it, then the
     date under "Overdue". It now reads exactly like the People report: 880 wide, four columns,
     one line a row, with the branch said once in a grey heading above its rows. */
  return shell({
    maxWidth: REPORT_CARD_WIDTH,
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
  /** False for a row the Planner cannot book, such as a DBS renewal. Its Planned cell is left
   *  blank rather than showing a red cross that would mean nothing. */
  plannable?: boolean;
  /** Only the Supervisor digest reads this, for its branch headings (DEF-055). */
  population?: "people" | "service_users";
};

/**
 * The width the daily reports need for four columns. Everything else stays at the default.
 *
 * 880 since 2026-09-23 (Phil: "make the tile wider as i want all info on one line"). At 680 the
 * Date and Planned cells each had to stack onto two lines to fit; at 880 every row reads across
 * on one line on a desktop. A phone narrower than the card scrolls a long row sideways a little
 * rather than wrapping it, which was agreed by popup.
 */
const REPORT_CARD_WIDTH = 880;

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
 * ONE LINE, "Lauren Morgan, 02/10/2026" (Phil, 2026-09-23: "i want all info on one line"). It
 * sat on two lines while the card was 680 wide; at 880 there is room, and nowrap stops a long
 * name breaking across lines.
 */
function plannedCellHtml(planned: ReportingRow["planned"], plannable = true): string {
  /* NOT EVERY ROW CAN BE BOOKED. A DBS renewal is an application to a third party, not a visit
     somebody goes out on, so a cross against it would be answering a question nobody asked. */
  if (!plannable) {
    return `<span style="color:${MUTED};">&ndash;</span>`;
  }
  if (!planned) {
    return `<span style="color:${RED_PILL};font-size:16px;font-weight:700;line-height:1;" aria-label="Not planned">&#10005;</span>`;
  }
  const who = (planned.conductorName ?? "").trim();
  const when = `<span style="color:${MUTED};white-space:nowrap;">${escapeHtml(formatDateShort(planned.scheduledDate))}</span>`;
  /* A booking whose conductor has left the company still has a date, and the date is the half
     that matters: it is booked. Saying so without a name beats showing a cross. */
  return who
    ? `<span style="color:#ffffff;">${escapeHtml(who)}</span>, ${when}`
    : `<span style="color:${MUTED};">Booked</span>, ${when}`;
}

/** One section (Overdue or Due in the next 14 days) as a four column table:
 *  Name, Task, Date, Planned. One row per check. Empty renders a calm all clear line. */
function reportingSectionHtml(
  title: string,
  rows: ReportingRow[],
  overdue: boolean,
  emptyText: string,
  /** When given, a small grey heading row goes in wherever this changes (the digest's branch
   *  headings, DEF-055). Rows must already be sorted by it. The reports pass nothing. */
  groupOf?: (r: ReportingRow) => string,
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
    <th style="${th}width:24%;">Name</th>
    <th style="${th}width:20%;">Task</th>
    <th style="${th}width:30%;">Date</th>
    <th style="${lastTh}width:26%;">Planned</th>
  </tr>`;
  const groupTd = `padding:14px 0 6px 0;font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid rgba(255,255,255,0.07);`;
  let lastGroup: string | null = null;
  const body = shown
    .map((r) => {
      let groupRow = "";
      if (groupOf) {
        const g = groupOf(r);
        if (g !== lastGroup) {
          groupRow = `<tr><td colspan="4" style="${groupTd}">${escapeHtml(g)}</td></tr>`;
          lastGroup = g;
        }
      }
      /* ONE LINE, DATE FIRST (Phil, 2026-09-23: "the date is under the days overdue", and he
         wanted all of it on one line; date first agreed by popup). "04/02/2026, 231 days overdue"
         lines the dates up down the column the same way the Due soon section does, and the days
         overdue, the escalation signal that used to be a separate chaser email, keeps its colour
         and weight. It stacked onto two lines on 2026-09-22 only because the card was 680 wide;
         at 880 there is room. */
      const lateness =
        r.daysOverdue != null && r.daysOverdue > 0
          ? `${r.daysOverdue} ${r.daysOverdue === 1 ? "day" : "days"} overdue`
          : "overdue";
      const dateCell = overdue
        ? `<span style="color:${TEXT};font-weight:400;">${escapeHtml(formatDateShort(r.dueDate))}</span>, ${lateness}`
        : escapeHtml(formatDateShort(r.dueDate));
      const weight = overdue && r.daysOverdue != null && r.daysOverdue >= 7 ? "font-weight:700;" : "";
      return `${groupRow}<tr>
        <td style="${cell}color:#ffffff;font-weight:600;">${escapeHtml(r.recordName)}</td>
        <td style="${cell}color:${TEXT};">${escapeHtml(r.checkName)}</td>
        <td style="${cell}color:${accent};white-space:nowrap;${weight}">${dateCell}</td>
        <td style="${lastCell}white-space:nowrap;">${plannedCellHtml(r.planned ?? null, r.plannable !== false)}</td>
      </tr>`;
    })
    .join("");
  const more =
    rows.length > shown.length
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:${MUTED};">Plus ${rows.length - shown.length} more in the app.</p>`
      : "";
  return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${header}${body}</table>${more}`;
}

/**
 * DBS renewals coming up, or already past.
 *
 * ITS OWN SECTION, and that is the whole reason it exists separately (Phil, 2026-09-22: "Should
 * appear on the people email as well when amber"). The two sections above are headed "overdue"
 * and "due in the next 14 days". A DBS goes amber at NINETY days, because that is how long one
 * takes to come back, so putting a renewal due in eighty days under a fourteen day heading would
 * make the heading a lie. A heading that says what it is costs four lines and tells the truth.
 *
 * NOTHING AT ALL IS DRAWN when there is none due: a manager with no DBS coming up should not
 * read a line about DBS every morning for a year.
 */
function trackerDateSectionHtml(rows: ReportingRow[], pastHeading: string, soonHeading: string): string {
  if (rows.length === 0) return "";
  const past = rows.filter((r) => r.daysOverdue != null && r.daysOverdue > 0);
  const soon = rows.filter((r) => !(r.daysOverdue != null && r.daysOverdue > 0));
  return `${past.length > 0 ? reportingSectionHtml(pastHeading, past, true, "") : ""}${
    soon.length > 0 ? reportingSectionHtml(soonHeading, soon, false, "") : ""
  }`;
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
  /**
   * DBS renewals that are amber or already past (Phil, 2026-09-22: "Should appear on the people
   * email as well when amber"). People only; a service user has no DBS.
   */
  dbsRenewals?: ReportingRow[];
  /** Right to Work expiries, amber at ninety days or already past (DEF-071). People only. */
  rtwExpiries?: ReportingRow[];
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
    ${reportingSectionHtml("Records due in the next 14 days", opts.dueSoon, false, "Nothing due in the next 14 days.")}
    ${trackerDateSectionHtml(opts.dbsRenewals ?? [], "DBS renewals overdue", "DBS renewals coming up")}
    ${trackerDateSectionHtml(opts.rtwExpiries ?? [], "Right to Work expired", "Right to Work expiring")}`;

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

/** Subject of the email sent when somebody is @mentioned in an Update. */
export function mentionEmailSubject(authorName: string): string {
  return `${authorName} mentioned you in an update`;
}

/**
 * Somebody was @mentioned in an Update on a record (0324, Phil 2026-09-24).
 *
 * IT NEVER CARRIES THE WORDS. An update can hold care details, and those belong in the app,
 * behind a login, not in somebody's inbox. It says who, on whose record, and gives the button.
 */
export function mentionEmailHtml(opts: {
  recipientName: string;
  authorName: string;
  recordName: string;
  recordKind: "person" | "service_user";
  companyName: string;
  url: string;
}): string {
  const whose = opts.recordKind === "person" ? "the People record for" : "the Service User record for";
  return noticeEmailHtml({
    preheader: mentionEmailSubject(opts.authorName),
    heading: "You were mentioned in an update",
    bodyHtml: `<p style="margin:0 0 12px 0;">Hello ${escapeHtml(opts.recipientName)}.</p>
    <p style="margin:0 0 12px 0;">${escapeHtml(opts.authorName)} mentioned you in an update on ${whose}
    <strong style="color:#ffffff;">${escapeHtml(opts.recordName)}</strong>${opts.companyName ? ` at ${escapeHtml(opts.companyName)}` : ""}.</p>
    <p style="margin:0;">Open the record to read it. For privacy, the update itself is not included in this email.</p>`,
    ctaLabel: "Open the record",
    ctaUrl: opts.url,
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

/** Subject for a password reset. Plain, so it is recognised in a crowded inbox. */
export function passwordResetSubject(): string {
  return "Reset your Be Care Compliant password";
}

/**
 * Password reset email (2026-09-23). The same branded shell and CTA button as the invitation:
 * never a bare link in a customer email. Says who asked for it when an Admin did, because an
 * unexpected reset email with no explanation is exactly what a phishing email looks like.
 */
export function passwordResetEmailHtml(opts: {
  recipientName: string;
  actionUrl: string;
  /** Set when an Admin sent it from Settings rather than the person asking themselves. */
  sentByName?: string | null;
}): string {
  const who = opts.sentByName
    ? `${escapeHtml(opts.sentByName)} has sent you a link to set a new password for Be Care Compliant.`
    : "Somebody, hopefully you, asked to reset the password for your Be Care Compliant account.";
  const body = `
    <p style="margin:0 0 12px 0;">Hello ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 12px 0;">${who}</p>
    <p style="margin:0;">Use the button below to choose a new one. Setting it signs you out of Be Care
    Compliant everywhere else, so if anybody else knew your old password they no longer have access.</p>`;
  return shell({
    preheader: "Set a new password for Be Care Compliant.",
    heading: "Reset your password",
    bodyHtml: body,
    ctaLabel: "Set a new password",
    ctaUrl: opts.actionUrl,
    footerNote:
      "If you did not ask for this you can ignore this email and your password stays as it is. The link works once and expires for your security.",
  });
}

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
