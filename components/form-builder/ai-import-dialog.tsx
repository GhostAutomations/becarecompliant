"use client";

/**
 * Be Care Compliant — Import a form with AI (Phil, 2 Oct 2026).
 *
 * A link, or a PDF, Word, Excel or picture of a form, in; a draft of its questions out, dropped
 * into the builder for the person to check. Nothing is saved until they press Save, so the AI's
 * reading is a starting point, never a published form. A company's import spends 1 AI credit
 * (said on the button with the AI chip); the founder's library import is free.
 *
 * What was typed or chosen stays when the import is refused (standing rule, 1 Oct 2026).
 */

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AiIcon } from "@/components/ai-icon";
import { aiImportForm } from "@/lib/form-builder/ai-import-actions";
import { allKeys } from "@/lib/form-builder/schema-ops";
import type { FormSchema } from "@/lib/form-schema";

/* Same limit as lib/form-builder/ai-import.ts, kept here so the zip reader stays out of the browser. */
const AI_IMPORT_MAX_BYTES = 3.5 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif";

export default function AiImportDialog({
  kind,
  population,
  schema,
  onDraft,
}: {
  kind: "template" | "company";
  population: string;
  schema: FormSchema;
  /** Called with the form to show in the builder, and a sentence saying what happened. */
  onDraft: (next: FormSchema, summary: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasQuestions = schema.sections.some((s) => s.fields.length > 0);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function run() {
    setError(null);
    if (!file && link.trim() === "") {
      setError("Paste a link, or choose a file to upload.");
      return;
    }
    if (file && file.size > AI_IMPORT_MAX_BYTES) {
      setError("That file is over 3.5 MB. Upload a smaller copy, or just the pages with the questions.");
      return;
    }
    const adding = hasQuestions && mode === "add";
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("population", population);
    if (file) fd.set("file", file);
    else fd.set("link", link.trim());
    fd.set("existing_keys", adding ? allKeys(schema).join(",") : "");
    startTransition(async () => {
      const res = await aiImportForm(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      /* Adding after an untouched blank form drops its empty first section, so the import does
         not start with a "Section 1" that has nothing in it. */
      const kept = schema.sections.filter((s) => s.fields.length > 0);
      const next: FormSchema = adding ? { ...schema, sections: [...kept, ...res.schema.sections] } : { ...schema, sections: res.schema.sections };
      const from = file ? file.name : "the link";
      onDraft(
        next,
        `The AI drafted ${res.questions} question${res.questions === 1 ? "" : "s"} from ${from}${adding ? ", after the questions already here" : ""}. Check them, then Save.${res.notes.length ? ` ${res.notes.join(" ")}` : ""}`,
      );
      setOpen(false);
      setLink("");
      setFile(null);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-outline px-3 py-2 text-sm">
        <AiIcon />
        Import with AI
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-import-title"
              onClick={close}
            >
              <div
                className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <h2 id="ai-import-title" className="text-lg font-semibold text-white">
                    Import a form with AI
                  </h2>
                  <p className="mt-1 text-sm text-white/65">
                    Paste a link to a form, or upload a PDF, Word, Excel or picture of it. The AI writes its
                    questions into this form for you to check. Nothing is saved until you press Save.
                  </p>
                </div>

                <div>
                  <label htmlFor="ai-import-link" className="form-label">
                    Link to the form
                  </label>
                  <input
                    id="ai-import-link"
                    type="url"
                    inputMode="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://"
                    disabled={pending || file != null}
                  />
                  <p className="form-hint">A page that opens without signing in, such as a Google Form or a PDF link.</p>
                </div>

                <div>
                  <label htmlFor="ai-import-file" className="form-label">
                    Or upload the form
                  </label>
                  <input
                    id="ai-import-file"
                    type="file"
                    accept={ACCEPT}
                    disabled={pending}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="form-hint">PDF, Word (.docx), Excel (.xlsx) or a photo or screenshot (JPG or PNG), up to 3.5 MB.</p>
                </div>

                {hasQuestions ? (
                  <fieldset className="space-y-2">
                    <legend className="form-label">This form already has questions</legend>
                    <label className="flex items-center gap-2 text-sm text-white/80">
                      <input type="radio" name="ai-import-mode" checked={mode === "add"} onChange={() => setMode("add")} disabled={pending} />
                      Add the imported questions after them
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white/80">
                      <input type="radio" name="ai-import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} disabled={pending} />
                      Replace them with the imported questions
                    </label>
                  </fieldset>
                ) : null}

                {error ? <p className="form-error mt-0">{error}</p> : null}
                {pending ? <p className="text-xs text-white/55">Reading the form. This can take up to a minute.</p> : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={run} disabled={pending} className="btn-primary px-4 py-2 text-sm">
                    <AiIcon tone="onGold" />
                    {pending ? "Importing…" : kind === "company" ? "Import (1 AI credit)" : "Import"}
                  </button>
                  <button type="button" onClick={close} disabled={pending} className="btn-ghost px-3 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
