/**
 * Be Care Compliant — what an Update is ABOUT (0374, Phil 2026-10-02).
 *
 * An Update can be about one of the record's own checks, or (a person only) their DBS renewal or
 * Right to Work. A linked Update posted after the check fell due counts as "action in place" on
 * the Readiness page. The value travels as one string: "check:<instance id>", "dbs_renewal",
 * "right_to_work", or "" for nothing in particular. Pure and importless so it can be unit tested.
 */

export type AboutTracker = "dbs_renewal" | "right_to_work";
export type About = { instance: string; tracker: null } | { instance: null; tracker: AboutTracker } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRACKER_LABEL: Record<AboutTracker, string> = {
  dbs_renewal: "DBS renewal",
  right_to_work: "Right to Work",
};

/** Read the string. undefined means it was not one we know (refused), null means nothing. */
export function parseAbout(raw: unknown): About | undefined {
  const v = String(raw ?? "").trim();
  if (v === "") return null;
  if (v === "dbs_renewal" || v === "right_to_work") return { instance: null, tracker: v };
  if (v.startsWith("check:") && UUID.test(v.slice(6))) return { instance: v.slice(6).toLowerCase(), tracker: null };
  return undefined;
}

export function aboutValue(a: { instance?: string | null; tracker?: string | null }): string {
  if (a.instance) return `check:${a.instance}`;
  if (a.tracker === "dbs_renewal" || a.tracker === "right_to_work") return a.tracker;
  return "";
}
