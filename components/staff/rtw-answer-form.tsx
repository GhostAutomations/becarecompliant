"use client";

/**
 * The employee answering their Return to Work questions, from the link in the text. Every
 * question must be answered (Phil: "they must complete those questions"); the database checks
 * it again, so this screen is a courtesy and not the rule.
 *
 * FOLLOW UPS (Phil, 2026-09-29, 0344). A Yes to a fit note asks for it there and then (a photo or
 * a PDF), unless one is already uploaded. A Yes to support asks "What do you need?", and a Yes to
 * anything else asks "What would you like to raise?". Both must be filled in.
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { submitMyRtwAnswers, uploadMyFitNote } from "@/lib/absence/rtw-questions-actions";
import { IDLE_STATE, type AiQuestion } from "@/lib/forms";
import { followUpPrompt, needsDetail } from "@/lib/ai-follow-ups";
import { shrinkImageFile } from "@/lib/images/shrink";

export default function RtwAnswerForm({
  questionnaireId,
  questions,
  fitNoteName: initialFitNote = null,
}: {
  questionnaireId: string;
  questions: AiQuestion[];
  /** A fit note already uploaded for this absence, if any. */
  fitNoteName?: string | null;
}) {
  const [state, submit, pending] = useActionState(submitMyRtwAnswers, IDLE_STATE);
  const [uploadState, upload, uploading] = useActionState(uploadMyFitNote, IDLE_STATE);
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [details, setDetails] = useState<string[]>(questions.map(() => ""));
  const [missing, setMissing] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [fitNote, setFitNote] = useState<string | null>(initialFitNote);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state.ok || state.error) setSending(false);
  }, [state]);
  useEffect(() => {
    if (uploadState.ok && uploadState.data?.name) {
      setFitNote(uploadState.data.name);
      setMissing((prev) => prev.filter((m) => questions[m]?.followUp !== "fit_note"));
    }
  }, [uploadState, questions]);

  function set(i: number, value: string) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)));
    setMissing((prev) => prev.filter((m) => m !== i));
  }
  function setDetail(i: number, value: string) {
    setDetails((prev) => prev.map((d, j) => (j === i ? value : d)));
    setMissing((prev) => prev.filter((m) => m !== i));
  }

  /** What still stops this question being complete, or null. */
  function problem(i: number): string | null {
    const q = questions[i];
    const a = answers[i].trim();
    if (!a) return "Please answer this question.";
    if (needsDetail(q.followUp, a) && !details[i].trim()) return "Please tell us a little more.";
    if (q.followUp === "fit_note" && a === "Yes" && !fitNote) return "Please upload your fit note.";
    return null;
  }

  async function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const picked = e.target.files?.[0];
    if (!picked) return;
    setPreparing(true);
    const file = await shrinkImageFile(picked);
    setPreparing(false);
    if (file.size > 3.8 * 1024 * 1024) {
      setFileError("That file is too big to upload. Try a photo instead of a scan, or a smaller PDF.");
      return;
    }
    const fd = new FormData();
    fd.set("questionnaire_id", questionnaireId);
    fd.set("fit_note", file);
    startTransition(() => upload(fd));
    if (fileRef.current) fileRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const bad = questions.map((_, i) => (problem(i) ? i : -1)).filter((i) => i >= 0);
    if (bad.length > 0) {
      setMissing(bad);
      document.getElementById(`rtw-a-${bad[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    const fd = new FormData();
    fd.set("questionnaire_id", questionnaireId);
    fd.set("answers", JSON.stringify(answers.map((a) => a.trim())));
    fd.set(
      "details",
      JSON.stringify(questions.map((q, i) => (needsDetail(q.followUp, answers[i]) ? details[i].trim() : null))),
    );
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
      {questions.map((q, i) => {
        const prompt = followUpPrompt(q.followUp);
        const showDetail = needsDetail(q.followUp, answers[i]);
        const showUpload = q.followUp === "fit_note" && answers[i] === "Yes";
        return (
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

            {showDetail && prompt ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <label htmlFor={`rtw-detail-${i}`} className="form-label">
                  {prompt}
                </label>
                <textarea
                  id={`rtw-detail-${i}`}
                  rows={3}
                  maxLength={2000}
                  value={details[i]}
                  disabled={busy}
                  onChange={(e) => setDetail(i, e.target.value)}
                />
              </div>
            ) : null}

            {showUpload ? (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                {fitNote ? (
                  <p className="text-sm text-emerald-300">
                    Fit note uploaded: {fitNote}.{" "}
                    <button
                      type="button"
                      className="underline decoration-dotted"
                      disabled={busy || uploading || preparing}
                      onClick={() => fileRef.current?.click()}
                    >
                      Replace it
                    </button>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-white/80">
                      Please upload your fit note now. A clear photo of it is fine, or a PDF.
                    </p>
                    <button
                      type="button"
                      className="btn-outline mt-2 px-3 py-2 text-sm"
                      disabled={busy || uploading || preparing}
                      onClick={() => fileRef.current?.click()}
                    >
                      {preparing || uploading ? "Uploading…" : "Upload my fit note"}
                    </button>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={chooseFile}
                />
                {fileError ? <p className="form-error">{fileError}</p> : null}
                {uploadState.error ? <p className="form-error">{uploadState.error}</p> : null}
              </div>
            ) : null}

            {missing.includes(i) ? <p className="form-error">{problem(i) ?? "Please answer this question."}</p> : null}
          </div>
        );
      })}
      {missing.length > 0 ? (
        <p className="form-error">
          {missing.length === 1 ? "One question still needs an answer." : `${missing.length} questions still need an answer.`}
        </p>
      ) : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div>
        <button type="submit" className="btn-primary" disabled={busy || uploading || preparing}>
          {busy ? "Sending…" : "Send my answers"}
        </button>
      </div>
    </form>
  );
}
