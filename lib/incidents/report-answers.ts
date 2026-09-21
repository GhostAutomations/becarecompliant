/**
 * Be Care Compliant — reading an Incident Report's answers onto the case.
 *
 * Pure and importless at runtime (type imports only), so it is unit tested directly.
 *
 * THE KIND OF EVENT (Phil, 2026-09-19). "Type of event" and "What kind of event" could contradict
 * each other: Accident with Abuse, say. The form now asks the kind in four questions, one per
 * type, each shown only for its own type (migration 0303). Exactly one of them can be answered,
 * and this reads whichever it is. A report filed on the first version of the form carries a
 * single "category" answer, and that is still read.
 *
 * THE OFFICE'S QUESTIONS (Phil, 2026-09-19). Notifiable and safeguarding are on the form, but
 * "if completed by team in the portal, don't have those options, the office staff need to
 * decide". The team never sees them, and the server drops them if they are posted anyway.
 */

import type { Answers, FormSchema } from "../form-schema.ts";

export const EVENT_TYPES = ["accident", "near_miss", "incident", "dangerous_occurrence"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The questions only the office answers. */
export const OFFICE_ONLY_KEYS: readonly string[] = ["notifiable", "safeguarding"];

function text(answers: Answers, key: string): string | null {
  const v = answers[key];
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

/** The type of event, when it is one of the four. */
export function eventTypeFrom(answers: Answers): EventType | null {
  const t = text(answers, "event_type");
  return t && (EVENT_TYPES as readonly string[]).includes(t) ? (t as EventType) : null;
}

/** The key of the kind question shown for a type of event. */
export function categoryKey(type: EventType): string {
  return `category_${type}`;
}

/** The kind of event: the kind question for the chosen type, else the single question the first
 *  version of the form asked. Null when neither was answered. */
export function categoryFrom(answers: Answers): string | null {
  const type = eventTypeFrom(answers);
  if (type) {
    const kind = text(answers, categoryKey(type));
    if (kind) return kind;
  }
  return text(answers, "category");
}

/** A yes/no answer as a boolean; null when not answered. */
export function yesNo(answers: Answers, key: string): boolean | null {
  const v = answers[key];
  if (typeof v === "boolean") return v;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "yes" || s === "true") return true;
  if (s === "no" || s === "false") return false;
  return null;
}

/** The form as the TEAM sees it: the office's questions taken out, and a section left with
 *  nothing in it taken out too. */
export function withoutOfficeQuestions(schema: FormSchema): FormSchema {
  return {
    ...schema,
    sections: schema.sections
      .map((s) => ({ ...s, fields: s.fields.filter((f) => !OFFICE_ONLY_KEYS.includes(f.key)) }))
      .filter((s) => s.fields.length > 0),
  };
}

/** The answers as they may be kept from somebody who is not office staff. */
export function withoutOfficeAnswers(answers: Answers): Answers {
  const out: Answers = { ...answers };
  for (const k of OFFICE_ONLY_KEYS) delete out[k];
  return out;
}

/** What the office still has to answer before the report can be filed. Empty when complete. */
export function officeQuestionsMissing(answers: Answers): string[] {
  const missing: string[] = [];
  if (yesNo(answers, "notifiable") === null) missing.push("whether it is notifiable to the regulator");
  if (yesNo(answers, "safeguarding") === null) missing.push("whether it is a safeguarding matter");
  return missing;
}
