"use client";

/**
 * The employee answering their Return to Work questions, from the link in the text. Every
 * question must be answered (Phil: "they must complete those questions"); the database checks
 * it again, so this screen is a courtesy and not the rule.
 */

import { useActionState, useEffect, useState } from "react";
import { submitMyRtwAnswers } from "@/lib/absence/rtw-questions-actions";
import { IDLE_STATE, type AiQuestion } from "@/lib/forms";

export default function RtwAnswerForm({
  questionnaireId,
  questions,
}: {
  questionnaireId: string;
  questions: AiQuestion[];
}) {
  const [state, submit, pending] = useActionState(submitMyRtwAnswers, IDLE_STATE);
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [missing, setMissing] = useState<number[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (state.ok || state.error) setSending(false);
  }, [state]);

  function set(i: number, value: string) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)));
    setMissing((prev) => prev.filter((m) => m !== i));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const empty = answers.map((a, i) => (a.trim() ? -1 : i)).filter((i) => i >= 0);
    if (empty.length > 0) {
      setMissing(empty);
      document.getElementById(`rtw-a-${empty[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    const fd = new FormData();
    fd.set("questionnaire_id", questionnaireId);
    fd.set("answers", JSON.stringify(answers.map((a) => a.trim())));
    setTimeout(() => submit(fd), 0);
  }

  if (state.ok) {
    return (
      <p className="text-sm text-white/80">
        {state.ok === "already"
          ? "Your answers had already been sent. Thank you."
          : "Thank you. Your answers have gone to your manager, who will talk them through with you at your Return to Work meeting."}
      </p>
    );
  }

  const busy = pending || sending;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {questions.map((q, i) => (
        <div key={`rtw-q-${i}`} id={`rtw-a-${i}`} className="flex flex-col gap-1.5">
          <label htmlFor={`rtw-input-${i}`} className="form-label">
            {i + 1}. {q.question}
          </label>
          {q.type === "yes_no" ? (
            <div className="mt-1 flex gap-2">
              {["Yes", "No"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={busy}
                  onClick={() => set(i, opt)}
                  aria-pressed={answers[i] === opt}
                  className={`rounded-xl px-5 py-2.5 text-sm font-medium ${
                    answers[i] === opt ? "bg-gold-400/20 text-white" : "bg-white/5 text-white/60"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : q.type === "choice" ? (
            <select
              id={`rtw-input-${i}`}
              value={answers[i]}
              disabled={busy}
              onChange={(e) => set(i, e.target.value)}
            >
              <option value="">Please choose</option>
              {(q.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              id={`rtw-input-${i}`}
              rows={3}
              maxLength={2000}
              value={answers[i]}
              disabled={busy}
              onChange={(e) => set(i, e.target.value)}
            />
          )}
          {missing.includes(i) ? <p className="form-error">Please answer this question.</p> : null}
        </div>
      ))}
      {missing.length > 0 ? (
        <p className="form-error">
          {missing.length === 1 ? "One question still needs an answer." : `${missing.length} questions still need an answer.`}
        </p>
      ) : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send my answers"}
        </button>
      </div>
    </form>
  );
}
