/**
 * Whose planner the calendar is showing.
 *
 * TWO CHANGES, both Phil, 2026-09-15.
 *
 * 1. MINE IS NOW THE DEFAULT, for everyone. It used to open on the whole company. My own note in
 *    the page said "show me only mine for a moment is a question you ask, not a way you work" —
 *    that reasoning was wrong. The page is called My Planner, somebody opening it is asking where
 *    THEY are going, and making them narrow it every single time is a tax on the common case.
 *
 * 2. ONE PERSON'S CALENDAR CAN BE SINGLED OUT, by Admins, Registered Managers and the Responsible
 *    Individual. "All" answers "who is where this month" and is unreadable if what you want is
 *    "what has Rebecca got on". This is a VIEW, not a grant: it filters bookings the viewer can
 *    already see, and RLS decides that as it always did. Choosing a colleague can therefore never
 *    show more than All already showed them.
 *
 * WHY THE ALLOWED IDS ARE PASSED IN rather than checked here. The caller knows who is a conductor
 * in this company; this module knows the rule. Keeping them apart means the rule can be tested
 * against every awkward input without a database, and an id that is not on the list is simply not
 * a selection, so a hand-edited URL falls back rather than erroring.
 */

export type PlannerWho =
  | { kind: "mine" }
  | { kind: "all" }
  | { kind: "person"; personId: string };

/** The roles that may look at one named colleague's calendar. Phil's list, 2026-09-15. */
export const INDIVIDUAL_VIEW_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
];

export function canViewIndividuals(role: string): boolean {
  return INDIVIDUAL_VIEW_ROLES.includes(role);
}

/**
 * Turn the `who` URL parameter into a selection.
 *
 * Absent means MINE, which is the default the whole change is about. "all" is now the thing you
 * ask for. Anything else is read as a profile id and honoured only when the viewer's role allows
 * it AND the id is a conductor in this company; otherwise it falls back to mine, because a URL
 * somebody has edited should quietly do the ordinary thing rather than explain itself.
 *
 * Selecting YOURSELF from the person list is normalised to "mine", so the two controls cannot
 * disagree about what is highlighted.
 */
export function plannerWho(
  who: string | null | undefined,
  viewerId: string,
  viewerRole: string,
  allowedIds: readonly string[],
): PlannerWho {
  const value = (who ?? "").trim();
  if (value === "" || value === "mine") return { kind: "mine" };
  if (value === "all") return { kind: "all" };
  if (!canViewIndividuals(viewerRole)) return { kind: "mine" };
  if (value === viewerId) return { kind: "mine" };
  if (!allowedIds.includes(value)) return { kind: "mine" };
  return { kind: "person", personId: value };
}

/** The `who` value that reproduces a selection in a link. Mine is the default, so it carries none. */
export function whoParam(selection: PlannerWho): string | null {
  if (selection.kind === "mine") return null;
  if (selection.kind === "all") return "all";
  return selection.personId;
}

/** Keep only the bookings the current selection is asking for. */
export function filterToWho<T extends { conductorId: string }>(
  bookings: readonly T[],
  selection: PlannerWho,
  viewerId: string,
): T[] {
  if (selection.kind === "all") return [...bookings];
  const wanted = selection.kind === "mine" ? viewerId : selection.personId;
  return bookings.filter((b) => b.conductorId === wanted);
}
