"use client";

/**
 * Be Care Compliant — Form builder: content outline.
 * A clickable list of sections and fields that scrolls the editor to the chosen
 * element. Read only navigation aid for long forms.
 */

import type { FormSchema } from "@/lib/form-schema";
import { fieldAnchorId, fieldTypeLabel, sectionAnchorId } from "@/lib/form-builder/types";

function jump(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function ContentOutline({ schema }: { schema: FormSchema }) {
  return (
    <nav aria-label="Form outline" className="glass-card p-4 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Outline</p>
      <ol className="space-y-3">
        {schema.sections.map((section, i) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => jump(sectionAnchorId(section.id))}
              className="block w-full truncate text-left font-medium text-white/90 hover:text-white"
            >
              {i + 1}. {section.title || "Untitled section"}
            </button>
            {section.fields.length > 0 && (
              <ul className="mt-1 space-y-1 border-l border-white/10 pl-3">
                {section.fields.map((field) => (
                  <li key={field.key}>
                    <button
                      type="button"
                      onClick={() => jump(fieldAnchorId(section.id, field.key))}
                      className="block w-full truncate text-left text-white/55 hover:text-white/90"
                      title={`${fieldTypeLabel(field.type)}`}
                    >
                      {field.label || "Untitled question"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
