/**
 * Be Care Compliant — the morning emails, per person and per part (0475, 0476, Phil 2026-10-15;
 * docs/decisions/personal-notifications.md).
 *
 * Pure and import free so node --test can load it. Who gets which part is decided in the database
 * (public.morning_email_choices, the default being exactly what each role got before); this
 * describes the emails for the Settings grid and answers, for the daily-digest cron, "does this
 * person get this email" and "which parts of this report".
 */

export const MORNING_EMAILS = [
  {
    key: "branch_digest",
    name: "Branch digest",
    whatsInIt: "Overdue and due soon checks in their branches. Only sent when there is something to do.",
  },
  {
    key: "people_report",
    name: "People report",
    whatsInIt: "Overdue and due soon, every morning. Tick the parts they should get; with none ticked it is not sent.",
  },
  {
    key: "service_user_report",
    name: "Service User report",
    whatsInIt: "Overdue and due soon, every morning. Tick the parts they should get; with none ticked it is not sent.",
  },
  {
    key: "briefings_overdue",
    name: "Briefings overdue",
    whatsInIt: "Briefings not read by their date. Only sent when one is overdue.",
  },
] as const;

export type MorningEmailKey = (typeof MORNING_EMAILS)[number]["key"];
export type ReportKey = "people_report" | "service_user_report";

/** The People report's own parts beside its check types. */
export const PEOPLE_EXTRA_PARTS = ["training", "scw", "dbs", "rtw"] as const;

export function checkPart(definitionId: string): string {
  return `check:${definitionId}`;
}

export type MorningRow = { profile_id: string; email_key: string; part: string; receive: boolean };

export type MorningChoices = {
  /** profile id to the "key|part" pairs ticked for them */
  ticked: Map<string, Set<string>>;
  /** every part each email has in this company, ticked or not */
  parts: Map<string, Set<string>>;
};

export function choicesFrom(rows: MorningRow[]): MorningChoices {
  const ticked = new Map<string, Set<string>>();
  const parts = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = parts.get(r.email_key) ?? new Set<string>();
    p.add(r.part ?? "");
    parts.set(r.email_key, p);
    if (!r.receive) continue;
    const t = ticked.get(r.profile_id) ?? new Set<string>();
    t.add(`${r.email_key}|${r.part ?? ""}`);
    ticked.set(r.profile_id, t);
  }
  return { ticked, parts };
}

/** A whole email (Branch digest, Briefings overdue), or any part of a report. */
export function wantsMorningEmail(m: MorningChoices, profileId: string, key: MorningEmailKey): boolean {
  const t = m.ticked.get(profileId);
  if (!t) return false;
  for (const x of t) if (x.startsWith(`${key}|`)) return true;
  return false;
}

/**
 * Which parts of a report this person gets: null when none (no report at all), all when every
 * part is ticked (the report goes exactly as it always did, nothing filtered), otherwise the set.
 */
export function reportPartsFor(m: MorningChoices, profileId: string, key: ReportKey): { all: boolean; parts: Set<string> } | null {
  const t = m.ticked.get(profileId) ?? new Set<string>();
  const mine = new Set([...t].filter((x) => x.startsWith(`${key}|`)).map((x) => x.slice(key.length + 1)));
  if (mine.size === 0) return null;
  const every = m.parts.get(key) ?? new Set<string>();
  const all = [...every].every((p) => mine.has(p));
  return { all, parts: mine };
}

export function keepPart(rp: { all: boolean; parts: Set<string> }, part: string | null | undefined): boolean {
  if (rp.all) return true;
  return !!part && rp.parts.has(part);
}
