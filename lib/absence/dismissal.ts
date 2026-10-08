/**
 * Be Care Compliant — a dismissal recorded at an absence meeting (Phil, 2026-10-08, after the four
 * stage test). Pure and importless, so node --test can load it.
 *
 * "Dismissal" is its own Outcome of the meeting. It needs the last day of employment and the
 * notice (worked, or paid in lieu), both named in the outcome letter. Choosing Dismissal under
 * Warning or dismissal without the Dismissal outcome is refused, because the last day and notice
 * would never be asked.
 */

export const DISMISSAL_NOTICE = ["Worked notice", "Paid in lieu of notice"] as const;

/** Why these meeting answers cannot be saved as they are, or null when they can. */
export function dismissalAnswersProblem(answers: Record<string, unknown>): string | null {
  const outcome = String(answers["meeting_outcome"] ?? "").trim();
  const warning = String(answers["warning_issued"] ?? "").trim();
  if (outcome !== "Dismissal") {
    return warning === "Dismissal"
      ? "Choose Dismissal as the Outcome of the meeting, so the last day of employment and the notice are recorded."
      : null;
  }
  if (warning && warning !== "None" && warning !== "Dismissal") {
    return "The outcome is a dismissal, so Warning or dismissal should be Dismissal or left empty.";
  }
  const last = String(answers["last_day_of_employment"] ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return "Enter the last day of employment.";
  const notice = String(answers["dismissal_notice"] ?? "").trim();
  if (!(DISMISSAL_NOTICE as readonly string[]).includes(notice)) {
    return "Choose the notice: Worked notice, or Paid in lieu of notice.";
  }
  return null;
}
