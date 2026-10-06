"use client";

/**
 * An AI draft or review, ready to approve (Phil, 2026-10-06).
 *
 *   A new draft: edit the wording freely, choose a new policy or the next version of one you
 *   already have, approve.
 *   A review: what is missing or out of date (with its source), then each section side by side,
 *   yours and the suggested wording; keep yours or use (and edit) the suggestion, then approve.
 *
 * The sources are listed under both, and are added to the policy itself on approval.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { approvePolicyDraft, discardPolicyDraft } from "@/lib/policies/ai-actions";
import type { ImproveReview } from "@/lib/policies/ai-prompt";
import { findPlaceholders } from "@/lib/policies/placeholders";
import CoverFields from "@/components/policies/cover-fields";
import { coverFromStored, REVIEW_REASONS } from "@/lib/policies/cover";

type Source = { n: number; title: string; publisher: string; url: string; checkedOn: string };
type Existing = { id: string; title: string };

const SEVERITY = { high: "pill pill-red", medium: "pill pill-amber", low: "pill pill-neutral" } as const;

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="glass-card p-5">
      <h2 className="mb-2 text-sm font-semibold text-white">Sources this was written from</h2>
      <ul className="space-y-1 text-sm text-white/70">
        {sources.map((s) => (
          <li key={s.n}>
            <span className="font-semibold text-white">[S{s.n}]</span>{" "}
            <a href={s.url} target="_blank" rel="noreferrer" className="text-gold-300 hover:underline">{s.title}</a>, {s.publisher}, checked {s.checkedOn}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DraftEditor({
  draft,
  existing,
  sameTopic,
  owners,
}: {
  draft: { id: string; kind: "write" | "improve"; title: string; draft_text: string | null; review: ImproveReview | null; policy_id: string | null; sources: Source[]; owner_id: string | null; cover: unknown };
  existing: Existing[];
  sameTopic: Existing | null;
  owners: Array<{ id: string; full_name: string | null; role: string }>;
}) {
  const review = draft.review;
  /* A section the AI left unchanged (no suggestion) starts on the provider's own wording. */
  const [use, setUse] = useState<string[]>(() => (review ? review.sections.map((s) => (s.proposed.trim() ? "proposed" : "original")) : []));
  const [body, setBody] = useState(draft.draft_text ?? "");
  const [target, setTarget] = useState<string>(draft.policy_id ?? sameTopic?.id ?? "new");
  /* Everything still marked "[To be completed: ...]", as fields under the policy (Phil,
     2026-10-06). A new draft is read as it is edited; a review from its suggested sections. */
  const toFill =
    draft.kind === "write"
      ? findPlaceholders(body)
      : findPlaceholders((review?.sections ?? []).map((s, i) => (use[i] === "original" ? s.original : s.proposed)).join("\n"));

  return (
    <div className="space-y-5">
      {review ? (
        <div className="glass-card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-white">What we found</h2>
          {review.summary ? <p className="text-sm text-white/80">{review.summary}</p> : null}
          {review.gaps.length === 0 ? (
            <p className="text-sm text-white/60">No gaps found.</p>
          ) : (
            <ul className="space-y-2">
              {review.gaps.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/80">
                  <span className={SEVERITY[g.severity]}>{g.severity === "high" ? "High" : g.severity === "medium" ? "Medium" : "Low"}</span>
                  <span>
                    {g.issue} {g.source ? <span className="text-white/45">[{g.source}]</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <ActionForm action={approvePolicyDraft} hidden={{ draft_id: draft.id }} label="Approve and save the policy" savingLabel="Saving…" buttonClassName="btn-primary">
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="form-label">Title</label>
            <input id="title" name="title" defaultValue={draft.title} maxLength={140} />
          </div>

          {draft.kind === "write" ? (
            <div>
              <label htmlFor="body" className="form-label">The policy</label>
              <textarea id="body" name="body" rows={28} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="form-hint">
                A line starting # is a heading, a line starting with a dash is a bullet. The list of sources is added at the
                end when you approve.
              </p>
            </div>
          ) : review ? (
            <div className="space-y-4">
              {review.sections.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{s.heading}</p>
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-1 text-white/80">
                        <input type="radio" name={`use_${i}`} value="proposed" checked={use[i] === "proposed"} onChange={() => setUse((u) => u.map((x, j) => (j === i ? "proposed" : x)))} />
                        Use the suggestion
                      </label>
                      <label className={`flex items-center gap-1 ${s.original ? "text-white/80" : "text-white/30"}`}>
                        <input type="radio" name={`use_${i}`} value="original" disabled={!s.original} checked={use[i] === "original"} onChange={() => setUse((u) => u.map((x, j) => (j === i ? "original" : x)))} />
                        Keep mine
                      </label>
                    </div>
                  </div>
                  {s.reason ? <p className="text-xs text-white/55">{s.reason}</p> : null}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Yours</p>
                      <p className="whitespace-pre-line rounded-lg bg-white/5 p-3 text-sm text-white/70">{s.original || "Not in your policy."}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Suggested</p>
                      <textarea name={`text_${i}`} rows={8} defaultValue={s.proposed || s.original} disabled={use[i] !== "proposed"} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="form-error">This review could not be read.</p>
          )}

          {toFill.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
              <p className="text-sm font-semibold text-white">
                To be completed ({toFill.length})
              </p>
              <p className="form-hint">
                The guidance did not say these, so only you can. Your answer replaces the marked text in the policy when you save.
              </p>
              {toFill.map((ask, i) => (
                <div key={ask}>
                  <input type="hidden" name={`fill_prompt_${i}`} value={ask} />
                  <label htmlFor={`fill_${i}`} className="form-label">{ask.charAt(0).toUpperCase() + ask.slice(1)}</label>
                  <input id={`fill_${i}`} name={`fill_${i}`} placeholder="Please type your answer" maxLength={1000} />
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <label htmlFor="owner_id" className="form-label">Policy owner</label>
            <select id="owner_id" name="owner_id" defaultValue={draft.owner_id ?? ""}>
              <option value="">Not set</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name ?? "Unnamed"}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="target" className="form-label">Save it as</label>
            <select id="target" name="target" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">A new policy</option>
              {existing.map((p) => (
                <option key={p.id} value={p.id}>The next version of {p.title}</option>
              ))}
            </select>
            <p className="form-hint">A new version keeps the old one, and asks your team to sign again if that policy is set to.</p>
          </div>

          <CoverFields people={owners} value={coverFromStored(draft.cover)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="reference" className="form-label">Reference</label>
              <input id="reference" name="reference" maxLength={30} placeholder={target === "new" ? "Given automatically, for example POL-HR-001" : "Keeps its current reference"} />
              <p className="form-hint">Leave blank unless you already number your policies.</p>
            </div>
            <div>
              <label htmlFor="change_summary" className="form-label">What changed (for the change history)</label>
              <input
                id="change_summary"
                name="change_summary"
                maxLength={200}
                key={target === "new" ? "new" : "next"}
                defaultValue={target === "new" ? "First issue" : ""}
                placeholder={target === "new" ? "First issue" : "For example, updated for the new sick pay rules"}
              />
            </div>
            <div>
              <label htmlFor="review_reason" className="form-label">Reason for review</label>
              <select
                id="review_reason"
                name="review_reason"
                key={target === "new" ? "new-reason" : "next-reason"}
                defaultValue={target === "new" ? "New policy" : "Annual review"}
              >
                {REVIEW_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <p className="form-hint">Printed on the cover, in the Audit Checklist and Report.</p>
            </div>
          </div>
        </div>
      </ActionForm>

      <Sources sources={draft.sources} />

      <ActionForm
        action={discardPolicyDraft}
        hidden={{ draft_id: draft.id }}
        label="Discard this draft"
        buttonClassName="btn-ghost text-xs"
        confirm="Discard this draft? It cannot be brought back."
      />
    </div>
  );
}
