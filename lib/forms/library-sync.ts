/**
 * Be Care Compliant — is a company's copy of a form still the library's?
 *
 * Step 5 of Phil's forms plan: when the master library changes, offer the change to the
 * companies that already hold that form, and leave alone any company that has made the
 * form their own.
 *
 * The whole feature turns on one question — HAS THIS COMPANY EDITED THEIR COPY? — and the
 * naive answer (does their schema equal the library's?) is wrong, because the system
 * itself changes every copy the moment it is handed over: rebake_form_field_options bakes
 * that company's real branches into the Branch question, their own staff into Conducted
 * by, and the funding types they accept into Care package funded by. Compare raw and every
 * company reads as edited, and the push never reaches anybody.
 *
 * So a copy is fingerprinted with those baked lists REMOVED, and what is stored against
 * the form is the fingerprint of the library schema it was handed. Their copy still
 * matching what they were given means they have not touched it, whatever the library has
 * done since.
 *
 * Pure, and tested, because "we did not overwrite work somebody did" is the promise this
 * module makes on behalf of every push.
 */

import { createHash } from "node:crypto";
import type { FormSchema } from "@/lib/form-schema";

/**
 * The field keys whose option lists the system bakes per company.
 * MUST MATCH rebake_form_field_options in the database. If a key is added there and not
 * here, every company holding that form starts reading as edited and stops receiving
 * improvements — silently. The test below is the reminder.
 */
export const BAKED_OPTION_FIELD_KEYS: ReadonlySet<string> = new Set([
  "branch",
  "region",
  "conducted_by",
  "funding_source",
]);

/** Stable JSON: object keys sorted, so two equal schemas cannot fingerprint differently
 *  because a key was written in another order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** The schema as it is worth comparing: baked option lists removed. */
export function comparableSchema(schema: FormSchema): unknown {
  return canonical({
    schemaVersion: schema.schemaVersion,
    sections: (schema.sections ?? []).map((section) => ({
      ...section,
      fields: (section.fields ?? []).map((field) => {
        if (!BAKED_OPTION_FIELD_KEYS.has((field.key ?? "").toLowerCase())) return field;
        const { options: _baked, ...rest } = field;
        return rest;
      }),
    })),
  });
}

/** A short, stable fingerprint of a form, ignoring anything baked per company. */
export function fingerprintSchema(schema: FormSchema): string {
  return createHash("sha256").update(JSON.stringify(comparableSchema(schema))).digest("hex").slice(0, 32);
}

/*
 * WHAT IS DELIBERATELY NOT COMPARED: the form's NAME, which lives on the forms row rather
 * than in the schema. Today no company can rename their copy — the builder edits questions,
 * not the title — so a push carrying the library's name over is a rename the founder made
 * and nothing of the company's is lost. THE DAY RENAMING IS ADDED, the name has to join the
 * comparison, or a company that renamed their form reads as untouched and a push quietly
 * renames it back.
 */

export type PushState =
  /** Their copy already matches the library. Nothing to send. */
  | "up_to_date"
  /** Untouched since we gave it to them, and the library has moved on. Safe to push. */
  | "behind"
  /** They have changed their copy. Never overwritten by a push. */
  | "edited"
  /** We have no record of what they were handed, so we cannot prove it is untouched. */
  | "unknown";

/**
 * Decide what a push may do to one company's copy.
 *
 * `handed` is the fingerprint of the LIBRARY schema this copy was made from, stored on the
 * form when it was seeded or last pushed. Missing it is not treated as untouched: a form we
 * cannot prove is unedited is left alone and reported, because the cost of being wrong is
 * silently deleting a company's own work.
 */
export function pushStateFor(input: {
  theirs: string;
  library: string;
  handed: string | null | undefined;
}): PushState {
  if (input.theirs === input.library) return "up_to_date";
  if (!input.handed) return "unknown";
  return input.theirs === input.handed ? "behind" : "edited";
}

/** The states a push is allowed to act on. Everything else is reported, not sent. */
export function isPushable(state: PushState): boolean {
  return state === "behind";
}
