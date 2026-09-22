/**
 * Be Care Compliant — may this person's record be deleted? Pure and IMPORTLESS, so node --test
 * can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-22). There has never been a way to delete a person. Only Leaver
 * and Archive, which are both right for somebody who has left and both wrong for a record
 * created by mistake — a duplicate, a typo, somebody added to the wrong company. Deleting the
 * one carer added in error that morning took hand written SQL, and by Phil's own rule for this
 * phase, anything that can only be put right with SQL is a defect.
 *
 * WHY IT IS THIS CAUTIOUS. A carer's supervisions, spot checks and safeguarding evidence are
 * records CIW expects the provider to hold. Deleting somebody who has any of that is destroying
 * evidence, and no confirmation dialog makes that acceptable. So delete is for a record with
 * NOTHING against it, and everything else is a Leaver (Phil, asked and answered 2026-09-22:
 * "Only a clean record").
 *
 * WHAT COUNTS AS SOMETHING AGAINST THEM: work done in the product. A signed Evidence, a check
 * somebody completed, a training record, an absence, a holiday, an incident, a complaint, a
 * planner booking, a form they submitted, or a retention hold a manager deliberately set.
 *
 * WHAT DOES NOT COUNT, and this is a judgement worth reading twice:
 *  - The checks APPLIED to every new starter automatically. Blank, never completed, created by
 *    the act of adding them. Counting those would mean nobody could ever be deleted.
 *  - The standing policies handed to every new starter. Same reason, unless one has been signed.
 *  - Their tracker row, created by a trigger the moment the record exists.
 *  - History typed into "They already work here" at the moment of creation. It carries NO
 *    evidence — nobody signed anything, there is no form and no PDF — and it was typed in the
 *    same breath as the record it belongs to. Refusing to delete a record because of the dates
 *    somebody mistyped into it while creating it would recreate the exact problem this solves.
 *    A completion recorded AFTERWARDS, through a check, is evidence and does block.
 */

/** What exists against a person, counted by the caller. */
export type PersonFootprint = {
  evidence: number;
  /** Checks with a completion stamped on them. Blank applied checks are not counted. */
  completedChecks: number;
  training: number;
  absences: number;
  holidays: number;
  incidents: number;
  complaints: number;
  plannerBookings: number;
  formSubmissions: number;
  /** Briefings or policies they have actually signed. */
  signedAssignments: number;
  /** A hold a manager set deliberately, which outranks everything else here. */
  retentionHold: boolean;
};

const LABELS: ReadonlyArray<{ key: keyof PersonFootprint; one: string; many: string }> = [
  { key: "evidence", one: "a completed Form", many: "completed Forms" },
  { key: "completedChecks", one: "a completed check", many: "completed checks" },
  { key: "training", one: "a training record", many: "training records" },
  { key: "absences", one: "an absence", many: "absences" },
  { key: "holidays", one: "a holiday request", many: "holiday requests" },
  { key: "incidents", one: "an incident", many: "incidents" },
  { key: "complaints", one: "a complaint", many: "complaints" },
  { key: "plannerBookings", one: "a Planner booking", many: "Planner bookings" },
  { key: "formSubmissions", one: "a submitted form", many: "submitted forms" },
  { key: "signedAssignments", one: "a signed briefing", many: "signed briefings" },
];

/**
 * Why this record cannot be deleted, in the words a manager would use, or null when it can.
 *
 * IT NAMES WHAT IS IN THE WAY. "This record cannot be deleted" on its own leaves somebody
 * clicking around looking for the thing they cannot see; a sentence that says "2 completed
 * checks and a holiday request" tells them at once that this is a real person with a history,
 * not a mistake.
 */
export function deleteRefusalReason(f: PersonFootprint): string | null {
  if (f.retentionHold) {
    return "This record is on a retention hold, so it cannot be deleted. Lift the hold first if the hold was set in error.";
  }
  const found = LABELS.filter((l) => (f[l.key] as number) > 0).map((l) => {
    const n = f[l.key] as number;
    return n === 1 ? l.one : `${n} ${l.many}`;
  });
  if (found.length === 0) return null;
  const list =
    found.length === 1
      ? found[0]
      : `${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}`;
  return `This record has ${list} against it, so deleting it would destroy evidence an inspector may ask for. Mark them as a leaver instead.`;
}

/** Can it go? */
export function canDeletePerson(f: PersonFootprint): boolean {
  return deleteRefusalReason(f) === null;
}

/**
 * Has the person deleting this typed the name of the record they are deleting?
 *
 * THE SERVER ASKS THIS, NOT ONLY THE FORM (found in browser testing, 2026-09-22). The first
 * version checked the typed name in the browser and nowhere else, and the browser check was a
 * style that greyed the button out for a mouse. Tab and Enter went straight past it. A guard
 * that lives only in the page is a suggestion; the action now refuses unless the name comes
 * with the request, so no route to the button, and no hand built request, skips it.
 *
 * Forgiving of case, of stray spaces at either end and of doubled spaces inside, because a
 * manager retyping "Mary  Ikpi-Ubi" has confirmed who she means. Not forgiving of anything
 * else: the point is that the two names in front of her are hard to tell apart.
 */
export function nameConfirmed(typed: string | null | undefined, fullName: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const want = norm(fullName ?? "");
  if (!want) return false;
  return norm(typed ?? "") === want;
}
