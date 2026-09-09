"use client";

/**
 * Be Care Compliant -- a record's Evidence, narrowed to one kind of form.
 *
 * Phil, 2026-09-09: "add a filter to the pop up supervison, annual appraisal spot etc, so
 * they an just search all of one thing if needed." Nobody opens a two year old record asking
 * what happened lately; they arrive with "show me the supervisions", because an inspector has
 * asked or because they are checking for a gap.
 *
 * The dropdown lists only the forms this record HAS, each with its count, so a filter can
 * never return an empty list and leave somebody wondering whether it broke or the work was
 * never done. The rule and its tests are lib/evidence/history-filter.ts.
 */

import { useMemo, useState } from "react";
import { ALL_FORMS, filterByForm, formOptions } from "@/lib/evidence/history-filter";
import { formatDisplayDate } from "@/lib/people/logic";

export type EvidenceRow = {
  id: string;
  submitted_at: string;
  form_name: string | null;
  author_name: string | null;
};

export default function EvidenceHistory({ rows }: { rows: EvidenceRow[] }) {
  const [form, setForm] = useState(ALL_FORMS);
  const options = useMemo(() => formOptions(rows), [rows]);
  const shown = useMemo(() => filterByForm(rows, form), [rows, form]);

  if (rows.length === 0) {
    return (
      <div className="border-t border-white/10 p-5 text-sm text-white/60">
        No evidence yet. Completing a check stores its form here as immutable inspection
        evidence.
      </div>
    );
  }

  return (
    <div className="border-t border-white/10">
      {/* Only worth a filter when there is more than one kind of thing to filter. */}
      {options.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <label htmlFor="evidence-form" className="text-xs text-white/50">
              Show
            </label>
            <select
              id="evidence-form"
              className="w-auto text-xs"
              value={form}
              onChange={(e) => setForm(e.target.value)}
            >
              <option value={ALL_FORMS}>Everything ({rows.length})</option>
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name} ({o.count})
                </option>
              ))}
            </select>
          </div>
          {form ? (
            <button
              type="button"
              onClick={() => setForm(ALL_FORMS)}
              className="text-xs text-white/50 hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="divide-y divide-white/5">
        {shown.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-24 shrink-0 text-white/85">
                {formatDisplayDate(e.submitted_at.slice(0, 10))}
              </span>
              <span className="text-white/85">{e.form_name ?? "Evidence"}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-40 text-right text-white/50">{e.author_name ?? "Unknown"}</span>
              <a href={`/evidence/${e.id}`} className="btn-outline px-2.5 py-1 text-[11px]">
                View
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
