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
import {
  uploadPolicy,
  archivePolicy,
  createWrittenPolicy,
  updateWrittenPolicy,
  uploadPolicyVersion,
  updatePolicyConfig,
} from "@/lib/assignments/actions";
import type { CompanyPolicy, PolicyConfig } from "@/lib/assignments/types";
import { REASSIGN_MODE_LABELS, SIGNATURE_MODE_LABELS } from "@/lib/assignments/signing";

export default function PolicyLibrary({
  policies,
  config,
}: {
  policies: CompanyPolicy[];
  config: PolicyConfig;
}) {
  const [adding, setAdding] = useState(false);
  // Upload a document, or write/paste the wording. Phil, 2026-07-26: most care
  // policies live in Word, so pasting has to be a first class way in, not a
  // workaround.
  const [how, setHow] = useState<"upload" | "text">("upload");
  const [versioning, setVersioning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* How this company signs. Both of these are the company's call, not ours. */}
      <div className="glass-card p-5">
        <h2 className="text-base font-semibold text-white">How signing works</h2>
        <p className="mt-1 text-sm text-white/60">
          Your team signs a policy rather than just ticking it, and the signature is stored
          with the version they signed.
        </p>
        <div className="mt-4">
          <ActionForm action={updatePolicyConfig} label="Save">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="signature_mode" className="form-label">
                  How they sign
                </label>
                <select
                  id="signature_mode"
                  name="signature_mode"
                  defaultValue={config.signature_mode}
                >
                  {Object.entries(SIGNATURE_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reassign_on_new_version" className="form-label">
                  When you upload a new version
                </label>
                <select
                  id="reassign_on_new_version"
                  name="reassign_on_new_version"
                  defaultValue={config.reassign_on_new_version}
                >
                  {Object.entries(REASSIGN_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </div>
      </div>

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
          <div className="flex flex-wrap gap-2">
            {([
              ["upload", "Upload a document", "A PDF or Word file you already have"],
              ["text", "Write or paste it", "Paste the wording straight from Word"],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => setHow(value)}
                className={`flex-1 rounded-xl border p-3 text-left transition ${
                  how === value
                    ? "border-amber-400/60 bg-amber-400/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-semibold text-white">{label}</span>
                <span className="block text-xs text-white/50">{hint}</span>
              </button>
            ))}
          </div>

          {how === "upload" ? (
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
                    version you want on record. A PDF reads best on a phone.
                  </p>
                </div>
              </div>
            </ActionForm>
          ) : (
            <ActionForm action={createWrittenPolicy} label="Save policy" savedLabel="Saved">
              <div className="space-y-4">
                <div>
                  <label htmlFor="written-title" className="form-label">Title *</label>
                  <input id="written-title" name="title" required maxLength={140} />
                </div>
                <div>
                  <label htmlFor="written-summary" className="form-label">
                    What is it about? (optional)
                  </label>
                  <textarea id="written-summary" name="summary" rows={2} maxLength={500} />
                </div>
                <div>
                  <label htmlFor="written-body" className="form-label">The policy *</label>
                  <textarea id="written-body" name="body" rows={16} required />
                  <p className="form-hint">
                    Paste it straight from Word. Start a line with # for a heading and with a
                    dash for a bullet, and put **stars** either side of anything that should be
                    bold. Numbered clauses are kept as you type them. We turn it into a proper
                    document, so your team can read it on a phone and you still have a PDF of
                    the exact wording they signed.
                  </p>
                </div>
              </div>
            </ActionForm>
          )}
        </div>
      ) : (
        <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setAdding(true)}>
          Add a policy
        </button>
      )}

      {policies.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          No policies yet. Add one, then send it out from Briefings.
        </div>
      ) : (
        <div className="glass-card divide-y divide-white/10">
          {policies.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                <p className="truncate text-xs text-white/45">
                  {p.source === "text" ? "Written in Be Care Compliant" : p.file_name}
                  {p.summary ? ` · ${p.summary}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill-neutral">v{p.version}</span>
                <a
                  href={`/api/policies/${p.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline px-3 py-2 text-xs"
                >
                  Open
                </a>
                {p.source === "text" ? (
                  <button
                    type="button"
                    className="btn-ghost px-3 py-2 text-xs"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                  >
                    Edit wording
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost px-3 py-2 text-xs"
                    onClick={() => setVersioning(versioning === p.id ? null : p.id)}
                  >
                    New version
                  </button>
                )}
                <ActionForm
                  action={archivePolicy}
                  hidden={{ policy_id: p.id }}
                  label="Archive"
                  savedLabel="Archived"
                  buttonClassName="btn-ghost px-3 py-2 text-xs"
                  className=""
                  confirm="Archive this policy? It can no longer be assigned, and signatures already given are kept."
                />
              </div>

              {editing === p.id ? (
                <div className="w-full border-t border-white/10 pt-3">
                  <ActionForm
                    action={updateWrittenPolicy}
                    hidden={{ policy_id: p.id }}
                    label={`Save as version ${p.version + 1}`}
                    savedLabel="Saved"
                    buttonClassName="btn-primary px-3 py-2 text-xs"
                  >
                    <label htmlFor={`edit-${p.id}`} className="form-label">
                      The wording
                    </label>
                    <textarea id={`edit-${p.id}`} name="body" rows={16} defaultValue={p.body ?? ""} required />
                    <p className="form-hint">
                      Editing creates version {p.version + 1}. Version {p.version} is kept exactly
                      as it reads now, so signatures already given stay evidenced.
                      {config.reassign_on_new_version === "always"
                        ? " Everyone who has signed it before will be asked to sign the new version."
                        : config.reassign_on_new_version === "ask"
                          ? " You will be asked who needs to sign it again."
                          : " Nobody will be asked to sign again, you assign it yourself."}
                    </p>
                  </ActionForm>
                </div>
              ) : null}

              {versioning === p.id ? (
                <div className="w-full border-t border-white/10 pt-3">
                  <ActionForm
                    action={uploadPolicyVersion}
                    hidden={{ policy_id: p.id }}
                    label={`Upload version ${p.version + 1}`}
                    savedLabel="Uploaded"
                    buttonClassName="btn-primary px-3 py-2 text-xs"
                  >
                    <label htmlFor={`ver-${p.id}`} className="form-label">
                      The new document
                    </label>
                    <input
                      id={`ver-${p.id}`}
                      name="document"
                      type="file"
                      required
                      accept=".pdf,.doc,.docx"
                    />
                    <p className="form-hint">
                      Version {p.version} is kept, so signatures against it stay evidenced.
                      {config.reassign_on_new_version === "always"
                        ? " Everyone who has signed it before will be asked to sign this version."
                        : config.reassign_on_new_version === "ask"
                          ? " You will be asked who needs to sign it again."
                          : " Nobody will be asked to sign again, you assign it yourself."}
                    </p>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
