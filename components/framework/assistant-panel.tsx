"use client";

import { useState, useTransition } from "react";
import { draftReadinessNarrative, askReadiness } from "@/lib/framework/ai";

/**
 * The Inspection Readiness assistant: ask grounded questions, or draft an
 * inspection narrative and gap list. Read only, answers come from the company's
 * own live data. A manager edits and signs off anything they use.
 */
export default function AssistantPanel() {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"draft" | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function ask() {
    if (!question.trim()) return;
    setError(null);
    setAnswer(null);
    setMode(null);
    startTransition(async () => {
      const res = await askReadiness(question);
      if ("error" in res) setError(res.error);
      else setAnswer(res.ok);
    });
  }

  function draft() {
    setError(null);
    setNarrative(null);
    setMode("draft");
    startTransition(async () => {
      const res = await draftReadinessNarrative();
      if ("error" in res) setError(res.error);
      else setNarrative(res.ok);
    });
  }

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Readiness assistant</h2>
        <button type="button" onClick={draft} disabled={pending} className="btn-outline text-xs">
          {pending && mode === "draft" ? "Drafting…" : "Draft inspection narrative"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder="Ask, e.g. what needs attention for Care and Support?"
          className="min-w-0 flex-1"
          aria-label="Ask the readiness assistant"
        />
        <button type="button" onClick={ask} disabled={pending} className="btn-primary text-sm">
          {pending && mode === null ? "Thinking…" : "Ask"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {answer ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/90 whitespace-pre-wrap">
          {answer}
        </div>
      ) : null}

      {narrative ? (
        <div className="space-y-2">
          <p className="text-xs text-white/50">Draft, edit before you use it. Based on your live data, not a rating.</p>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={16}
            className="w-full whitespace-pre-wrap font-mono text-xs"
          />
        </div>
      ) : null}

      <p className="text-[11px] text-white/40">
        The assistant reads only your own data, scoped to what you can see. It is a preparation aid,
        not regulatory or legal advice.
      </p>
    </div>
  );
}
