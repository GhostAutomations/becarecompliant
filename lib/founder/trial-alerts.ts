/**
 * Be Care Compliant — a trial request must never wait in silence.
 *
 * PURE, no runtime imports.
 *
 * WHAT HAPPENED, 27 August to 2 September 2026: Livity Care Ltd and Clareege Ltd asked for a
 * trial through the website. Both rows landed correctly. Six days later both were still 'new'
 * and Phil had received nothing. The alert email was attempted and then forgotten — no record
 * that it left, no record of why it did not, and no second attempt ever.
 *
 * THE PRINCIPLE, and it is not only about email: the one thing on this platform that costs real
 * money when it is late was the one thing with no proof of delivery and no chase. A compliance
 * product that chases a care manager about an overdue supervision, every day, without fail, was
 * not chasing its own founder about a paying customer trying to hand over money.
 *
 * So: the outcome of the alert is recorded on the row, the founder console shows how long each
 * request has been waiting, and a daily chase keeps going until somebody actually deals with it.
 * The chase stops when the request stops being 'new' — marking it Contacted is the way out, and
 * every chase email says so.
 */

/** A request sits quietly for this long before the console starts colouring it. */
export const WAITING_AMBER_HOURS = 4;
/** Past this it is a red flag: a working day has gone by. */
export const WAITING_RED_HOURS = 24;

export type WaitingTone = "fresh" | "amber" | "red";

export type TrialAlertRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  status: string;
  created_at: string;
  founder_alerted_at: string | null;
  founder_alert_error: string | null;
};

function hoursBetween(fromIso: string, now: Date): number {
  const then = Date.parse(fromIso);
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, (now.getTime() - then) / 3_600_000);
}

/** Whole hours waiting, which is what every other rule here is derived from. */
export function hoursWaiting(row: { created_at: string }, now: Date = new Date()): number {
  return Math.floor(hoursBetween(row.created_at, now));
}

/** How loudly the console should say it. Only ever applied to requests still 'new'. */
export function waitingTone(hours: number): WaitingTone {
  if (hours >= WAITING_RED_HOURS) return "red";
  if (hours >= WAITING_AMBER_HOURS) return "amber";
  return "fresh";
}

/**
 * Plain English, because "waiting 147h" is not something anybody reads at a glance.
 * Days once it passes 48 hours, since by then the number of hours has stopped meaning anything.
 */
export function waitingLabel(hours: number): string {
  if (hours < 1) return "Waiting less than an hour";
  if (hours === 1) return "Waiting 1 hour";
  if (hours < 48) return `Waiting ${hours} hours`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} days`;
}

/**
 * What the console says about whether the founder was actually told.
 *
 * NEVER claims delivery it cannot prove. A row with no timestamp and no error is not "fine, no
 * news" — it is unknown, and it says unknown.
 */
export function alertDeliveryLabel(row: {
  founder_alerted_at: string | null;
  founder_alert_error: string | null;
}): { text: string; ok: boolean } {
  if (row.founder_alerted_at) return { text: "You were emailed about this", ok: true };
  if (row.founder_alert_error) return { text: `Alert did not send: ${row.founder_alert_error}`, ok: false };
  return { text: "No alert recorded — you may never have been told about this one", ok: false };
}

/** The chase only ever concerns requests still waiting on the founder. */
export function needsChase(row: { status: string }): boolean {
  return row.status === "new";
}

/**
 * One chase per request per London day. The date is in the key ON PURPOSE — unlike a compliance
 * chaser, which must fire once for a given due date, this one repeats daily until it is dealt
 * with, because the failure being fixed is exactly "nobody looked for six days".
 */
export function chaseDedupeKey(requestId: string, londonDate: string): string {
  return `trial_request_chase:${requestId}:${londonDate}`;
}

/** Subject line. Says the number and the worst wait, so it is triageable from a phone lock screen. */
export function chaseSubject(count: number, oldestHours: number): string {
  const who = count === 1 ? "1 trial request" : `${count} trial requests`;
  if (oldestHours >= WAITING_RED_HOURS) {
    const days = Math.max(1, Math.floor(oldestHours / 24));
    return `${who} waiting — oldest ${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${who} waiting for a reply`;
}

/**
 * The opening line, which is the only part most people read. It gets blunter with age, because a
 * lead that has been ignored for a week is a different situation from one that came in overnight.
 */
export function chaseOpening(count: number, oldestHours: number): string {
  const subject = count === 1 ? "A care company has" : `${count} care companies have`;
  if (oldestHours >= 72) {
    const days = Math.floor(oldestHours / 24);
    return `${subject} asked for a trial and nobody has replied. The oldest has been waiting ${days} days.`;
  }
  if (oldestHours >= WAITING_RED_HOURS) {
    return `${subject} asked for a trial and is still waiting after more than a day.`;
  }
  return `${subject} asked for a trial and is waiting for a reply.`;
}

/** Said at the bottom of every chase, so the way to stop them is never a mystery. */
export const CHASE_FOOTER =
  "These arrive daily while a request is still New. Marking it Contacted, Provisioned or Declined in the founder console stops them.";
