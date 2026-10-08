"use client";

/**
 * Add current policy to library (Phil, 2026-10-08): "at the top corner, that add a policy should
 * replace write a policy with AI, but add a policy should say add current policy to library. And
 * then next to it, we still have the improve policy with AI."
 *
 * The two ways in the Library's old Add a policy panel had, now in a popup from the top of the
 * page: upload the PDF a company already has, or paste its wording from Word. Each says how it is
 * signed (per policy, remembered for the next one), and, new here, which standard policy it is, so
 * the register ticks the moment it is saved instead of the company hunting for the Review register
 * afterwards (popup, 2026-10-08). Writing with AI stays on every missing line of the register.
 *
 * Portalled to document.body: rendered in place, a fixed scrim resolves against the nearest
 * backdrop-filter ancestor and can land below the fold.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ActionForm from "@/components/action-form";
import { SigningFields } from "@/components/settings/policy-library";
import { createWrittenPolicy, uploadPolicy } from "@/lib/assignments/actions";
import type { PolicyConfig } from "@/lib/assignments/types";

export default function AddPolicy({
  config,
  topics,
}: {
  config: PolicyConfig;
  /** The standard policies, already in title order. */
  topics: Array<{ key: string; title: string }>;
}) {
  const [open, setOpen] = useState(false);
  // Upload a document, or write/paste the wording. Phil, 2026-07-26: most care policies live in
  // Word, so pasting has to be a first class way in, not a workaround.
  const [how, setHow] = useState<"upload" | "text">("upload");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Plain render helpers, not components: a component defined in here would be a new type on every
     render and React would remount it, dropping a choice already made. */
  const standardPolicy = (id: string) => (
      <div>
        <label htmlFor={id} className="form-label">Which standard policy is this? (optional)</label>
        <select id={id} name="topic_key" defaultValue="">
          <option value="">Not one of the standard policies</option>
          {topics.map((t) => (
            <option key={t.key} value={t.key}>{t.title}</option>
          ))}
        </select>
        <p className="form-hint">
          Pick the one it covers and it ticks on your register straight away. You can change it later in the Review
          register.
        </p>
      </div>
  );

  const signing = (idPrefix: string) => (
      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">How this policy is signed</p>
        <SigningFields idPrefix={idPrefix} signatureMode={config.signature_mode} reassign={config.reassign_on_new_version} />
        <p className="form-hint">Set per policy, and remembered as the starting point for the next one you add.</p>
      </div>
  );

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add current policy to library
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-policy-title"
            >
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h2 id="add-policy-title" className="text-lg font-semibold text-white">Add current policy to library</h2>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ["upload", "Upload a document", "A PDF you already have"],
                    ["text", "Write or paste it", "Paste the wording straight from Word"],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setHow(value)}
                      aria-pressed={how === value}
                      className={`flex-1 rounded-xl border p-3 text-left transition ${
                        how === value ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-white">{label}</span>
                      <span className="block text-xs text-white/50">{hint}</span>
                    </button>
                  ))}
                </div>

                {how === "upload" ? (
                  <ActionForm action={uploadPolicy} label="Add policy" savedLabel="Added" onDone={() => setOpen(false)}>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="add-upload-title" className="form-label">Title *</label>
                        <input id="add-upload-title" name="title" required maxLength={140} />
                      </div>
                      <div>
                        <label htmlFor="add-upload-summary" className="form-label">What is it about? (optional)</label>
                        <textarea id="add-upload-summary" name="summary" rows={2} maxLength={500} />
                      </div>
                      <div>
                        <label htmlFor="add-upload-doc" className="form-label">Document *</label>
                        {/* Styled by the canonical input[type="file"] rule in globals.css. */}
                        <input id="add-upload-doc" name="document" type="file" required accept="application/pdf,.pdf" />
                        <p className="form-hint">
                          PDF, up to 3MB. Your team reads it on their phone and their signature is added to a copy of it,
                          so it has to be a PDF. Save a Word file as a PDF first, or paste the wording in instead.
                        </p>
                      </div>
                      {standardPolicy("add-upload-topic")}
                      {signing("add-upload")}
                    </div>
                  </ActionForm>
                ) : (
                  <ActionForm action={createWrittenPolicy} label="Save policy" savedLabel="Saved" onDone={() => setOpen(false)}>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="add-written-title" className="form-label">Title *</label>
                        <input id="add-written-title" name="title" required maxLength={140} />
                      </div>
                      <div>
                        <label htmlFor="add-written-summary" className="form-label">What is it about? (optional)</label>
                        <textarea id="add-written-summary" name="summary" rows={2} maxLength={500} />
                      </div>
                      <div>
                        <label htmlFor="add-written-body" className="form-label">The policy *</label>
                        <textarea id="add-written-body" name="body" rows={14} required />
                        <p className="form-hint">
                          Paste it straight from Word. Start a line with # for a heading and with a dash for a bullet, and
                          put **stars** either side of anything that should be bold. Numbered clauses are kept as you type
                          them. We turn it into a proper document with a cover page, so your team can read it on a phone and
                          you still have a PDF of the exact wording they signed.
                        </p>
                      </div>
                      {standardPolicy("add-written-topic")}
                      {signing("add-written")}
                    </div>
                  </ActionForm>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
