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
import { REVIEW_REASONS } from "@/lib/policies/cover";
import ActionForm from "@/components/action-form";
import {
  archivePolicy,
  updateWrittenPolicy,
  renamePolicy,
  uploadPolicyVersion,
  updatePolicySigning,
  reassignPolicyToEveryone,
} from "@/lib/assignments/actions";
import type { CompanyPolicy, PolicyConfig } from "@/lib/assignments/types";
import { REASSIGN_MODE_LABELS, SIGNATURE_MODE_LABELS } from "@/lib/assignments/signing";

/**
 * How ONE policy is signed. Phil, 2026-07-26: "how signing works is a generic
 * tile, it should be per policy... however, it should remember that last
 * settings". So these two live on the policy, and the company row is only the
 * remembered starting point for the next one you add.
 *
 * It matters beyond tidiness: a safeguarding policy can demand a drawn signature
 * and make everyone re-sign every version, while a dress code can take a typed
 * name and never chase anyone. One company switch forced the strictest policy's
 * rules onto all of them.
 */
export function SigningFields({
  idPrefix,
  signatureMode,
  reassign,
  newStarters = false,
}: {
  idPrefix: string;
  signatureMode: PolicyConfig["signature_mode"];
  reassign: PolicyConfig["reassign_on_new_version"];
  newStarters?: boolean;
}) {
  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-signature_mode`} className="form-label">
          How they sign this one
        </label>
        <select
          id={`${idPrefix}-signature_mode`}
          name="signature_mode"
          defaultValue={signatureMode}
        >
          {Object.entries(SIGNATURE_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-reassign`} className="form-label">
          When there is a new version
        </label>
        <select
          id={`${idPrefix}-reassign`}
          name="reassign_on_new_version"
          defaultValue={reassign}
        >
          {Object.entries(REASSIGN_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>

    <label className="mt-3 flex items-start gap-2.5 text-sm text-white/90">
      <input
        type="checkbox"
        name="assign_to_new_starters"
        defaultChecked={newStarters}
        className="mt-0.5"
      />
      <span>
        Send it to new starters automatically
        <span className="block text-xs text-white/45">
          Anyone added or imported from now on gets it to sign on day one, so nobody joins
          without it.
        </span>
      </span>
    </label>
    </>
  );
}

