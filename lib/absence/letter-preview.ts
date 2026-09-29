/**
 * Be Care Compliant — the "check the letters before they go" step on Book meeting, Rearrange and
 * Cancel (Phil, 2026-09-29). The server builds each email exactly as it would send it; the dialog
 * shows them read only and nothing is sent until Approve and send. Wording is still changed only
 * in Settings, Letters.
 *
 * Plain module (no "use server"): types and a pure helper only.
 */

export type LetterPreview = {
  key: "employee" | "conductor";
  /** Tab label: "Employee" or "Holding the meeting". */
  who: string;
  name: string;
  /** Null when it will not be sent because there is no address to send it to. */
  to: string | null;
  subject: string;
  /** The full branded email. Empty when `to` is null. */
  html: string;
  /** "Calendar invite attached" and similar, or null. */
  note: string | null;
};

export type LetterPreviewState = { error?: string; letters?: LetterPreview[] };

/**
 * Makes a rendered email safe and inert inside the preview frame: every link opens in a new
 * window, which the frame's sandbox then refuses, so pressing "Accept the invitation" in a preview
 * goes nowhere instead of loading the response page inside the dialog.
 */
export function inertEmailHtml(html: string): string {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
    : `${base}${html}`;
}

/** What the dialog says about an email that will not be sent. */
export function notSentReason(letter: LetterPreview): string | null {
  if (letter.to) return null;
  return letter.key === "employee"
    ? `${letter.name} has no email address on their record or login, so this letter will not be sent. Add one in Manage record first if they need it.`
    : `${letter.name} has no email address, so this letter will not be sent.`;
}
