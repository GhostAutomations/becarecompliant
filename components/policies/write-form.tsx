"use client";

/**
 * Write a policy with AI (Phil, 2026-10-06): pick a standard policy, answer a few questions about
 * your own service, and the AI drafts it from the approved guidance library with its sources.
 * The draft opens for editing; nothing becomes a policy until it is approved there.
 */

import { POLICY_WRITE_CREDITS } from "@/lib/policies/credits";
import CoverFields from "@/components/policies/cover-fields";
import { DEFAULT_COVER } from "@/lib/policies/cover";
import { useState } from "react";
import ActionForm from "@/components/action-form";
import { generatePolicyDraft } from "@/lib/policies/ai-actions";
import type { PolicyTopic } from "@/lib/policies/data";

/** Where each set up lives, for the "change it" link. */
const SETTINGS_HREF: Record<string, { href: string; label: string }> = {
  sickness_absence: { href: "/settings/absence", label: "Change the absence set up" },
  probation: { href: "/settings/people", label: "Change the probation period" },
  capability: { href: "/settings/people", label: "Change the probation period" },
};

export default function PolicyWriteForm({
  topics,
  initial,
  settings,
  owners,
  me,
}: {
  topics: PolicyTopic[];
  initial: string | null;
  settings: Record<string, string[]>;
  owners: Array<{ id: string; full_name: string | null; role: string }>;
  me: string;
}) {
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
            <div>
              <label htmlFor="owner_id" className="form-label">Who owns this policy? *</label>
              <select id="owner_id" name="owner_id" defaultValue={owners.some((o) => o.id === me) ? me : ""} required>
                <option value="">Choose the policy owner</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name ?? "Unnamed"}</option>
                ))}
              </select>
              <p className="form-hint">They are named in the policy and keep it up to date. Their reviews show on the review register.</p>
            </div>
            {settings[topic.key]?.length ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">From your set up</p>
                <p className="form-hint">The policy will match these exactly, so it agrees with the system.</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
                  {settings[topic.key].map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {SETTINGS_HREF[topic.key] ? (
                  <a href={SETTINGS_HREF[topic.key].href} className="text-xs text-gold-300 hover:underline">
                    {SETTINGS_HREF[topic.key].label}
                  </a>
                ) : null}
              </div>
            ) : null}
            <CoverFields people={owners} value={DEFAULT_COVER} />
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
            <p className="form-hint">Uses {POLICY_WRITE_CREDITS} AI credits. The draft is written only from the official guidance in our library, and every requirement shows its source.</p>
          </>
        ) : null}
      </div>
    </ActionForm>
  );
}
