/**
 * Be Care Compliant — where a part-finished Form is kept, and for how long.
 *
 * A carer completing a Check in someone's front room is interrupted: the visit
 * ends, the phone locks, the battery goes. Every answer typed so far is held as a
 * DRAFT against the person who typed it, exactly as the On Call Handover has been
 * since 0116, and handed back when they return to the same form.
 *
 * The one thing the Handover did not have to solve: a carer legitimately has more
 * than one form part-finished at a time -- a spot check on one Service User, a
 * supervision on a carer. So a draft is keyed by the person AND by WHICH form they
 * are filling in. One row per user would mean opening the second form quietly
 * destroyed the first, which is the opposite of the point.
 *
 * Pure and importless: the key is a plain string both the browser and the server
 * build the same way, so neither can drift from the other.
 */

/** How long a part-finished form is worth handing back. Matches the Handover. */
export const DRAFT_HOURS = 12;

/** Join a draft's parts into one stable key. Blank parts are dropped, so a missing
 *  optional part can never collide with a different form that happens to have one. */
export function draftKey(kind: string, parts: ReadonlyArray<string | null | undefined>): string {
  const clean = parts.map((p) => String(p ?? "").trim()).filter((p) => p !== "");
  return [kind, ...clean].join("|");
}

/** A Check being completed. The population is in the key because People and Service
 *  User check instances are different tables and could share an id. */
export function checkDraftKey(population: "people" | "service_users", instanceId: string): string {
  return draftKey("check", [population, instanceId]);
}

/** A document / tracker Form (DBS, Right to Work, Probation) on one person. */
export function trackerDraftKey(personId: string, formKey: string): string {
  return draftKey("tracker", [personId, formKey]);
}

/** A Form completed in a slide-over (holiday, absence, complaint, one to one).
 *  The hidden fields the dialog posts ARE its context -- which person, which
 *  request -- so they belong in the key: the same dialog opened on someone else
 *  must not hand back the answers typed about the first. */
export function dialogDraftKey(title: string, extraFields?: Record<string, string>): string {
  const ctx = Object.entries(extraFields ?? {})
    .map(([k, v]) => `${k}=${String(v ?? "").trim()}`)
    .sort();
  return draftKey("dialog", [title, ...ctx]);
}

/** Whether a stored draft is still worth handing back. Anything older than
 *  DRAFT_HOURS is ignored on read (and overwritten by the next save), so a draft
 *  expires on its own without anything having to sweep up after it. A timestamp in
 *  the future is a clock disagreement, not a stale draft, so it counts as fresh. */
export function draftFresh(updatedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!updatedAt) return false;
  const at = new Date(updatedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  if (age < 0) return true;
  return age <= DRAFT_HOURS * 3600 * 1000;
}

/** What the form opens with: the answers supplied outside the form first (the
 *  supervision number from the button that was clicked), then whatever the person
 *  had actually typed, which always wins. Returns undefined when there is nothing,
 *  so the renderer stays uncontrolled exactly as it was before drafting existed. */
export function mergeDraft<T extends Record<string, unknown>>(
  presets: T | undefined | null,
  draft: T | undefined | null,
): T | undefined {
  const merged = { ...(presets ?? {}), ...(draft ?? {}) } as T;
  return Object.keys(merged).length > 0 ? merged : undefined;
}
