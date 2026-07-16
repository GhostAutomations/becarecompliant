"use client";

/**
 * Be Care Compliant — "Initial Response" for a complaint. AI drafts an
 * acknowledgement from the complaint details (Enterprise, metered). For an email
 * complainant it is reviewed then sent via Resend on approval; for a postal
 * complainant it is a letter to copy onto headed paper. Either way it records the
 * response and stamps the complaint as acknowledged today.
 */

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  generateInitialResponse,
  sendInitialResponse,
  recordPostalResponse,
} from "@/lib/complaints/actions";

export default function InitialResponseButton({
  complaintId,
  contactMethod,
  contactEmail,
  contactAddress,
  done = false,
}: {
  complaintId: string;
  contactMethod: "email" | "post" | null;
  contactEmail: string | null;
  contactAddress: string | null;
  done?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [sendState, sendAction, sending] = useActionState(sendInitialResponse, IDLE_STATE);
  const [recordState, recordAction, recording] = useActionState(recordPostalResponse, IDLE_STATE);

  const isEmail = contactMethod === "email" && !!contactEmail;
  const busy = sending || recording;

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setConfirming(false);
    const fd = new FormData();
    fd.set("complaint_id", complaintId);
    const res = await generateInitialResponse(IDLE_STATE, fd);
    setGenerating(false);
    if (res.error || !res.ok) {
      setGenError(res.error ?? "Could not generate a response.");
      return;
    }
    try {
      const d = JSON.parse(res.ok) as { subject?: string; body: string };
      setSubject(d.subject ?? "");
      setBody(d.body);
    } catch {
      setGenError("Could not read the generated response. Try again.");
    }
  }

  function openDialog() {
    setOpen(true);
    setSubject("");
    setBody("");
    setGenError(null);
    setConfirming(false);
    void generate();
  }

  useEffect(() => {
    if (sendState.ok || recordState.ok) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendState, recordState]);

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Clipboard may be unavailable; the text is still selectable in the box.
    }
  }

  return (
    <>
      <button
        type="button"
        className={done ? "btn btn-saved px-3 py-2 text-sm" : "btn-outline px-3 py-2 text-sm"}
        onClick={openDialog}
      >
        Initial Response
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Initial Response</h2>
              {!generating ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen(false)} disabled={busy}>
                  Close
                </button>
              ) : null}
            </div>

            {generating ? (
              <p className="text-sm text-white/70">Drafting a response from the complaint details…</p>
            ) : genError ? (
              <div className="space-y-3">
                <p className="form-error">{genError}</p>
                <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={() => void generate()}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-white/50">
                  {isEmail
                    ? `Review and edit this email, then send it to ${contactEmail}. Sending marks the complaint as acknowledged today.`
                    : "Review and edit this letter, then copy and save it. Saving records the response and marks the complaint as acknowledged today, ready for you to print on your headed paper and post."}
                </p>

                {isEmail ? (
                  <form action={sendAction} className="space-y-3">
                    <input type="hidden" name="complaint_id" value={complaintId} />
                    <div>
                      <label htmlFor="ir_subject" className="form-label">Subject</label>
                      <input id="ir_subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="ir_body" className="form-label">Message</label>
                      <textarea id="ir_body" name="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                    {sendState.error ? <p className="form-error">{sendState.error}</p> : null}
                    <div className="flex items-center gap-3">
                      <button type="submit" className="btn-primary" disabled={busy}>
                        {sending ? "Sending…" : "Send email"}
                      </button>
                      <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => void generate()} disabled={busy}>
                        Regenerate
                      </button>
                    </div>
                  </form>
                ) : (
                  <form action={recordAction} className="space-y-3">
                    <input type="hidden" name="complaint_id" value={complaintId} />
                    <div>
                      <label htmlFor="ir_letter" className="form-label">Letter</label>
                      <textarea id="ir_letter" name="body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                    {contactAddress ? <p className="text-xs text-white/50">Send to: {contactAddress}</p> : null}
                    {recordState.error ? <p className="form-error">{recordState.error}</p> : null}
                    {confirming ? (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm text-white/80">
                          The letter has been copied to your clipboard. Paste it onto your headed paper and
                          post it to the complainant. Confirming records this response and marks the complaint
                          as acknowledged today.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button type="submit" className="btn-primary" disabled={busy}>
                            {recording ? "Saving…" : "Confirm, I have copied the letter"}
                          </button>
                          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setConfirming(false)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={async () => {
                            await copyLetter();
                            setConfirming(true);
                          }}
                        >
                          Copy and save letter to record
                        </button>
                        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => void generate()} disabled={busy}>
                          Regenerate
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