export default function PolicyLibrary({
  policies,
  config,
}: {
  policies: CompanyPolicy[];
  config: PolicyConfig;
}) {
  /* No "Add a policy" here: it moved to the top of the Policies page as "Add current policy to
     library" (Phil, 2026-10-08), components/policies/add-policy.tsx. */
  const [versioning, setVersioning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [signingFor, setSigningFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {policies.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          No policies yet. Add your current one at the top of the page, or write one with AI, then send it out from Briefings.
        </div>
      ) : (
        <div className="glass-card divide-y divide-white/10">
          {policies.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                <p className="truncate text-xs text-white/45">
                  {p.source === "text" ? "Written in Be Care Compliant" : p.file_name}
                  {` · ${SIGNATURE_MODE_LABELS[p.signature_mode]}`}
                  {p.assign_to_new_starters ? " · New starters get it" : ""}
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
                  action={reassignPolicyToEveryone}
                  hidden={{ policy_id: p.id }}
                  label={`Ask everyone to sign v${p.version}`}
                  savingLabel="Sending…"
                  savedLabel="Sent"
                  buttonClassName="btn-ghost px-3 py-2 text-xs"
                  className=""
                  confirm={`Ask everyone who has ever had "${p.title}" to sign version ${p.version}? Anyone still holding an older version is asked again.`}
                />
                <a
                  href={`/api/briefings/report?policy=${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost px-3 py-2 text-xs"
                >
                  Who has signed
                </a>
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-xs"
                  onClick={() => setSigningFor(signingFor === p.id ? null : p.id)}
                >
                  Signing
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-xs"
                  onClick={() => setRenaming(renaming === p.id ? null : p.id)}
                >
                  Rename
                </button>
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

              {signingFor === p.id ? (
                <div className="w-full border-t border-white/10 pt-3">
                  <ActionForm
                    action={updatePolicySigning}
                    hidden={{ policy_id: p.id }}
                    label="Save"
                    savedLabel="Saved"
                    buttonClassName="btn-primary px-3 py-2 text-xs"
                    onDone={() => setSigningFor(null)}
                  >
                    <SigningFields
                      idPrefix={`sign-${p.id}`}
                      signatureMode={p.signature_mode}
                      reassign={p.reassign_on_new_version}
                      newStarters={p.assign_to_new_starters}
                    />
                    <p className="form-hint">
                      Applies to this policy only. Signatures already given keep the rule that
                      was in force when they signed.
                    </p>
                  </ActionForm>
                </div>
              ) : null}

              {renaming === p.id ? (
                <div className="w-full border-t border-white/10 pt-3">
                  <ActionForm
                    action={renamePolicy}
                    hidden={{ policy_id: p.id }}
                    label="Save title"
                    savedLabel="Renamed"
                    buttonClassName="btn-primary px-3 py-2 text-xs"
                    /* Green flash, then the panel folds itself away (Phil, 2026-09-05).
                       Same behaviour the briefings tile already had; onDone waits out
                       the flash so the confirmation is read before it closes. */
                    onDone={() => setRenaming(null)}
                  >
                    <label htmlFor={`rename-${p.id}`} className="form-label">
                      Title
                    </label>
                    <input
                      id={`rename-${p.id}`}
                      name="title"
                      defaultValue={p.title}
                      required
                      maxLength={140}
                    />
                    <p className="form-hint">
                      Only the name changes. This is not a new version, so nobody is asked
                      to sign again and signatures already given are untouched.
                    </p>
                  </ActionForm>
                </div>
              ) : null}

              {editing === p.id ? (
                <div className="w-full border-t border-white/10 pt-3">
                  <ActionForm
                    action={updateWrittenPolicy}
                    hidden={{ policy_id: p.id }}
                    label={`Save as version ${p.version + 1}`}
                    savedLabel="Saved"
                    buttonClassName="btn-primary px-3 py-2 text-xs"
                    onDone={() => setEditing(null)}
                  >
                    <label htmlFor={`edit-${p.id}`} className="form-label">
                      The wording
                    </label>
                    <textarea id={`edit-${p.id}`} name="body" rows={16} defaultValue={p.body ?? ""} required />
                    {/* For the cover's Audit Checklist and Report and change history (0410). */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`chg-${p.id}`} className="form-label">What changed</label>
                        <input id={`chg-${p.id}`} name="change_summary" maxLength={200} placeholder="For example, updated the falls reporting steps" />
                      </div>
                      <div>
                        <label htmlFor={`why-${p.id}`} className="form-label">Reason for review</label>
                        <select id={`why-${p.id}`} name="review_reason" defaultValue="Annual review">
                          {REVIEW_REASONS.filter((r) => r !== "New policy").map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="form-hint">
                      Editing creates version {p.version + 1}. Version {p.version} is kept exactly
                      as it reads now, so signatures already given stay evidenced.
                      {p.reassign_on_new_version === "always"
                        ? " Everyone who has signed it before will be asked to sign the new version."
                        : p.reassign_on_new_version === "ask"
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
                    onDone={() => setVersioning(null)}
                  >
                    <label htmlFor={`ver-${p.id}`} className="form-label">
                      The new document
                    </label>
                    <input
                      id={`ver-${p.id}`}
                      name="document"
                      type="file"
                      required
                      accept="application/pdf,.pdf"
                    />
                    <p className="form-hint">
                      Version {p.version} is kept, so signatures against it stay evidenced.
                      {p.reassign_on_new_version === "always"
                        ? " Everyone who has signed it before will be asked to sign this version."
                        : p.reassign_on_new_version === "ask"
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
