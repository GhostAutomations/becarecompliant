/**
 * Be Care Compliant — the notification timing a company starts with.
 *
 * ONE place. These numbers were written out three times (the digest cron's fallback,
 * the save action's clamp, and the settings page) and a default that lives in three
 * places is a default that will one day disagree with itself.
 *
 * First chaser at 1 day, second at 3, SMS at 5 (Phil, 2026-09-04): an overdue
 * compliance check is chased the next day, not the next week. Chasing a week late is
 * how a check ends up a month late.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested.
 */

export type NotificationDefaults = {
  emailDigestEnabled: boolean;
  smsEnabled: boolean;
  chaserFirstDays: number;
  chaserSecondDays: number;
  smsOverdueDays: number;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationDefaults = {
  emailDigestEnabled: true,
  /** Off until SMS is configured on the server AND the company opts in. */
  smsEnabled: false,
  chaserFirstDays: 1,
  chaserSecondDays: 3,
  smsOverdueDays: 5,
};
