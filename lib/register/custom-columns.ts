/**
 * Be Care Compliant — custom register columns (Item 6).
 *
 * The People and Service User register matrices render a fixed, hand-authored set of curated
 * columns (Supervision, DBS, Care Plan Review, Audit). Any OTHER active check definition can be
 * shown as its own extra column, in an Admin-controlled order, and can be pointed at a question
 * on that check's form so the cell reads something the company recognises.
 *
 * IMPORTLESS ON PURPOSE, apart from types (erased at build). It is the unit test target for the
 * pure rules: which questions may be offered, how an answer is worded, and the column cap.
 */

import type { FormSchema } from "@/lib/form-schema";

/** Check keys that already have their own fixed columns in each register matrix, so
 *  they must NOT also appear as an extra/custom column. */
export const CURATED_CHECK_KEYS: Record<string, string[]> = {
  people: ["supervision", "appraisal", "spot_check", "competency", "manual_handling", "audit"],
  service_users: ["setup", "care_plan_review", "audit"],
};

export function isCuratedCheckKey(population: string, key: string): boolean {
  return (CURATED_CHECK_KEYS[population] ?? []).includes(key);
}

/**
 * How many extra columns may be SHOWN at once.
 *
 * Not arbitrary. The register is already wide, and Training taught us what happens when a matrix
 * outgrows the screen. An Admin who quietly adds twelve columns blames the product, not
 * themselves, so the panel refuses the seventh and says why.
 */
export const MAX_REGISTER_COLUMNS = 6;

/**
 * A question a column may be pointed at. It carries the field's own type and options so a cell can
 * be worded WITHOUT re-reading the evidence's schema snapshot: a snapshot is the whole frozen form,
 * several KB each, and a thousand-person register would pull hundreds of megabytes of them to look
 * up one label. The cost is that an answer stored against an option since retired falls back to the
 * raw value, which columnAnswerText already handles.
 */
export type RegisterDisplayChoice = {
  key: string;
  label: string;
  kind: "date" | "choice";
  type: string;
  options?: Array<{ value: string; label: string }>;
};

/** One custom check available as a register column. `show` drives whether it is
 *  currently rendered; the panel lists every one so hidden checks can be re-shown. */
export type RegisterCheckColumn = {
  id: string;
  key: string;
  name: string;
  show: boolean;
  /** null = show the next due date. Otherwise a question key on the check's form. */
  displayFieldKey: string | null;
  /** The questions this column may be pointed at, for the Columns panel dropdown. */
  choices: RegisterDisplayChoice[];
};

/**
 * Question types a column may show, and how each reads.
 *
 * Deliberately NOT here: every free text type (Phil's rule, a paragraph in a matrix cell helps
 * nobody), numbers and ratings (meaningless without their scale), signatures and uploads (not
 * text), and multi_select (an answer that is a set cannot be read at a glance in one cell).
 */
const DISPLAYABLE: Record<string, "date" | "choice"> = {
  date: "date",
  single_select: "choice",
  radio: "choice",
  yes_no: "choice",
};

/** Every question on a form that a column may be pointed at, in document order. */
export function displayChoices(schema: FormSchema | null | undefined): RegisterDisplayChoice[] {
  const sections = schema?.sections;
  if (!Array.isArray(sections)) return [];
  const out: RegisterDisplayChoice[] = [];
  for (const section of sections) {
    for (const field of section?.fields ?? []) {
      const kind = DISPLAYABLE[field?.type as string];
      if (kind && field.key) {
        out.push({
          key: field.key,
          label: field.label || field.key,
          kind,
          type: field.type,
          options: field.options?.map((o) => ({ value: o.value, label: o.label })),
        });
      }
    }
  }
  return out;
}

/** Is this key one the column may actually be pointed at? The browser is never trusted for this. */
export function isDisplayChoice(choices: RegisterDisplayChoice[], key: string | null): boolean {
  if (key == null) return true; // null is always valid: it means the next due date.
  return choices.some((c) => c.key === key);
}

/**
 * The text a cell shows for a chosen question's answer. Empty string means nothing is recorded
 * yet, which the cell renders as an em dash like every other empty cell.
 *
 * `formatDate` is passed in rather than imported so this file stays importless and testable; the
 * caller hands it the app's one date formatter, so a cell can never drift into its own format.
 */
export function columnAnswerText(
  field: { type?: string; options?: Array<{ value: string; label: string }> } | undefined,
  raw: unknown,
  formatDate: (iso: string) => string,
): string {
  if (!field || raw == null) return "";
  // A set, or anything object shaped, is never a column answer. Without this, a question whose
  // type changed since the evidence was written renders the words "[object Object]" in a cell.
  if (typeof raw === "object") return "";
  const value = String(raw).trim();
  if (value === "") return "";

  if (field.type === "date") return formatDate(value);
  if (field.type === "yes_no") {
    // Stored as the words "Yes"/"No" today; booleans are accepted so an older or imported answer
    // does not render as "true".
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "yes") return "Yes";
    if (lower === "false" || lower === "no") return "No";
    return value;
  }
  const option = (field.options ?? []).find((o) => o.value === value);
  // An answer against an option since removed shows the STORED value rather than nothing. It reads
  // oddly (option values are generated, so "option_3"), but a manager asking why beats a blank cell
  // that says an answer was never given.
  return option?.label ?? value;
}

/**
 * How many of these columns are currently shown. Used by the panel to warn before the Admin
 * presses Save, and by the server, which counts the DATABASE rather than the payload and is the
 * one that decides.
 */
export function shownColumnCount(columns: Array<{ show: boolean }>): number {
  return columns.filter((c) => c.show).length;
}

/**
 * The text for one cell, or undefined to fall back to the due date.
 *
 * UNDEFINED IS THE IMPORTANT CASE. A cell falls back to the due date whenever the answer could not
 * be read at all: the column is not pointed at a question, the completion predates evidence
 * (migrated history has no evidence id), RLS hides that evidence from this viewer, or the read
 * failed. Returning an empty string in those cases would paint a red column of em dashes that
 * reads as "nobody has done this", and a manager would chase carers who are perfectly in date.
 *
 * An empty string means something different and narrower: the evidence WAS read, and that question
 * was left blank on it.
 */
export function cellText(
  column: { displayFieldKey: string | null },
  status: { last_evidence_id?: string | null } | undefined,
  textByEvidence: Record<string, string>,
): string | undefined {
  if (!column.displayFieldKey) return undefined;
  const id = status?.last_evidence_id;
  if (!id) return undefined;
  return textByEvidence[id];
}
