/**
 * Be Care Compliant — pre-fill a check-completion form with the record's own
 * details, so a form never re-asks who the check is for.
 *
 * Returns ONLY answer presets (it never rewrites the schema), so the client and the
 * server validate exactly the same stored form — no divergence. Keys off field
 * names, so it works for every form, including ones a company builds later:
 *   - any Name field   -> seeded with the record's name
 *   - any Branch field -> seeded with the record's branch, but ONLY when that
 *     branch is one of the field's options (so the select can never hold an invalid
 *     value). The Branch field's options are kept correct in the stored form.
 * Isomorphic (no side effects) — safe to import anywhere.
 */

import type { Answers, FormSchema } from "@/lib/form-schema";

const NAME_KEYS = new Set([
  "name",
  "full_name",
  "fullname",
  "individual_name",
  "carer_name",
  "staff_name",
  "person_name",
  "service_user_name",
  "employee_name",
]);

const BRANCH_KEYS = new Set(["branch", "region"]);

export function recordFormPresets(
  schema: FormSchema,
  opts: { fullName: string | null; branchName: string | null },
): Answers {
  const presets: Answers = {};

  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      const key = (f.key ?? "").toLowerCase();

      if (NAME_KEYS.has(key) && opts.fullName) {
        presets[f.key] = opts.fullName;
        continue;
      }

      if (BRANCH_KEYS.has(key) && opts.branchName) {
        const bn = opts.branchName.toLowerCase();
        const match = (f.options ?? []).find(
          (o) => String(o.value ?? "").toLowerCase() === bn || String(o.label ?? "").toLowerCase() === bn,
        );
        if (match) presets[f.key] = String(match.value);
      }
    }
  }

  return presets;
}
