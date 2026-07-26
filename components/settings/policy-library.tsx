"use client";

/**
 * Be Care Compliant — the company policy library.
 *
 * Upload the document once, assign it to whoever needs to read it. The file
 * itself lives in the private evidence bucket and is only ever served through a
 * short-lived signed URL, the same rule as training certificates and Evidence
 * attachments: no public links to a care company's policies.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { uploadPolicy, archivePolicy } from "@/lib/assignments/actions";
import type { CompanyPolicy } from "@/lib/assignments/types";

export default function PolicyLibrary({ policies }: { policies: CompanyPolicy[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-5">
      {adding ? (
        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Add a policy</h2>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setAdding(false)}
            >
              Close
            </button>
          </div>
          <ActionForm action={uploadPolicy} label="Add policy" savedLabel="Added">
            <div className="space-y-4">
              <div>
                <label htmlFor="policy-title" className="form-label">Title *</label>
                <input id="policy-title" name="title" required maxLength={140} />
              </div>
              <div>
                <label htmlFor="policy-summary" className="form-label">
                  What is it about? (optional)
                </label>
                <textarea id="policy-summary" name="summary" rows={2} maxLength={500} />
              </div>
              <div>
                <label htmlFor="policy-doc" className="form-label">Document *</label>
                <input id="policy-doc" name="document" type="file" required accept=".pdf,.doc,.docx" />
                <p className="form-hint">
                  PDF or Word, up to 3MB. Your team opens this to read it, so upload the
                  version you want on record.
                </p>
              </div>
            </div>
          </ActionForm>
        </div>
      ) : (
        <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setAdding(true)}>
          Add a policy
        </button>
      )}

      {policies.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          No policies yet. Add one, then assign it in People, Assignments.
        </div>
      ) : (
        <div className="glass-card divide-y divide-white/10">
          {policies.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                <p className="truncate text-xs text-white/45">
                  {p.file_name}
                  {p.summary ? ` · ${p.summary}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/policies/${p.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline px-3 py-2 text-xs"
                >
                  Open
                </a>
                <ActionForm
                  action={archivePolicy}
                  hidden={{ policy_id: p.id }}
                  label="Archive"
                  savedLabel="Archived"
                  buttonClassName="btn-ghost px-3 py-2 text-xs"
                  className=""
                  confirm="Archive this policy? It can no longer be assigned, and confirmations already given are kept."
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
