/**
 * Company letter templates: the wording of the formal letters the app sends on a
 * care company's behalf. Pure module (definitions + rendering), no Supabase, so it
 * is safe to import anywhere.
 *
 * Why this exists: an absence meeting invitation is a formal step in a capability
 * process. It names the stage, the right to be accompanied and what happens next,
 * and every provider has wording their own HR adviser approved. Until now that
 * wording was hard coded, so it went out under the company's name in mine.
 *
 * Bodies are PLAIN TEXT with {{placeholders}}, blank line separated paragraphs.
 * They are escaped and rendered to HTML at send time: an Admin never authors raw
 * HTML, which would break the email shell and open an injection path into mail we
 * send for them. The functional parts of a letter (the Accept and I cannot attend
 * buttons, the calendar attachment) stay system rendered around the wording.
 */

export type LetterKey =
  | "absence_meeting_invite_employee"
  | "absence_meeting_invite_conductor"
  | "absence_meeting_rearranged"
  | "absence_meeting_cancelled";

export type LetterPlaceholder = {
  token: string;
  label: string;
  example: string;
};

/** Every value a letter can merge. Shown to the Admin as a palette they can click. */
export const LETTER_PLACEHOLDERS: LetterPlaceholder[] = [
  { token: "recipient_name", label: "Who the letter is addressed to", example: "Joan Price" },
  { token: "employee_name", label: "The employee the meeting is about", example: "Joan Price" },
  { token: "company_name", label: "Your company", example: "Acme Care Company" },
  { token: "stage", label: "Stage number", example: "2" },
  { token: "stage_label", label: "Stage in words", example: "Stage 2 absence management meeting" },
  { token: "conductor_name", label: "Who is conducting the meeting", example: "Sam Idris" },
  { token: "meeting_date", label: "Date of the meeting", example: "14/08/2026" },
  { token: "meeting_time", label: "Time of the meeting", example: "10:30" },
  { token: "meeting_when", label: "Date and time together", example: "14/08/2026 at 10:30" },
  { token: "location", label: "Where it is held", example: "Microsoft Teams" },
  { token: "duration", label: "How long it is scheduled for", example: "45 minutes" },
];

export type LetterDefinition = {
  key: LetterKey;
  name: string;
  /** What this letter is and when it goes out, shown above the editor. */
  description: string;
  /** Who receives it, so an Admin does not have to infer it from the wording. */
  sentTo: string;
  defaultSubject: string;
  defaultBody: string;
  /** Functional content the system always adds, described plainly so an Admin knows
   *  not to try to write it themselves. */
  systemNote?: string;
};

/**
 * The default wording is EXACTLY what the app sent before this feature existed, so
 * turning it on changes nothing until an Admin edits. Do not "improve" these while
 * editing the code: a company that never opens the screen keeps whatever is here.
 */
export const LETTER_DEFINITIONS: LetterDefinition[] = [
  {
    key: "absence_meeting_invite_employee",
    name: "Absence meeting invitation",
    description:
      "The employee's formal invitation to an absence management meeting. This is the letter that matters most if a decision is ever challenged, because it evidences that they were told the purpose, who would conduct it, and their right to be accompanied.",
    sentTo: "The employee the meeting is about",
    defaultSubject: "{{stage_label}}",
    defaultBody: [
      "This is your formal invitation to a {{stage_label}} under the absence procedure at {{company_name}}.",
      "The purpose of the meeting is to review your absence record, discuss any support you may need, and consider the next steps under the procedure. The meeting will be conducted by {{conductor_name}} and will be held at {{location}}.",
      "You have the right to be accompanied by a colleague or a trade union representative. Please let us know in advance if you will be accompanied.",
    ].join("\n\n"),
    systemNote:
      "The Accept the invitation and I cannot attend buttons, the calendar attachment, and a note that a Teams invite will follow when the meeting is online, are added automatically underneath your wording.",
  },
  {
    key: "absence_meeting_invite_conductor",
    name: "Absence meeting, chairing copy",
    description:
      "The copy sent to whoever is conducting the meeting. It has to be unmistakable that they are holding the meeting rather than being called to one about their own absence.",
    sentTo: "The manager conducting the meeting",
    defaultSubject: "Absence meeting with {{employee_name}} (Stage {{stage}})",
    defaultBody: [
      "You are chairing this meeting: a {{stage_label}} for {{employee_name}}, held at {{location}}. This is about {{employee_name}}'s absence record, not your own.",
      "Their absence record is on the Absence page. Once the meeting has taken place, record it there so the Evidence attaches to this booking. You will be emailed when {{employee_name}} accepts or declines.",
    ].join("\n\n"),
    systemNote: "The calendar attachment is added automatically.",
  },
  {
    key: "absence_meeting_rearranged",
    name: "Rearranged note",
    description:
      "One short paragraph added to the top of both letters above when a meeting is moved, so nobody attends on the old date.",
    sentTo: "Everyone who received the original invitation",
    defaultSubject: "",
    defaultBody:
      "This meeting has been rearranged. This invitation replaces the earlier one, please update your calendar.",
    systemNote: "This one has no subject of its own: it appears inside the invitation letters.",
  },
  {
    key: "absence_meeting_cancelled",
    name: "Meeting cancelled",
    description: "Sent to everyone who received a formal letter when a booked meeting is cancelled.",
    sentTo: "The employee and the manager who was conducting it",
    defaultSubject: "Cancelled: {{stage_label}}",
    defaultBody:
      "{{recipient_name}}, the {{stage_label}} booked for {{meeting_when}} at {{company_name}} has been cancelled. Please remove it from your calendar. If it is rearranged you will receive a new invitation.",
  },
];

export function letterDefinition(key: string): LetterDefinition | undefined {
  return LETTER_DEFINITIONS.find((l) => l.key === key);
}

/** Minimal HTML escape, matching lib/email/templates escapeHtml. Kept local so this
 *  module stays pure and importable from a client component. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Substitute {{tokens}} into plain text. Unknown tokens are left as written so a
 *  typo is visible in a preview rather than silently vanishing from a legal letter. */
export function mergeLetterText(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) ? values[token] : whole,
  );
}

/**
 * Render a letter body to the HTML fragment the email shell expects: blank line
 * separated paragraphs, everything escaped. Merge values are escaped too, so a
 * client called O'Brien or a company called Smith & Sons cannot break the markup.
 */
export function renderLetterHtml(body: string, values: Record<string, string>): string {
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) escaped[k] = esc(v ?? "");
  const merged = mergeLetterText(esc(body), escaped);
  const paragraphs = merged
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map(
      (para, i) =>
        `<p style="margin:0 0 ${i === paragraphs.length - 1 ? 14 : 10}px 0;">${para.replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

/** The same merge for a plain text field such as an email subject. */
export function renderLetterSubject(subject: string, values: Record<string, string>): string {
  return mergeLetterText(subject, values).trim();
}
