"use client";

/**
 * Write a policy with AI (Phil, 2026-10-06): pick a standard policy, answer a few questions about
 * your own service, and the AI drafts it from the approved guidance library with its sources.
 * The draft opens for editing; nothing becomes a policy until it is approved there.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { generatePolicyDraft } from "@/lib/policies/ai-actions";
import type { PolicyTopic } from "@/lib/policies/data";

export default function PolicyWriteForm({ topics, initial }: { topics: PolicyTopic[]; initial: string | null }) {
  const [key, setKey] = useState(initial && topics.some((t) => t.key === initial) ? initial : "");
  const topic = topics.find((t) => t.key === key) ?? null;

  return (
    <ActionForm action={generatePolicyDraft} label="Write the draft" savingLabel="Writing your policy… this takes up to a minute" buttonClassName="btn-primary">
      <div className="space-y-4">
        <div>
          <label htmlFor="topic_key" className="form-label">Which policy? *</label>
          <select id="topic_key" name="topic_key" value={key} onChange={(e) => setKey(e.target.value)} required>
            <option value="">Choose a policy</option>
            {topics.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
          </select>
          {topic ? <p className="form-hint">{topic.summary}</p> : null}
        </div>
        {topic ? (
          <>
            <div>
              <label htmlFor="title" className="form-label">Title</label>
              <input id="title" name="title" defaultValue={topic.title} maxLength={140} key={topic.key} />
            </div>
            <div className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">About your service</p>
              <p className="form-hint">The more you tell it, the less you will need to fill in afterwards. Anything left blank is marked in the draft for you to complete.</p>
              {topic.questions.map((q) => (
                <div key={`${topic.key}-${q.key}`}>
                  <label htmlFor={`q_${q.key}`} className="form-label">{q.label}</label>
                  {q.type === "yesno" ? (
                    <select id={`q_${q.key}`} name={`q_${q.key}`} defaultValue="">
                      <option value="">Please choose</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  ) : (
                    <textarea id={`q_${q.key}`} name={`q_${q.key}`} rows={2} maxLength={1000} />
                  )}
                </div>
              ))}
              <div>
                <label htmlFor="notes" className="form-label">Anything else it should include?</label>
                <textarea id="notes" name="notes" rows={3} maxLength={3000} placeholder="For example, your on call number arrangements, or a local authority requirement" />
              </div>
            </div>
            <p className="form-hint">Uses one AI credit. The draft is written only from the official guidance in our library, and every requirement shows its source.</p>
          </>
        ) : null}
      </div>
    </ActionForm>
  );
}
