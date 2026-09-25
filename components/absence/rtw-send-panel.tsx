"use client";

/**
 * Send the drafted Return to Work questions to the employee by text (Phil, 2026-09-25).
 *
 * Lives INSIDE the Return to Work dialog's form, so it is a button that calls the action, never
 * a form of its own: a form inside a form is not allowed and the browser quietly drops one.
 */

import { useActionState, useEffect, useState } from "react";
import { sendRtwQuestions } from "@/lib/absence/rtw-questions-actions";
import { IDLE_STATE, type AiQuestion } from "@/lib/forms";
import { rtwLinkExpired, type RtwQuestionnaireStatus } from "@/lib/absence/rtw-questions";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

export default function RtwSendPanel({
  absenceEventId,
  firstName,
  status,
  sentAt,
  sentToLast4,
  expiresAt,
  questions,
  lock,
}: {
  absenceEventId: string;
  firstName: string;
  status: RtwQuestionnaireStatus;
  sentAt: string | null;
  sentToLast4: string | null;
  expiresAt: string | null;
  questions: AiQuestion[];
  lock: () => void;
}) {
  const [state, send, pending] = useActionState(sendRtwQuestions, IDLE_STATE);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    if (state.ok || state.error) setSending(false);
    if (state.ok) {
      setJustSent(true);
      lock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Answered or recorded: nothing to send. The note above the questions says who answered.
  if (status === "answered" || status === "recorded") return null;

  const sent = status === "sent" || justSent;
  const expired = !justSent && rtwLinkExpired(expiresAt, Date.now());
  const busy = pending || sending;
  const who = firstName || "them";

  function press() {
    setSending(true);
    const fd = new FormData();
    fd.set("absence_event_id", absenceEventId);
    fd.set("questions", JSON.stringify(questions));
    setTimeout(() => send(fd), 0);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      {sent ? (
        <p className="text-sm text-white/70">
          {justSent
            ? state.ok
            : expired
              ? `Sent to the phone ending ${sentToLast4 ?? ""} on ${shortDate(sentAt)}. The link ran out on ${shortDate(expiresAt)}, so send it again if you still want ${who} to answer.`
              : `Sent to the phone ending ${sentToLast4 ?? ""} on ${shortDate(sentAt)}. Waiting for ${who} to answer. The link works until ${shortDate(expiresAt)}.`}
        </p>
      ) : (
        <p className="text-sm text-white/70">
          Check these questions first. Change any wording or remove any you do not want, then
          send them to {who}. They get a text with a link, sign in to their portal and answer
          them, and the answers come back here for you to check.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={sent ? "btn-outline px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
          disabled={busy || questions.length === 0 || questions.some((q) => !q.question.trim())}
          onClick={press}
        >
          {busy ? "Sending…" : sent ? "Send the text again" : `Send to ${who} by text`}
        </button>
      </div>
      {state.error ? <p className="form-error mt-2">{state.error}</p> : null}
    </div>
  );
}
