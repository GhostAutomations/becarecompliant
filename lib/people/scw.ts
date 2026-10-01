/**
 * SOCIAL CARE WALES REGISTRATION NUMBER (DEF-097, Phil 2026-10-01).
 *
 * The number has been stored on the Person since 0060 (the PQS "registered with Social Care Wales"
 * measure reads it) but could only be set by the CSV import: no screen showed it or let anybody
 * change it. Thistle asked where their numbers were. Pure and unit tested.
 */

const MAX_LENGTH = 20;

/** Tidy what was typed. Blank means "no number". */
export function cleanScwNumber(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (v === "") return { ok: true, value: null };
  if (v.length > MAX_LENGTH) return { ok: false, error: `A registration number is at most ${MAX_LENGTH} characters.` };
  if (!/^[A-Za-z0-9 /-]+$/.test(v)) return { ok: false, error: "A registration number can only have letters, numbers, spaces and the / sign, for example W/1234567." };
  return { ok: true, value: v };
}

export type ScwStatus = "registered" | "missing" | "not_yet";

/**
 * "missing" is what the PQS counts against the company: 6 or more months in post with no number
 * (lib/export/on-time.ts uses the same rule). Under 6 months it is "not_yet", not a gap.
 * todayIso and startIso are YYYY-MM-DD.
 */
export function scwStatus(number: string | null | undefined, startIso: string | null | undefined, todayIso: string): ScwStatus {
  if (number && number.trim() !== "") return "registered";
  if (!startIso) return "missing";
  const [y, m, d] = todayIso.split("-").map(Number);
  // Six calendar months back, the day clamped to the month's length (31 Oct goes to 30 Apr),
  // the same as addMonths in lib/recurrence, which the PQS report uses.
  const first = new Date(Date.UTC(y, m - 1 - 6, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  const cutoff = first.toISOString().slice(0, 10);
  return startIso <= cutoff ? "missing" : "not_yet";
}

/* ===========================================================================
 * THE RENEWAL DATE (0361, Phil 2026-10-01, popup).
 *
 * Social Care Wales registration lasts three years (Registration Rules 2024, rule 25(2)) and the
 * renewal must reach them at least 21 days before it expires (rule 16(4)). Amber 90 days before,
 * Phil's choice, so there is time to chase the carer and the endorsement; red once it has passed,
 * because the registration has then ended.
 * =========================================================================== */

export const SCW_RENEWAL_AMBER_DAYS = 90;
export const SCW_APPLY_DAYS_BEFORE = 21;

/** A typed renewal date: YYYY-MM-DD or blank. */
export function cleanScwDate(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = String(raw ?? "").trim();
  if (v === "") return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Enter the renewal date as a date." };
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: "That renewal date does not exist." };
  }
  if (y < 2015 || y > 2100) return { ok: false, error: "Check the renewal date: the year looks wrong." };
  return { ok: true, value: v };
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type ScwRenewalState = "in_date" | "due_soon" | "expired";

/** Null when there is no renewal date to judge. */
export function scwRenewalState(renewalIso: string | null | undefined, todayIso: string): ScwRenewalState | null {
  if (!renewalIso) return null;
  if (renewalIso < todayIso) return "expired";
  if (renewalIso <= addDaysIso(todayIso, SCW_RENEWAL_AMBER_DAYS)) return "due_soon";
  return "in_date";
}

/** The last day the renewal can reach Social Care Wales on time. */
export function scwApplyBy(renewalIso: string): string {
  return addDaysIso(renewalIso, -SCW_APPLY_DAYS_BEFORE);
}

/** For the PQS: a number, and not a registration that ended before asOf. */
export function scwCountsAsRegistered(
  number: string | null | undefined,
  renewalIso: string | null | undefined,
  asOfIso: string,
): boolean {
  if (!number || number.trim() === "") return false;
  return !renewalIso || renewalIso >= asOfIso;
}
