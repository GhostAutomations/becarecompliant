"use client";

/**
 * Be Care Compliant — "Complaint Response". AI drafts the full response from the
 * completed Complaint Investigation form. Email path: review, optionally attach the
 * investigation's uploaded files, send via Resend. Post path: a letter to copy onto
 * headed paper. Records the response (kind = response). Mirrors the Initial Response
 * flow; only available once the investigation is completed.
 */

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  generateComplaintResponse,
  sendComplaintResponse,
  recordComplaintResponseLetter,
} from "@/lib/complaints/actions";

type Attachment = { path: string; name: string };

export default function ComplaintResponseButton({
  complaintId,
  contactMethod,
  contactEmail,
  contactAddress,
  hasInvestigation,
  done = false,
}: {
  complaintId: string;
  contactMethod: "email" | "post" | null;
  contactEmail: string | null;
  contactAddress: string | null;
  hasInvestigation: boolean;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const [sendState, sendAction, sending] = useActionState(sendComplaintResponse, IDLE_STATE);
  const [recordState, recordAction, recording] = useActionState(recordComplaintResponseLetter, IDLE_STATE);

  const isEmail = contactMethod === "email" && !!contactEmail;
  const busy = sending || recording;

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setConfirming(false);
    const fd = new FormData();
    fd.set("complaint_id", complaintId);
    const res = await generateComplaintResponse(IDLE_STATE, fd);
    setGenerating(false);
    if (res.error || !res.ok) {
      setGenError(res.error ?? "Could not generate a response.");
      return;
    }
    try {
      const d = JSON.parse(res.ok) as { subject?: string; body: string; attachments?: Attachment[] };
      setSubject(d.subject ?? "");
      setBody(d.body);
      setAttachments(d.attachments ?? []);
      setSelected(new Set());
    } catch {
      setGenError("Could not read the generated response. Try again.");
    }
  }

  function openDialog() {
    setOpen(true);
    setSubject("");
    setBody("");
    setAttachments([]);
    setSelected(new Set());
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

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // clipboard may be unavailable
    }
  }

  if (!hasInvestigation) {
    return (
      <span title="Complete the Complaint Investigation first">
        <button type="button" className="btn-outline px-3 py-2 text-sm opacity-50" disabled>
          Complaint Response
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={done ? "btn btn-saved px-3 py-2 text-sm" : "btn-outline px-3 py-2 text-sm"}
        onClick={openDialog}
      >
        Complaint Response
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Complaint Response</h2>
              {!generating ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen(false)} disabled={busy}>
                  Close
                </button>
              ) : null}
            </div>

            {generating ? (
              <p className="text-sm text-white/70">Drafting the response from the investigation…</p>
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
                    ? `Drafted from the investigation. Review and edit, then send it to ${contactEmail}.`
                    : "Drafted from the investigation. Review and edit, then copy the letter onto your headed paper."}
                </p>

                {isEmail ? (
                  <form action={sendAction} className="space-y-3">
                    <input type="hidden" name="complaint_id" value={complaintId} />
                    <input type="hidden" name="attachment_paths" value={JSON.stringify([...selected])} />
                    <div>
                      <label htmlFor="cr_subject" className="form-label">Subject</label>
                      <input id="cr_subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="cr_body" className="form-label">Message</label>
                      <textarea id="cr_body" name="body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                    {attachments.length > 0 ? (
                      <div className="space-y-1 rounded-lg border border-white/10 p-3">
                        <p className="text-xs font-medium text-white/70">Include attachments from the investigation?</p>
                        {attachments.map((att) => (
                          <label key={att.path} className="flex items-center gap-2 text-sm text-white/80">
                            <input type="checkbox" checked={selected.has(att.path)} onChange={() => toggle(att.path)} />
                            {att.name}
                          </label>
                        ))}
                        <p className="form-hint">Ticked files are attached to the email.</p>
                      </div>
                    ) : null}
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
                      <label htmlFor="cr_letter" className="form-label">Letter</label>
                      <textarea id="cr_letter" name="body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                    {contactAddress ? <p className="text-xs text-white/50">Send to: {contactAddress}</p> : null}
                    {recordState.error ? <p className="form-error">{recordState.error}</p> : null}
                    {confirming ? (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm text-white/80">
                          The letter has been copied to your clipboard. Paste it onto your headed paper and post it to
                          the complainant. Confirming records this response.
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
