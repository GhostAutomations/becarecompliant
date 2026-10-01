/**
 * CIW's own status for a notice, as each inspection report's Summary of Non-Compliance gives it
 * (0364, Phil 2026-10-01, from Thistle Care's Cardiff and Gwent reports). Achieved is the only one
 * that closes a notice; the other three leave it open and counting against its theme.
 *
 * Pure and importless so it can be unit tested.
 */

export const NOTICE_STATUSES = [
  { value: "new", label: "New", meaning: "Found at this inspection." },
  { value: "reviewed", label: "Reviewed", meaning: "Looked at and not yet achieved; the date to put it right is still to come." },
  { value: "not_achieved", label: "Not achieved", meaning: "Tested at the inspection and not achieved." },
  { value: "achieved", label: "Achieved", meaning: "Tested at the inspection and achieved." },
] as const;

export type NoticeStatus = (typeof NOTICE_STATUSES)[number]["value"];

export function isNoticeStatus(v: unknown): v is NoticeStatus {
  return typeof v === "string" && NOTICE_STATUSES.some((s) => s.value === v);
}

export function noticeStatusLabel(v: string | null | undefined): string {
  return NOTICE_STATUSES.find((s) => s.value === v)?.label ?? "New";
}

/** Achieved closes it; anything else reopens it. Keeps resolved_on and the status in step. */
export function resolvedOnFor(status: NoticeStatus, current: string | null, today: string): string | null {
  if (status === "achieved") return current ?? today;
  return null;
}
