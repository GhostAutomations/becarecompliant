"use client";

/**
 * Be Care Compliant — send a memo, a message or attachments (0435, Phil 2026-10-08).
 *
 *   Memo       : a title and the memo itself. Kept as a PDF on the company letterhead.
 *   Message    : a short note. No PDF.
 *   Attachment : a title, a short note, and up to three files.
 * Any of them can carry files: PDF, Word, Excel or pictures, up to three.
 *
 * Then the same three questions as a policy: who is it for, what must they do (just read it,
 * read and press "I have read this", or sign it), and an optional due date, which is chased like
 * a policy. Files go straight to the private bucket through one-off upload links, so a big Word
 * document never hits the Server Action size limit.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AudiencePicker from "@/components/briefings/audience-picker";
import { htmlToNoticeText, plainToNoticeText } from "@/components/briefings/paste-format";
import { sendNotice, startNoticeUpload } from "@/lib/briefings/notice-actions";
import type { BriefingPerson, BriefingScope } from "@/lib/assignments/types";
import type { MemoSender } from "@/lib/briefings/senders";
import {
  NOTICE_ACCEPT,
  NOTICE_BODY_MAX,
  NOTICE_MAX_FILES,
  NOTICE_MAX_MB,
  NOTICE_RESPONSE_LABELS,
  fileSizeLabel,
  noticeFilesProblem,
  noticeProblem,
  type NoticeKind,
  type NoticeResponse,
} from "@/lib/briefings/notice-rules";

const KIND_OPTIONS: Array<{ value: NoticeKind; label: string; hint: string }> = [
  { value: "memo", label: "Memo", hint: "Longer writing, kept as a PDF on your letterhead" },
  { value: "message", label: "Message", hint: "A short note to the team" },
  { value: "attachment", label: "Attachment", hint: "Files to read, with a short note" },
];

const RESPONSE_OPTIONS: Array<{ value: NoticeResponse; hint: string }> = [
  { value: "read", hint: "Done as soon as they open it" },
  { value: "confirm", hint: "They open it and press a button" },
  { value: "sign", hint: "They sign it, kept on their record" },
];

function card(active: boolean): string {
  return `rounded-xl border p-3 text-left transition ${
    active ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"
  }`;
}

export default function NoticePanel({
  people,
  senders,
  onClose,
}: {
  people: BriefingPerson[];
  /** The office team, for "From" when sending on someone's behalf (0436). */
  senders: MemoSender[];
  onClose: () => void;
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<NoticeKind>("memo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [response, setResponse] = useState<NoticeResponse>("confirm");
  const [dueDate, setDueDate] = useState("");
  const [copyOffice, setCopyOffice] = useState(false);
  // "" = from me. An office team member's id, or "other" to type a name and title.
  const [fromId, setFromId] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromRole, setFromRole] = useState("");
  const [scope, setScope] = useState<BriefingScope>("company");
  const [branchId, setBranchId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const busy = status !== null;

  // Any change starts a new briefing: the last one's "Sent" or error no longer applies.
  function touch() {
    setDone(null);
    setError(null);
  }

  const max = NOTICE_BODY_MAX[kind];
  const bodyLabel =
    kind === "memo" ? "The memo *" : kind === "message" ? "Your message *" : "A short note (optional)";

  function addFiles(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])];
    touch();
    const problem = noticeFilesProblem(next.map((f) => ({ name: f.name, size: f.size })));
    if (problem) setFileError(problem);
    else {
      setFileError(null);
      setFiles(next);
    }
    if (picker.current) picker.current.value = "";
  }

  /** Keep bullets, numbers, headings and bold when pasting from Word, Docs or an email. */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    let text: string;
    try {
      text = html ? htmlToNoticeText(html) : plainToNoticeText(plain);
    } catch {
      return; // Let the browser paste it as it normally would.
    }
    if (!text) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + text + body.slice(end)).slice(0, NOTICE_BODY_MAX[kind]);
    touch();
    setBody(next);
    requestAnimationFrame(() => {
      const pos = Math.min(next.length, start + text.length);
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  /** Draw the memo exactly as it will be sent, in a new tab. Nothing is saved or sent. */
  async function preview() {
    if (previewing || busy) return;
    if (!title.trim() || !body.trim()) {
      setError("Write the title and the memo first, then preview it.");
      return;
    }
    setError(null);
    // Opened straight away, inside the click, so the browser does not block it as a popup.
    const tab = window.open("", "_blank");
    setPreviewing(true);
    try {
      const res = await fetch("/api/briefings/notices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, fileNames: files.map((f) => f.name), fromProfileId: fromId, fromName, fromRole }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        tab?.close();
        setError(j?.error ?? "The preview could not be drawn. Try again.");
        return;
      }
      if (!tab) {
        // Never navigate this page away: that would lose what they have written.
        setError("Your browser blocked the preview tab. Allow pop ups for this site and press Preview PDF again.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError(`The preview could not be drawn: ${(err as Error).message}`);
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const filesProblem = noticeFilesProblem(files.map((f) => ({ name: f.name, size: f.size })));
    if (filesProblem) {
      setFileError(filesProblem);
      return;
    }
    const problem = noticeProblem({ kind, title, body, fileCount: files.length });
    if (problem) {
      // "Attach at least one file" belongs beside the files, everything else by the button.
      if (kind === "attachment" && files.length === 0 && /Attach at least one/.test(problem)) setFileError(problem);
      else setError(problem);
      return;
    }
    setFileError(null);
    if (fromId === "other" && !fromName.trim()) {
      setError("Type who it is from, or choose them from the list.");
      return;
    }
    if (scope === "branch" && !branchId) {
      setError("Choose who it is for.");
      return;
    }
    if (scope === "people" && picked.length === 0) {
      setError("Choose at least one person.");
      return;
    }
    setError(null);
    setDone(null);
    setStatus(files.length ? "Preparing the upload…" : "Sending…");
    try {
      const started = await startNoticeUpload({ files: files.map((f) => ({ name: f.name, size: f.size })) });
      if (!started.ok) {
        setStatus(null);
        setError(started.error);
        return;
      }
      if (started.uploads.length) {
        const storage = createClient().storage.from("evidence");
        for (let i = 0; i < started.uploads.length; i++) {
          const u = started.uploads[i];
          setStatus(files.length > 1 ? `Uploading file ${i + 1} of ${files.length}…` : "Uploading…");
          const { error: upErr } = await storage.uploadToSignedUrl(u.path, u.token, files[i], {
            contentType: files[i].type || undefined,
          });
          if (upErr) {
            setStatus(null);
            setError(`${files[i].name} did not upload: ${upErr.message}. Check your connection and try again.`);
            return;
          }
        }
      }
      setStatus("Sending…");
      const result = await sendNotice({
        noticeId: started.noticeId,
        kind,
        title,
        body,
        response,
        dueDate: dueDate || null,
        scope,
        branchId: scope === "branch" ? branchId : null,
        personIds: scope === "people" ? picked : [],
        files: started.uploads.map((u, i) => ({ path: u.path, name: files[i].name })),
        copyOffice,
        fromProfileId: fromId || null,
        fromName: fromId === "other" ? fromName : null,
        fromRole: fromId === "other" ? fromRole : null,
      });
      setStatus(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(result.ok);
      setTitle("");
      setBody("");
      setFiles([]);
      setPicked([]);
      setDueDate("");
      setCopyOffice(false);
      router.refresh();
    } catch (err) {
      setStatus(null);
      setError(`It did not send: ${(err as Error).message}. Try again.`);
    }
  }

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Send a memo or message</h2>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="form-label">What is it? *</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={kind === o.value}
                onClick={() => {
                  touch();
                  setKind(o.value);
                }}
                className={card(kind === o.value)}
              >
                <span className="block text-sm font-semibold text-white">{o.label}</span>
                <span className="block text-xs text-white/50">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="notice-from" className="form-label">
              From
            </label>
            <select
              id="notice-from"
              value={fromId}
              onChange={(e) => {
                touch();
                setFromId(e.target.value);
              }}
            >
              <option value="">Me</option>
              {senders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ? `${p.name}, ${p.title}` : p.name}
                </option>
              ))}
              <option value="other">Someone else…</option>
            </select>
            <p className="form-hint">
              Sending it on someone&apos;s behalf? Choose them. It shows as from them, and you are still
              recorded as the one who sent it.
            </p>
          </div>
          {fromId === "other" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="notice-from-name" className="form-label">
                  Their name *
                </label>
                <input
                  id="notice-from-name"
                  value={fromName}
                  maxLength={120}
                  onChange={(e) => {
                    touch();
                    setFromName(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="notice-from-role" className="form-label">
                  Their job title
                </label>
                <input
                  id="notice-from-role"
                  value={fromRole}
                  maxLength={120}
                  onChange={(e) => {
                    touch();
                    setFromRole(e.target.value);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="notice-title" className="form-label">
            Title *
          </label>
          <input
            id="notice-title"
            value={title}
            maxLength={200}
            onChange={(e) => {
              touch();
              setTitle(e.target.value);
            }}
            placeholder={kind === "memo" ? "For example, Changes to the on call rota" : "For example, Bank holiday cover"}
          />
        </div>

        <div>
          <label htmlFor="notice-body" className="form-label">
            {bodyLabel}
          </label>
          <textarea
            id="notice-body"
            value={body}
            rows={kind === "memo" ? 10 : 4}
            maxLength={max}
            onPaste={onPaste}
            onChange={(e) => {
              touch();
              setBody(e.target.value);
            }}
            placeholder={
              kind === "memo"
                ? "Write the memo here. Leave a blank line between paragraphs."
                : kind === "message"
                  ? "Write your message here."
                  : "Tell them what the files are and what you need them to do."
            }
          />
          <p className="form-hint">
            Paste from Word, Google Docs or an email and bullets, numbered points, headings and bold
            are kept. You can also type - for a bullet, 1. for a number, # for a heading and
            **bold**.
          </p>
          <p className="form-hint">
            {body.length} of {max} characters.
            {kind === "memo"
              ? " It is kept as a PDF on your letterhead, so they can download it. Press Preview PDF to see it before you send."
              : ""}
          </p>
        </div>

        <div>
          <span className="form-label">{kind === "attachment" ? "Files *" : "Files (optional)"}</span>
          {files.length > 0 ? (
            <ul className="mb-2 space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
                >
                  <span className="min-w-0 truncate">
                    {f.name} <span className="text-xs text-white/40">{fileSizeLabel(f.size)}</span>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => {
                      touch();
                      setFileError(null);
                      setFiles(files.filter((_, j) => j !== i));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {files.length < NOTICE_MAX_FILES ? (
            <>
              <input
                ref={picker}
                id="notice-files"
                type="file"
                multiple
                accept={NOTICE_ACCEPT}
                className="sr-only"
                onChange={(e) => addFiles(e.target.files)}
              />
              <label htmlFor="notice-files" className="btn-outline inline-flex cursor-pointer px-3 py-2 text-xs">
                {files.length === 0 ? "Attach files" : "Attach another"}
              </label>
            </>
          ) : null}
          {fileError ? <p className="form-error">{fileError}</p> : null}
          <p className="form-hint">
            PDF, Word, Excel or pictures. Up to {NOTICE_MAX_FILES} files, {NOTICE_MAX_MB} MB each.
          </p>
        </div>

        <div>
          <span className="form-label">What must they do? *</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {RESPONSE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={response === o.value}
                onClick={() => {
                  touch();
                  setResponse(o.value);
                }}
                className={card(response === o.value)}
              >
                <span className="block text-sm font-semibold text-white">{NOTICE_RESPONSE_LABELS[o.value]}</span>
                <span className="block text-xs text-white/50">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sm:max-w-xs">
          <label htmlFor="notice-due" className="form-label">
            Due by (optional)
          </label>
          <input id="notice-due" type="date" value={dueDate} onChange={(e) => {
              touch();
              setDueDate(e.target.value);
            }} />
          <p className="form-hint">With a date, anyone who has not done it by then is reminded.</p>
        </div>

        <AudiencePicker
          people={people}
          scope={scope}
          setScope={(v) => {
            touch();
            setScope(v);
          }}
          branchId={branchId}
          setBranchId={(v) => {
            touch();
            setBranchId(v);
          }}
          picked={picked}
          setPicked={(v) => {
            touch();
            setPicked(v);
          }}
          idPrefix="notice"
          skipNote={false}
        />

        <label className="flex items-start gap-2 text-sm text-white/85">
          <input
            type="checkbox"
            checked={copyOffice}
            onChange={(e) => {
              touch();
              setCopyOffice(e.target.checked);
            }}
          />
          <span>
            Also email the office team a copy
            <span className="block text-xs text-white/50">
              Admins, the Registered Manager, the RI, Managers and Supervisors get it for information,
              with the words in the email. They are not chased or counted.
            </span>
          </span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}
        {done ? (
          <p role="status" className="text-sm text-emerald-300">
            {done}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={busy}>
            {status ?? "Send"}
          </button>
          {kind === "memo" ? (
            <button
              type="button"
              className="btn-outline px-4 py-2 text-sm"
              onClick={preview}
              disabled={busy || previewing}
            >
              {previewing ? "Drawing the PDF…" : "Preview PDF"}
            </button>
          ) : null}
          {done ? (
            <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
