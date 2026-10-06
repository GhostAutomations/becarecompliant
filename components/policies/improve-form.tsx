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

  return (
    <ActionForm action={reviewPolicyWithAi} label="Check my policy" savingLabel="Checking your policy… this takes up to a minute" buttonClassName="btn-primary">
      <div className="space-y-4">
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
              if (p?.topic_key) setTopicKey(p.topic_key);
            }}
          >
            <option value="">Upload or paste one instead</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        {policyId === "paste" || policyId === "" ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="document" className="form-label">Upload it</label>
              <input id="document" name="document" type="file" accept="application/pdf,.pdf" />
              <p className="form-hint">A PDF, up to 3MB.</p>
            </div>
            <div>
              <label htmlFor="pasted" className="form-label">Or paste the wording</label>
              <textarea id="pasted" name="pasted" rows={12} placeholder="Paste the whole policy here" />
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="topic_key" className="form-label">Which standard policy is it? *</label>
          <select id="topic_key" name="topic_key" value={topicKey} onChange={(e) => setTopicKey(e.target.value)} required>
            <option value="">Choose</option>
            {topics.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
          </select>
          <p className="form-hint">So it is checked against the right legislation and guidance.</p>
        </div>
        <p className="form-hint">Uses {POLICY_IMPROVE_CREDITS} AI credits. Nothing changes until you approve the result.</p>
      </div>
    </ActionForm>
  );
}
