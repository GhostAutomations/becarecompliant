/**
 * Be Care Compliant — the four morning emails, per person (0475, Phil 2026-10-15;
 * docs/decisions/personal-notifications.md).
 *
 * Pure and import free so node --test can load it. Who gets which is decided in the database
 * (public.morning_email_choices, with morning_email_default giving exactly what each role got
 * before); this names them for the Settings grid and answers "does this person get this one" for
 * the daily-digest cron.
 */

export const MORNING_EMAILS = [
  {
    key: "branch_digest",
    name: "Branch digest",
    whatsInIt: "Overdue and due soon checks in their branches. Only sent when there is something to do.",
  },
  {
    key: "people_report",
    name: "People compliance report",
    whatsInIt: "Every People check, training, Social Care Wales, DBS and Right to Work, overdue and due soon. Sent every morning.",
  },
  {
    key: "service_user_report",
    name: "Service User compliance report",
    whatsInIt: "Every Service User check, overdue and due soon. Sent every morning.",
  },
  {
    key: "briefings_overdue",
    name: "Briefings overdue",
    whatsInIt: "Briefings not read by their date. Only sent when one is overdue.",
  },
] as const;

export type MorningEmailKey = (typeof MORNING_EMAILS)[number]["key"];

export function isMorningEmailKey(k: string): k is MorningEmailKey {
  return MORNING_EMAILS.some((m) => m.key === k);
}

/** choices: profile id to the morning emails they get (from morning_email_choices). */
export type MorningChoices = Map<string, Set<string>>;

export function choicesFrom(rows: Array<{ profile_id: string; email_key: string; receive: boolean }>): MorningChoices {
  const out: MorningChoices = new Map();
  for (const r of rows) {
    if (!r.receive) continue;
    const set = out.get(r.profile_id) ?? new Set<string>();
    set.add(r.email_key);
    out.set(r.profile_id, set);
  }
  return out;
}

export function wantsMorningEmail(choices: MorningChoices, profileId: string, key: MorningEmailKey): boolean {
  return choices.get(profileId)?.has(key) ?? false;
}
