/**
 * Pure digest logic: scoping items to recipients, chaser selection and dedupe
 * keys. No IO here so it is unit-testable; the cron route wires it to
 * lib/notifications/data.ts and the senders.
 *
 * Agreed rules (Phil, popup 2026-07-11):
 *  - One daily digest per recipient at 07:00 Europe/London: their due-soon
 *    (amber) + overdue (red) items. Staff members are never emailed.
 *  - Chaser email to Managers + Admins when an item is >= 7 and >= 14 days
 *    overdue (thresholds per notification_settings), once per threshold per
 *    instance + due date (dedupe key). SMS at >= 14 days when the company has
 *    SMS opted in.
 */
import { parseCivilDate, daysBetween, todayInLondon, formatCivilDate } from "@/lib/recurrence";
import type {
  AttentionItem,
  Recipient,
  NotificationSettings,
  ReportingCheck,
} from "@/lib/notifications/data";

export type RecipientDigest = {
  recipient: Recipient;
  items: AttentionItem[];
  overdueCount: number;
  dueSoonCount: number;
};

/** ISO date for today's London calendar date, used in digest dedupe keys. */
export function londonDateIso(now: Date = new Date()): string {
  return formatCivilDate(todayInLondon(now));
}

/**
 * The cron gate: true from 07:00 London onwards, false before. Two UTC
 * schedules fire (06:00 and 07:00): whichever lands at 07:00 London sends,
 * the winter 06:00-London run is refused. Sends AFTER 07:00 also pass, which
 * makes Vercel's manual "Run" button work at any time of day and lets a
 * missed morning self-heal: the per-day dedupe keys in notification_log mean
 * a day that already sent can never send twice (Phil, 2026-07-13).
 */
export function isLondonSendHour(now: Date = new Date(), sendHour = 7): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  return hour >= sendHour;
}

/** Whole days an item is overdue as of the London date. 0 = not overdue. */
export function daysOverdue(dueDate: string, now: Date = new Date()): number {
  const diff = daysBetween(parseCivilDate(dueDate), todayInLondon(now));
  return Math.max(0, diff);
}

/** The slice of a company's items one recipient is responsible for. */
export function scopeItems(recipient: Recipient, items: AttentionItem[]): AttentionItem[] {
  if (recipient.role === "company_admin") return items;
  if (recipient.role === "manager") {
    const branches = new Set(recipient.branchIds);
    return items.filter((i) => i.branchId !== null && branches.has(i.branchId));
  }
  // Supervisor: assigned caseload only.
  const people = new Set(recipient.personIds);
  const sus = new Set(recipient.serviceUserIds);
  return items.filter((i) =>
    i.population === "people" ? people.has(i.recordId) : sus.has(i.recordId),
  );
}

/** Build each recipient's digest; recipients with nothing to report get none. */
export function buildDigests(
  recipients: Recipient[],
  items: AttentionItem[],
): RecipientDigest[] {
  const digests: RecipientDigest[] = [];
  for (const recipient of recipients) {
    const scoped = scopeItems(recipient, items);
    if (scoped.length === 0) continue;
    digests.push({
      recipient,
      items: scoped,
      overdueCount: scoped.filter((i) => i.rag === "red").length,
      dueSoonCount: scoped.filter((i) => i.rag === "amber").length,
    });
  }
  return digests;
}

export function digestDedupeKey(profileId: string, londonDate: string): string {
  return `digest:${profileId}:${londonDate}`;
}

export type ChaserLevel = { kind: "chaser_7" | "chaser_14"; thresholdDays: number };

/**
 * The highest chaser level an overdue item has crossed, or null. Uses >= so a
 * missed cron day still fires the chaser the next morning; the dedupe key
 * (level + instance + due date + recipient) keeps it to exactly one send per
 * level per overdue cycle. Returning only the highest level means an item
 * first noticed at 20 days overdue chases once, not twice.
 */
export function chaserLevel(
  item: AttentionItem,
  settings: NotificationSettings,
  now: Date = new Date(),
): ChaserLevel | null {
  if (item.rag !== "red") return null;
  const overdue = daysOverdue(item.dueDate, now);
  if (overdue >= settings.chaserSecondDays) {
    return { kind: "chaser_14", thresholdDays: settings.chaserSecondDays };
  }
  if (overdue >= settings.chaserFirstDays) {
    return { kind: "chaser_7", thresholdDays: settings.chaserFirstDays };
  }
  return null;
}

export function chaserDedupeKey(
  kind: string,
  instanceId: string,
  dueDate: string,
  profileId: string,
): string {
  return `${kind}:${instanceId}:${dueDate}:${profileId}`;
}

export function smsDedupeKey(instanceId: string, dueDate: string, phone: string): string {
  return `sms_overdue:${instanceId}:${dueDate}:${phone}`;
}

/** SMS escalation is Managers + Admins with a phone, company opted in. */
export function smsEscalationItems(
  items: AttentionItem[],
  settings: NotificationSettings,
  now: Date = new Date(),
): AttentionItem[] {
  if (!settings.smsEnabled) return [];
  return items.filter(
    (i) => i.rag === "red" && daysOverdue(i.dueDate, now) >= settings.smsOverdueDays,
  );
}

// ---------------------------------------------------------------------------
// Daily People / Service User reporting emails (Phil, 2026-07-13). Managers and
// Admins get a per population report each morning INSTEAD of the generic digest:
// records overdue, and records with a check due in the next 14 days. Supervisors
// keep the caseload digest. Compliance checks only (no holiday or absence).
// ---------------------------------------------------------------------------

/** Split a population's checks into overdue (due before today) and due soon
 *  (due today through today + 14 days). Data is already capped at the horizon. */
export function splitReporting(
  checks: ReportingCheck[],
  now: Date = new Date(),
): { overdue: ReportingCheck[]; dueSoon: ReportingCheck[] } {
  const today = todayInLondon(now);
  const overdue: ReportingCheck[] = [];
  const dueSoon: ReportingCheck[] = [];
  for (const c of checks) {
    // daysBetween(due, today) > 0 means today is after the due date, i.e. overdue.
    if (daysBetween(parseCivilDate(c.dueDate), today) > 0) overdue.push(c);
    else dueSoon.push(c);
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  dueSoon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { overdue, dueSoon };
}

/** Scope a population's checks to a recipient: Admins get the whole company,
 *  Managers get their branches. Supervisors do not receive the company reports. */
export function scopeReporting(recipient: Recipient, checks: ReportingCheck[]): ReportingCheck[] {
  if (recipient.role === "company_admin") return checks;
  if (recipient.role === "manager") {
    const branches = new Set(recipient.branchIds);
    return checks.filter((c) => c.branchId !== null && branches.has(c.branchId));
  }
  return [];
}

/** One report per recipient, per population, per London day. */
export function reportingDedupeKey(
  profileId: string,
  population: "people" | "service_users",
  londonDate: string,
): string {
  return `report:${population}:${profileId}:${londonDate}`;
}
