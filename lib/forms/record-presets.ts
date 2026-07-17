/**
 * Be Care Compliant — pre-fill a check-completion form with the record's own
 * details, so a form never re-asks who the check is for.
 *
 * Works for EVERY check form, including ones a company builds later, because it
 * keys off field names rather than a fixed form:
 *   - any Name field  -> seeded with the record's name (still editable)
 *   - any Branch/Region field -> becomes a Branch dropdown of the company's
 *     branches, pre-selected to the record's branch and relabelled "Branch"
 *
 * Applied at render time on the People and Service User complete-check pages, so
 * no existing form has to be edited and new forms are covered automatically.
 * Isomorphic (no side effects) — safe to import anywhere.
 */

import type { Answers, FormField, FormSchema } from "@/lib/form-schema";

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
  opts: { fullName: string | null; branchName: string | null; branchNames: string[] },
): { schema: FormSchema; presets: Answers } {
  const presets: Answers = {};
  let changed = false;

  const sections = schema.sections.map((sec) => ({
    ...sec,
    fields: sec.fields.map((f): FormField => {
      const key = (f.key ?? "").toLowerCase();

      if (NAME_KEYS.has(key) && opts.fullName) {
        presets[f.key] = opts.fullName;
        return f;
      }

      if (BRANCH_KEYS.has(key)) {
        if (opts.branchName) presets[f.key] = opts.branchName;
        const options = opts.branchNames.map((n) => ({ label: n, value: n }));
        // A "Region" (or blank) label becomes "Branch"; a field already named
        // Branch keeps its label. Either way it is a select of the real branches.
        const label = /region/i.test(f.label) || f.label.trim() === "" ? "Branch" : f.label;
        const next: FormField = { ...f, label, type: "single_select", options };
        if (
          label !== f.label ||
          f.type !== "single_select" ||
          JSON.stringify(f.options ?? []) !== JSON.stringify(options)
        ) {
          changed = true;
        }
        return next;
      }

      return f;
    }),
  }));

  return { schema: changed ? { ...schema, sections } : schema, presets };
}
