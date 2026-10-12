"use client";

/**
 * Be Care Compliant: the Initial Response and the Complaint Response as signed PDF letters (Phil,
 * 2026-10-12, THE LIST 54, docs/decisions/complaint-letters.md). Laid out like the absence outcome
 * letter: the whole letter in the editor on the left, the real PDF on the right redrawn a second
 * after any change, the signature box under the words and, beside it, what sending does and the
 * buttons.
 *
 * Nothing is drafted until "Draft the letter" (the gold AI chip) is pressed; the draft is kept on
 * the complaint, so opening it again costs nothing. An email complainant: Approve and send, the
 * letter in the email with the signed PDF attached. By post: Save and print, which keeps the PDF on
 * the complaint and opens it to print. Not now closes it with nothing sent.
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  complaintLetterSetup,
  draftComplaintLetter,
  previewComplaintLetter,
  sendComplaintLetter,
} from "@/lib/complaints/letter-actions";
import { AiIcon } from "@/components/ai-icon";
import PolicyReader from "@/components/staff/policy-reader";
import SignatureChoice, { type SignatureValue } from "@/components/letters/signature-choice";
import RichLetterEditor from "@/components/letters/rich-letter-editor";
import type { LetterFrame } from "@/lib/letters/letter-frame";

type Kind = "initial" | "response";
type Attachment = { path: string; name: string };
type Drawn = { bytes: Uint8Array; url: string };

function toBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const LABEL: Record<Kind, string> = { initial: "Initial Response", response: "Complaint Response" };

/** The button on the complaint, and the letter box it opens. */
export default function ComplaintLetterButton({
  complaintId,
  kind,
  contactMethod,
  contactEmail,
  contactAddress,
  disabledReason,
  done = false,
}: {
  complaintId: string;
  kind: Kind;
  contactMethod: "email" | "post" | null;
  contactEmail: string | null;
  contactAddress: string | null;
  /** Why it cannot be used yet (the full response needs the investigation first). */
  disabledReason?: string | null;
  done?: boolean;
}) {
  const [openInstance, setOpenInstance] = useState(0);
  if (disabledReason) {
    return (
      <span title={disabledReason}>
        <button type="button" className="btn-outline px-3 py-2 text-sm opacity-50" disabled>
          {LABEL[kind]}
        </button>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={done ? "btn btn-saved px-3 py-2 text-sm" : "btn-outline px-3 py-2 text-sm"}
        onClick={() => setOpenInstance((n) => n + 1)}
      >
        {LABEL[kind]}
      </button>
      {openInstance > 0 ? (
        <ComplaintLetterDialog
          key={openInstance}
          complaintId={complaintId}
          kind={kind}
          emailTo={contactMethod === "email" && contactEmail ? contactEmail : null}
          address={contactAddress}
          onClose={() => setOpenInstance(0)}
        />
      ) : null}
    </>
  );
}

function ComplaintLetterDialog({
  complaintId,
  kind,
  emailTo,
  address,
  onClose,
}: {
  complaintId: string;
  kind: Kind;
  emailTo: string | null;
  address: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [signature, setSignature] = useState<SignatureValue>({ choice: "none", now: "" });
  const signatureKey = `${signature.choice}:${signature.now.length}`;
  const [frame, setFrame] = useState<LetterFrame | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [drawnKey, setDrawnKey] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [draftState, draftAction, drafting] = useActionState(draftComplaintLetter, IDLE_STATE);
  const [sendState, sendAction, sending] = useActionState(sendComplaintLetter, IDLE_STATE);
  const [draftPressed, setDraftPressed] = useState(false);
  const [sendingAs, setSendingAs] = useState<"email" | "print" | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const regenerating = useRef(false);
  const urlRef = useRef<string | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The kept draft and the investigation's files: free, nothing is drafted here.
  useEffect(() => {
    let live = true;
    const f = new FormData();
    f.set("complaint_id", complaintId);
    f.set("kind", kind);
    complaintLetterSetup(f).then((res) => {
      if (!live) return;
      setLoading(false);
      if (res.error) setSetupError(res.error);
      if (res.draft) setBody(res.draft);
      setAttachments(res.attachments ?? []);
    });
    return () => {
      live = false;
    };
  }, [complaintId, kind]);

  useEffect(() => {
    setDraftPressed(false);
    const drafted = draftState.data?.body;
    if (!drafted) return;
    if (regenerating.current) {
      regenerating.current = false;
      setBody(drafted);
    } else setBody((prev) => (prev.trim() ? prev : drafted));
  }, [draftState]);

  // Sent or kept: the page refreshes; a letter to print opens (or is offered if the browser held it back).
  useEffect(() => {
    if (!sendState.ok) return;
    router.refresh();
    const href = sendState.data?.href;
    if (sendingAs === "print" && href) {
      const tab = window.open(href, "_blank");
      if (!tab) {
        setBlocked(href);
        return;
      }
    }
    const t = setTimeout(() => closeRef.current(), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendState.ok]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const fd = () => {
    const f = new FormData();
    f.set("complaint_id", complaintId);
    f.set("kind", kind);
    f.set("body", body);
    f.set("signature_choice", signature.choice);
    if (signature.choice === "now" && signature.now) f.set("signature_now", signature.now);
    return f;
  };

  function draft(again: boolean) {
    regenerating.current = again;
    setDraftPressed(true);
    const f = new FormData();
    f.set("complaint_id", complaintId);
    f.set("kind", kind);
    if (again) f.set("regenerate", "1");
    startTransition(() => draftAction(f));
  }

  // The PDF beside the words: drawn a second after the words or the signature last changed.
  const key = `${body}#${signatureKey}`;
  const hasWords = body.trim() !== "";
  useEffect(() => {
    if (!hasWords) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setDrawing(true);
      const result = await previewComplaintLetter(fd());
      if (cancelled) return;
      setDrawing(false);
      if (result.pdf) {
        const bytes = toBytes(result.pdf);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfFailed(false);
        setPreviewError(null);
        setFrame(result.frame ?? null);
        setDrawn({ bytes, url });
        setDrawnKey(key);
      } else {
        setPreviewError(result.error ?? "The letter could not be drawn.");
        setDrawnKey(null);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasWords]);

  const current = hasWords && !drawing && drawnKey === key && !previewError && !pdfFailed;
  const busy = drafting || draftPressed || sending;

  function send(delivery: "email" | "print") {
    const f = fd();
    f.set("delivery", delivery);
    if (delivery === "email") f.set("attachment_paths", JSON.stringify([...ticked]));
    setSendingAs(delivery);
    startTransition(() => sendAction(f));
  }

  if (!mounted) return null;

  const draftButton = (label: string, again: boolean) => (
    <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={busy || !!sendState.ok} onClick={() => draft(again)}>
      {drafting || draftPressed ? (
        <>
          <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Drafting…
        </>
      ) : (
        <>
          <AiIcon />
          {label}
        </>
      )}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[97vh] w-full max-w-[min(95vw,1604px)] overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{LABEL[kind]}</h2>
            <p className="mt-1 text-xs text-white/50">
              The letter&apos;s words on the left, the letter as it will go on the right. Change the words and the letter
              follows a second later. Nothing is sent until you approve it.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" disabled={sending} onClick={onClose}>
            {sendState.ok ? "Close" : "Not now"}
          </button>
        </div>

        {setupError ? <p className="form-error mt-3">{setupError}</p> : null}

        {!loading && !hasWords ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/70">
                {kind === "initial"
                  ? "Draft it from the complaint's details. You can change every word before anything is sent, and the draft is kept, so opening this again costs nothing."
                  : "Draft it from the Complaint Investigation. You can change every word before anything is sent, and the draft is kept, so opening this again costs nothing."}
              </p>
              {draftButton("Draft the letter", false)}
            </div>
            {drafting || draftPressed ? (
              <p className="mt-2 animate-pulse text-sm text-white/70">Writing the letter. This takes a few seconds.</p>
            ) : null}
            {draftState.error ? <p className="form-error">{draftState.error}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="form-label mb-0">The letter</span>
              {hasWords ? (
                <span className="flex items-center gap-2">
                  {draftButton("Regenerate", true)}
                  <span className="text-[10px] text-white/40">Uses another AI credit and replaces the words.</span>
                </span>
              ) : null}
            </div>
            <div className="h-[68vh] min-h-72 overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
              <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-3 sm:px-4">
                <RichLetterEditor
                  label="The letter"
                  frame={hasWords ? frame : null}
                  value={body}
                  disabled={busy || !!sendState.ok || loading}
                  onChange={setBody}
                  placeholder={loading ? "Loading…" : "Or write it yourself."}
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] text-white/40">
              The whole letter as it will print. Type in the words between the RE line and Yours sincerely; the rest is
              set for you. Use the bar above it for headings, text size, bold, italic, underline and lists.
            </p>
            {draftState.data?.note ? <p className="mt-1 text-xs text-amber-200">{draftState.data.note}</p> : null}
            {hasWords && draftState.error ? <p className="form-error">{draftState.error}</p> : null}
          </div>

          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="form-label mb-0">The letter as a PDF</span>
              <span className="text-xs text-white/50">
                {drawing ? "Updating…" : drawn && current ? (
                  <a href={drawn.url} target="_blank" rel="noreferrer" className="underline">
                    Open full size
                  </a>
                ) : null}
              </span>
            </div>
            {drawn && hasWords ? (
              <div className="h-[68vh] min-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-navy-950/40">
                <PolicyReader
                  key={drawn.url}
                  url={drawn.url}
                  data={drawn.bytes}
                  onRendered={() => setPdfFailed(false)}
                  onFailed={() => setPdfFailed(true)}
                />
              </div>
            ) : (
              <div className="flex h-[68vh] min-h-72 w-full items-center justify-center rounded-lg border border-white/10 p-6 text-center text-sm text-white/50">
                {!hasWords ? "The letter appears here once it has words." : previewError ?? "Preparing the letter…"}
              </div>
            )}
            {drawn && previewError ? <p className="form-error mt-2">{previewError}</p> : null}
            {pdfFailed ? (
              <p className="form-error mt-2">The letter could not be shown. Change a word or close and open it again. Nothing has been sent.</p>
            ) : null}
          </div>
        </div>

        {/* Under the words, how it is signed; beside it, what sending does and the buttons, centred. */}
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <SignatureChoice
              onChange={setSignature}
              disabled={busy || !!sendState.ok}
              className="h-full rounded-xl border border-white/10 bg-white/[0.03] p-3"
            />
          </div>
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <p className="max-w-md text-xs text-white/60">
              {!current
                ? hasWords
                  ? "Updating the letter…"
                  : "Draft or write the letter, then send it here."
                : emailTo
                  ? `Approve and send emails this letter to ${emailTo} with the PDF attached, and keeps the PDF on the complaint. Once sent it cannot be changed.`
                  : `The complainant asked for post${address ? ` (${address.replace(/\s*\n\s*/g, ", ")})` : ""}. Save and print keeps the PDF on the complaint and opens it to print and post.`}
            </p>
            {emailTo && kind === "response" && attachments.length > 0 ? (
              <div className="w-full max-w-md space-y-1 text-left">
                <p className="text-xs font-medium text-white/70">Attach files from the investigation?</p>
                {attachments.map((a) => (
                  <label key={a.path} className="flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={ticked.has(a.path)}
                      disabled={busy || !!sendState.ok}
                      onChange={() =>
                        setTicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(a.path)) next.delete(a.path);
                          else next.add(a.path);
                          return next;
                        })
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            ) : null}
            {sendState.error ? <p className="form-error">{sendState.error}</p> : null}
            {sendState.ok ? <p className="text-sm text-emerald-300">{sendState.ok}</p> : null}
            {blocked ? (
              <a href={blocked} target="_blank" rel="noreferrer" className="btn-primary text-xs" onClick={() => setTimeout(onClose, 300)}>
                Open the letter to print
              </a>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {emailTo ? (
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={busy || !current || !!sendState.ok}
                  onClick={() => send("email")}
                >
                  {sending && sendingAs === "email" ? "Sending…" : "Approve and send"}
                </button>
              ) : null}
              <button
                type="button"
                className={emailTo ? "btn-outline text-xs" : "btn-primary text-xs"}
                disabled={busy || !current || !!sendState.ok}
                onClick={() => send("print")}
              >
                {sending && sendingAs === "print" ? "Saving…" : "Save and print"}
              </button>
              <button type="button" className="btn-outline text-xs" disabled={sending} onClick={onClose}>
                {sendState.ok ? "Close" : "Not now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
