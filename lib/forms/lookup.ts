/**
 * Be Care Compliant — the record lookup field's matching rule.
 *
 * WHY IT EXISTS (Phil, 2026-09-07). A Spot Check happens in a Service User's home, and
 * the carer's record cannot imply which one. Free text gives you "Mrs Jones", "Jones"
 * and "mrs jones" as three different service users; a dropdown of every service user is
 * unusable once a company has two hundred. So the field is a type-ahead: start typing a
 * name, pick the record.
 *
 * WHAT IS STORED, and why it is the NAME. The answer holds the display name, not the id,
 * because evidence is immutable and has to read correctly in 2034: a spot check that
 * said "Mrs Jones" must still say "Mrs Jones" after she is renamed or archived. The id
 * travels out of band to the submit pipeline (exactly as file_upload hands over the
 * File while storing its name), so the evidence row can also be LINKED to that record.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested.
 */

export type LookupChoice = {
  /** The record's id, used to link the evidence. Never the stored answer. */
  id: string;
  /** What the person typing sees, and what the answer keeps forever. */
  label: string;
  /** Optional second line, e.g. a branch, to tell two same-named records apart. */
  hint?: string;
};

/** Case and accent insensitive, so "sian" finds "Siân" and "O'BRIEN" finds "O'Brien". */
export function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same name with punctuation CLOSED UP rather than split, so O'Brien is also one
 * word. Without this, "obrien" found nobody: normalise turns it into "o brien" and no
 * word starts with "obrien". People type surnames without the apostrophe.
 */
function tighten(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every form of a choice a query word may match: the words as written, and the same
 *  with punctuation closed up. */
function haystack(choice: LookupChoice): string[] {
  const text = `${choice.label} ${choice.hint ?? ""}`;
  return [...normalise(text).split(" "), ...tighten(text).split(" ")].filter(Boolean);
}

/**
 * The choices to show for what has been typed.
 *
 * Matches on any WORD of the label starting with any word of the query, so "jo smi"
 * finds "Joanne Smith" and typing a surname first works too.
 *
 * NOTHING is shown until something is typed (Phil, 2026-09-07: "no names should appear
 * until they start typing"). This is a type-ahead, not a dropdown: opening a list of
 * every service user the moment the field is clicked is the thing it exists to avoid.
 *
 * Once they have typed, EVERY match is returned, not a first few -- "if a common name
 * like David is typed all davids are shown". A caller that genuinely needs a ceiling
 * passes `limit`; the field does not, because the list scrolls and a hidden David is a
 * spot check recorded against the wrong person.
 */
export function filterChoices(
  choices: readonly LookupChoice[],
  query: string,
  limit?: number,
): LookupChoice[] {
  const q = normalise(query);
  if (q === "") return [];
  /* The query is split as TYPED. The closed-up form belongs on the choice side only:
     adding it here made every term required in both forms, so "smith-jones" stopped
     finding "Smith Jones". Typing "obrien" still works because the choice carries the
     closed-up word. */
  const terms = q.split(" ");
  const out: LookupChoice[] = [];
  for (const choice of choices) {
    const words = haystack(choice);
    const everyTermMatches = terms.every((t) => words.some((w) => w.startsWith(t)));
    if (everyTermMatches) out.push(choice);
    if (limit !== undefined && out.length >= limit) break;
  }
  return out;
}

/** The choice whose label is exactly what was typed, if any. Used to tell a picked
 *  record from a half-typed one without trusting the control's own state. */
export function exactChoice(
  choices: readonly LookupChoice[],
  value: string,
): LookupChoice | null {
  const v = normalise(value);
  if (v === "") return null;
  return choices.find((c) => normalise(c.label) === v || tighten(c.label) === tighten(value)) ?? null;
}

/**
 * Is this answer a real record, or something typed that matches nobody?
 *
 * The field REFUSES a free-typed name on purpose: the whole point is that two people
 * cannot record the same service user three different ways. The message says what to do
 * rather than just refusing.
 */
export function lookupError(
  choices: readonly LookupChoice[],
  value: unknown,
  required: boolean,
): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (s === "") return required ? "Choose a record from the list." : null;
  if (exactChoice(choices, s)) return null;
  return "Pick a name from the list as you type it. If they are not there, add the record first.";
}
