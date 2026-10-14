/**
 * Be Care Compliant — the Office matrix's cycle (Phil, 2026-10-14; docs/decisions/office-matrix.md).
 *
 * Pure and import free, so node --test can load it.
 *
 * A login ticked "Show on Office matrix" moves its person into the Office branch, where Lead the
 * Leader (LTL) runs the supervision cycle. ONE ENGINE, TWO USES: the cycle is still drawn by
 * supervisionSlots from a list of completion dates. For a person who has been ticked, that list is
 * their supervisions plus the LTLs RECORDED while they were ticked (0468 periods). LTLs recorded
 * before or after are ad hoc extras and move nothing, exactly as Lead the Leader always was.
 *
 * The database reads the same rule (public.office_cycle_dates), so the stored due date and the
 * register agree.
 */

export type OfficePeriod = { started_at: string; ended_at: string | null };
export type LtlCompletion = { date: string; submittedAt: string };

/** Ticked right now: an open period. */
export function onOffice(periods: readonly OfficePeriod[]): boolean {
  return periods.some((p) => p.ended_at === null);
}

const at = (iso: string) => Date.parse(iso);

/** The LTL completion dates that count towards the cycle: recorded inside a period. */
export function ltlCycleDates(
  ltl: readonly LtlCompletion[],
  periods: readonly OfficePeriod[],
): string[] {
  if (periods.length === 0) return [];
  return ltl
    .filter((c) => {
      const t = at(c.submittedAt);
      if (Number.isNaN(t)) return false;
      return periods.some((p) => t >= at(p.started_at) && (p.ended_at === null || t <= at(p.ended_at)));
    })
    .map((c) => c.date);
}

/** The word the cycle's columns and tiles use: "LTL" on the Office matrix, else "Supervision". */
export function cycleWord(office: boolean): "LTL" | "Supervision" {
  return office ? "LTL" : "Supervision";
}

/** The check that carries a person's open cycle due date. */
export function cycleCheckKey(office: boolean): "lead_the_leader" | "supervision" {
  return office ? "lead_the_leader" : "supervision";
}

/**
 * Whether the "Show on Office matrix" tick can be changed on a login, and if not, why (Phil's
 * popups 2026-10-14: only a login linked to a People record; only a job title Lead the Leader
 * applies to). The database refuses the same things (set_office_matrix); this only says so first.
 * A ticked login can always be unticked.
 */
export function officeTickBlock(input: {
  linked: boolean;
  ticked: boolean;
  jobTitle: string | null;
  ltlJobTitles: readonly string[] | null;
  leaverOrArchived: boolean;
  hasLtlCheck: boolean;
}): string | null {
  if (input.ticked) return null;
  if (!input.linked) return "This login is not linked to a People record. Link it to their record first.";
  if (input.leaverOrArchived) return "Their People record is a leaver or archived.";
  if (!input.hasLtlCheck) return "This company has no Lead the Leader check with a form.";
  const titles = (input.ltlJobTitles ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const mine = (input.jobTitle ?? "").trim().toLowerCase();
  if (titles.length > 0 && !titles.includes(mine)) {
    return `Lead the Leader does not apply to their job title (${(input.jobTitle ?? "").trim() || "none"}).`;
  }
  return null;
}
