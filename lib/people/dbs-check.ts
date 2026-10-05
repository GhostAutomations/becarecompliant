/**
 * Be Care Compliant — DBS dates that are probably typed wrong. Pure and IMPORTLESS, so node
 * --test can load it.
 *
 * WHY (Phil, 2026-09-23, item 7, DEF-059). Thistle had three DBS rows that read wrong: renewals
 * six and five years after the certificate where every other carer's is three, and a certificate
 * dated seven months after the carer started. Agreed by popup: WARN, BUT ALLOW. A company on the
 * DBS Update Service can properly hold a certificate longer, so nothing is refused; the person
 * typing is simply asked "are you sure" and told why.
 */

/** Three years: the renewal period nearly every provider works to. */
export const DBS_USUAL_RENEWAL_YEARS = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // 29 February plus a year that is not a leap year settles on 28 February.
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * ENHANCED DBS IS WORKED OUT FROM THE DATE OF ISSUE (Phil, 2026-10-05, agreed by popup): the
 * renewal is the issue date plus three years, to the day. It is a suggestion, not a lock: a
 * company on the DBS Update Service can type a later date over it. Null when the issue date is
 * not a whole ISO date.
 */
export function dbsRenewalFrom(issueDate: string | null | undefined): string | null {
  const iso = String(issueDate ?? "").trim();
  return ISO.test(iso) ? addYears(iso, DBS_USUAL_RENEWAL_YEARS) : null;
}

/**
 * What the Enhanced DBS box should hold after the issue date changes from `prevIssue` to
 * `nextIssue`. It follows the issue date while it is blank or still holds the date we worked out
 * last time; once somebody has typed their own date it is left alone. Clearing the issue date
 * clears a date we filled, never one they typed.
 */
export function followDbsRenewal(
  prevIssue: string | null | undefined,
  currentRenewal: string | null | undefined,
  nextIssue: string | null | undefined,
): string {
  const current = String(currentRenewal ?? "").trim();
  const ours = current === "" || current === dbsRenewalFrom(prevIssue);
  if (!ours) return current;
  return dbsRenewalFrom(nextIssue) ?? "";
}

/** Fill a blank renewal from the issue date. A renewal already given always wins. */
export function withDbsRenewal(
  issueDate: string | null | undefined,
  renewal: string | null | undefined,
): string | null {
  const given = String(renewal ?? "").trim();
  if (given) return given;
  return dbsRenewalFrom(issueDate);
}

function uk(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Plain sentences about anything that looks wrong. Empty when nothing does. */
export function dbsWarnings(input: {
  certificateDate?: string | null;
  renewalDate?: string | null;
  startDate?: string | null;
}): string[] {
  const cert = String(input.certificateDate ?? "").trim();
  const renewal = String(input.renewalDate ?? "").trim();
  const start = String(input.startDate ?? "").trim().slice(0, 10);
  const out: string[] = [];

  if (ISO.test(cert) && ISO.test(renewal)) {
    if (renewal <= cert) {
      out.push(`The renewal date (${uk(renewal)}) is not after the certificate date (${uk(cert)}).`);
    } else if (renewal > addYears(cert, DBS_USUAL_RENEWAL_YEARS)) {
      out.push(
        `The renewal date (${uk(renewal)}) is more than ${DBS_USUAL_RENEWAL_YEARS} years after the certificate date (${uk(cert)}).`,
      );
    }
  }
  if (ISO.test(cert) && ISO.test(start) && cert > start) {
    out.push(`The certificate (${uk(cert)}) is dated after they started (${uk(start)}).`);
  }
  return out;
}
