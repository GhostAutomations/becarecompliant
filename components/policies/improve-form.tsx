"use client";

/**
 * Improve a policy with AI (Phil, 2026-10-06): one of your policies, or pasted wording, checked
 * against the approved guidance library. The result opens as a review: what is missing or out of
 * date, and a redraft you accept section by section.
 */

import { POLICY_IMPROVE_CREDITS } from "@/lib/policies/credits";
import { useState } from "react";
import ActionForm from "@/components/action-form";
import { reviewPolicyWithAi } from "@/lib/policies/ai-actions";
import type { PolicyTopic } from "@/lib/policies/data";

type Mine = { id: string; title: string; topic_key: string | null };

export default function PolicyImproveForm({ topics, policies, initial }: { topics: PolicyTopic[]; policies: Mine[]; initial: string | null }) {
  const start = policies.find((p) => p.id === initial) ?? null;
  const [policyId, setPolicyId] = useState(start?.id ?? (policies.length ? "" : "paste"));
  const [topicKey, setTopicKey] = useState(start?.topic_key ?? "");
  /* Alphabetical, optional, and set from the policy chosen (Phil, 2026-10-08): a policy saved as
     "Not one of the standard policies" stays that way here, and is checked against the core care
     rules for your nation instead of one topic's guidance. */
  const sorted = [...topics].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <ActionForm action={reviewPolicyWithAi} label="Check my policy" savingLabel="Checking your policy… this takes up to a minute" buttonClassName="btn-primary">
      <div className="space-y-4">
        {/* Only worth asking when there is something to choose (Phil, 2026-10-06: with no policies
            the list held just "upload or paste", a pointless drop down). */}
        {policies.length > 0 ? (
        <div>
          <label htmlFor="policy_id" className="form-label">Which policy? *</label>
          <select
            id="policy_id"
            name="policy_id"
            value={policyId === "paste" ? "" : policyId}
            onChange={(e) => {
              const id = e.target.value || "paste";
              setPolicyId(id);
              const p = policies.find((x) => x.id === id);
              if (p) setTopicKey(p.topic_key ?? "");
            }}
          >
            <option value="">Upload or paste a different one</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        ) : null}
        {policyId === "paste" || policyId === "" ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="document" className="form-label">Upload your policy</label>
              <input
                id="document"
                name="document"
                type="file"
                accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
              />
              <p className="form-hint">A PDF or Word document (.docx), up to 3MB.</p>
            </div>
            <div>
              <label htmlFor="pasted" className="form-label">Or paste the wording</label>
              <textarea id="pasted" name="pasted" rows={12} placeholder="Paste the whole policy here" />
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="topic_key" className="form-label">Which standard policy is it? (optional)</label>
          <select id="topic_key" name="topic_key" value={topicKey} onChange={(e) => setTopicKey(e.target.value)}>
            <option value="">Not one of the standard policies</option>
            {sorted.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
          </select>
          <p className="form-hint">
            {topicKey
              ? "It is checked against that policy's legislation and guidance."
              : "It is checked against the core care rules for your nation, rather than one policy's guidance."}
          </p>
        </div>
        <p className="form-hint">Uses {POLICY_IMPROVE_CREDITS} AI credits. Nothing changes until you approve the result.</p>
      </div>
    </ActionForm>
  );
}
