"use client";

import { useState, useTransition } from "react";
import { draftReadinessNarrative, askReadiness } from "@/lib/framework/ai";

/**
 * The Inspection Readiness assistant. Quick actions and free-text questions
 * answered from the company's own live data, plus a full inspection narrative
 * draft. Read only; a manager edits and signs off anything they use.
 */
export default function AssistantPanel({ requirements }: { requirements: Array<{ code: string; title: string }> }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"draft" | "ask">("ask");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAsk(q: string) {
    if (!q.trim()) return;
    setError(null);
    setAnswer(null);
    setNarrative(null);
    setMode("ask");
    startTransition(async () => {
      const res = await askReadiness(q);
      if ("error" in res) setError(res.error);
      else setAnswer(res.ok);
    });
  }

  function draft() {
    setError(null);
    setNarrative(null);
    setAnswer(null);
    setMode("draft");
    startTransition(async () => {
      const res = await draftReadinessNarrative();
      if ("error" in res) setError(res.error);
      else setNarrative(res.ok);
    });
  }

  const chips: Array<{ label: string; q: string }> = [
    { label: "Biggest risk", q: "What is our single biggest inspection risk right now, and what should we do first?" },
    { label: "What needs booking", q: "Which checks are overdue or due soon and need booking or completing? List them by area, most urgent first." },
    ...requirements.slice(0, 6).map((r) => ({ label: r.title, q: `How ready are we for ${r.title}, and what specifically needs attention?` })),
  ];

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          Readiness assistant
          <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-300">AI</span>
        </h2>
        <button type="button" onClick={draft} disabled={pending} className="btn-outline text-xs">
          {pending && mode === "draft" ? "Drafting…" : "Draft inspection narrative"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={pending}
            onClick={() => runAsk(c.q)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:border-gold-400/50 hover:bg-gold-400/10 hover:text-white"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runAsk(question); }}
          placeholder="Ask anything about your readiness…"
          className="min-w-0 flex-1"
          aria-label="Ask the readiness assistant"
        />
        <button type="button" onClick={() => runAsk(question)} disabled={pending} className="btn-primary text-sm">
          {pending && mode === "ask" ? "Thinking…" : "Ask"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {answer ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/90 whitespace-pre-wrap">{answer}</div>
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
        The assistant reads only your own data, scoped to what you can see. It is a preparation aid, not
        regulatory or legal advice.
      </p>
    </div>
  );
}
