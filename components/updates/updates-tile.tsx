"use client";

/**
 * Be Care Compliant — the Updates tile on a People or Service User record, and the thread it
 * opens (0324, Phil 2026-09-24: "a bit like the update section on Monday").
 *
 * THE TILE is small, the size of the Complaints tile beside it: how many updates there are, and
 * the pinned one (or else the newest) cut to two lines with who wrote it and when. "Open" puts the
 * whole thread in the middle of the screen, the same popup Evidence history uses.
 *
 * THE THREAD reads like every timeline in the product: the pinned update first, then OLDEST AT
 * THE TOP and newest at the bottom, scrolled to the newest when it opens, with the Write box held
 * at the foot so it never scrolls away. Replies sit under their update.
 *
 * WHAT EACH PERSON CAN DO is decided by the database; this only offers what it will allow:
 * Write, Reply and Pin to anybody who can post, Edit to the author on their own words, Remove to
 * a Company Admin, with a reason. A Viewer reads.
 *
 * An email link to the record ends ?updates=open, which opens the thread straight away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CentreDialog } from "@/components/panel-dialog";
import { editUpdate, openUpdateFile, pinUpdate, postUpdate, removeUpdate, startUpdateUpload } from "@/lib/updates/actions";
import {
  UPDATE_ACCEPT,
  UPDATE_MAX_CHARS,
  mentionQuery,
  previewText,
  sizeLabel,
  splitMentions,
  updateFilesProblem,
  updatePostProblem,
  updateStamp,
} from "@/lib/updates/rules";
import type { RecordUpdate, RecordUpdates } from "@/lib/updates/types";

type Kind = "person" | "service_user";

export default function UpdatesTile({
  kind,
  recordId,
  data,
  currentUserId,
  canRemove,
}: {
  kind: Kind;
  recordId: string;
  data: RecordUpdates;
  currentUserId: string;
  /** Company Admins only; the database refuses anybody else. */
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("updates") === "open") setOpen(true);
    } catch {
      // No window: nothing to open.
    }
  }, []);

  const tile = data.tile;
  const label = `Updates${data.count > 0 ? ` (${data.count})` : ""}`;

  return (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white">Updates</h2>
        <button type="button" className="btn-outline btn-tracker" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Open
        </button>
      </div>
      <p className="text-2xl font-semibold text-white/85">{data.count}</p>
      {tile ? (
        <div className="mt-1 space-y-1">
          <p className="text-[12px] text-white/45">
            {tile.pinnedAt ? <span className="pill-amber mr-2 align-middle text-[10px]">Pinned</span> : null}
            {tile.authorName} · {updateStamp(tile.createdAt)}
          </p>
          <p className="line-clamp-2 text-sm text-white/70">
            {tile.body ? previewText(tile.body) : tile.files.length > 0 ? `${tile.files.length} ${tile.files.length === 1 ? "file" : "files"} attached` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-white/55">
          {data.canPost ? "No updates yet. Open to write the first one." : "No updates yet."}
        </p>
      )}

      <CentreDialog
        open={open}
        onClose={close}
        label={label}
        footer={
          data.canPost ? (
            <Composer kind={kind} recordId={recordId} mentionables={data.mentionables} parentId={null} onPosted={() => scrollToEnd()} />
          ) : (
            <p className="px-5 py-3 text-xs text-white/50">You can read the updates on this record but not write them.</p>
          )
        }
      >
        <Thread
          data={data}
          kind={kind}
          recordId={recordId}
          currentUserId={currentUserId}
          canRemove={canRemove}
          open={open}
        />
      </CentreDialog>
    </div>
  );
}

function scrollToEnd() {
  requestAnimationFrame(() => {
    const el = document.querySelector("[data-dialog-scroll]");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function Thread({
  data,
  kind,
  recordId,
  currentUserId,
  canRemove,
  open,
}: {
  data: RecordUpdates;
  kind: Kind;
  recordId: string;
  currentUserId: string;
  canRemove: boolean;
  open: boolean;
}) {
  // Newest at the bottom, so open at the bottom (the standing timeline rule).
  useEffect(() => {
    if (open) scrollToEnd();
  }, [open, data.count]);

  if (data.threads.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-white/55">
        {data.canPost
          ? "No updates yet. Write the first one below: a phone call, a visit, anything the team should know."
          : "No updates yet."}
      </div>
    );
  }

  return (
    <ol className="divide-y divide-white/5">
      {data.threads.map((t) => (
        <li key={t.update.id} className="px-5 py-4">
          <UpdateView
            u={t.update}
            kind={kind}
            recordId={recordId}
            currentUserId={currentUserId}
            canPost={data.canPost}
            canRemove={canRemove}
            mentionables={data.mentionables}
            isReply={false}
          />
          {t.replies.length > 0 ? (
            <ol className="mt-3 space-y-3 border-l border-white/10 pl-4">
              {t.replies.map((r) => (
                <li key={r.id}>
                  <UpdateView
                    u={r}
                    kind={kind}
                    recordId={recordId}
                    currentUserId={currentUserId}
                    canPost={data.canPost}
                    canRemove={canRemove}
                    mentionables={data.mentionables}
                    isReply
                  />
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function UpdateView({
  u,
  kind,
  recordId,
  currentUserId,
  canPost,
  canRemove,
  mentionables,
  isReply,
}: {
  u: RecordUpdate;
  kind: Kind;
  recordId: string;
  currentUserId: string;
  canPost: boolean;
  canRemove: boolean;
  mentionables: Array<{ id: string; name: string }>;
  isReply: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"read" | "edit" | "reply" | "remove">("read");
  const [draft, setDraft] = useState(u.body);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removed = !!u.removedAt;
  const mine = u.authorId === currentUserId;

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMode("read");
      router.refresh();
    } catch (e) {
      setError(`That did not save: ${(e as Error).message}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(fileId: string) {
    setError(null);
    const res = await openUpdateFile({ fileId });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener");
  }

  return (
    <div className={isReply ? "text-[13px]" : ""}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-white">{u.authorName}</span>
        <span className="text-[12px] text-white/45">{updateStamp(u.createdAt)}</span>
        {u.editedAt && !removed ? <span className="text-[11px] text-white/40">Edited</span> : null}
        {u.pinnedAt && !removed ? <span className="pill-amber text-[10px]">Pinned</span> : null}
      </div>

      {removed ? (
        <p className="mt-1 text-sm italic text-white/45">
          This update was removed by an Admin{u.removedReason ? `. Reason: ${u.removedReason}` : ""}.
        </p>
      ) : mode === "edit" ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={UPDATE_MAX_CHARS}
            aria-label="Edit the update"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={busy}
              onClick={() => run(() => editUpdate({ updateId: u.id, body: draft }))}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-outline text-xs" disabled={busy} onClick={() => { setDraft(u.body); setMode("read"); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : u.body ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/80">
          {splitMentions(u.body, u.mentions).map((part, i) =>
            part.mention ? (
              <span key={i} className="font-semibold text-gold-300">
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
      ) : null}

      {!removed && u.files.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {u.files.map((f) => (
            <li key={f.id}>
              <button type="button" className="btn-outline px-2.5 py-1 text-[11px]" onClick={() => openFile(f.id)}>
                {f.fileName} <span className="text-white/45">{sizeLabel(f.bytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!removed && mode === "read" ? (
        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
          {canPost && !isReply ? (
            <button type="button" className="text-white/60 hover:text-white" onClick={() => setMode("reply")}>
              Reply
            </button>
          ) : null}
          {canPost && mine ? (
            <button type="button" className="text-white/60 hover:text-white" onClick={() => { setDraft(u.body); setMode("edit"); }}>
              Edit
            </button>
          ) : null}
          {canPost && !isReply ? (
            <button
              type="button"
              className="text-white/60 hover:text-white"
              disabled={busy}
              onClick={() => run(() => pinUpdate({ updateId: u.id, pin: !u.pinnedAt }))}
            >
              {u.pinnedAt ? "Unpin" : "Pin"}
            </button>
          ) : null}
          {canRemove ? (
            <button type="button" className="text-rag-red hover:text-white" onClick={() => setMode("remove")}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "remove" ? (
        <div className="mt-2 space-y-2">
          <label className="form-label" htmlFor={`remove-${u.id}`}>
            Why is this update being removed?
          </label>
          <input id={`remove-${u.id}`} type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <p className="form-hint">A line saying it was removed, and why, stays in its place. The wording is kept for Admins.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-danger text-xs"
              disabled={busy || reason.trim().length < 3}
              onClick={() => run(() => removeUpdate({ updateId: u.id, reason }))}
            >
              {busy ? "Removing…" : "Remove it"}
            </button>
            <button type="button" className="btn-outline text-xs" disabled={busy} onClick={() => setMode("read")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "reply" ? (
        <div className="mt-3 rounded-xl border border-white/10">
          <Composer
            kind={kind}
            recordId={recordId}
            mentionables={mentionables}
            parentId={u.id}
            onPosted={() => setMode("read")}
            onCancel={() => setMode("read")}
          />
        </div>
      ) : null}

      {error ? <p className="form-error mt-2">{error}</p> : null}
    </div>
  );
}

function Composer({
  kind,
  recordId,
  mentionables,
  parentId,
  onPosted,
  onCancel,
}: {
  kind: Kind;
  recordId: string;
  mentionables: Array<{ id: string; name: string }>;
  parentId: string | null;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.query.toLowerCase();
    return mentionables.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, mentionables]);

  function onType(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    setQuery(mentionables.length ? mentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length) : null);
  }

  function choose(m: { id: string; name: string }) {
    if (!query) return;
    const caret = box.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, query.start)}@${m.name} ${body.slice(caret)}`;
    setBody(next);
    setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + m.name.length + 2;
      box.current?.focus();
      box.current?.setSelectionRange(pos, pos);
    });
  }

  function addFiles(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])];
    const problem = updateFilesProblem(next.map((f) => ({ name: f.name, size: f.size })));
    if (problem) setError(problem);
    else {
      setError(null);
      setFiles(next);
    }
    if (picker.current) picker.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem =
      updatePostProblem(body, files.length) ?? updateFilesProblem(files.map((f) => ({ name: f.name, size: f.size })));
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStatus(files.length ? "Preparing the upload…" : "Posting…");
    try {
      const started = await startUpdateUpload({ kind, recordId, files: files.map((f) => ({ name: f.name, size: f.size })) });
      if (!started.ok) {
        setStatus(null);
        setError(started.error);
        return;
      }
      if (started.uploads.length) {
        const storage = createClient().storage.from("record-updates");
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
      setStatus("Posting…");
      const done = await postUpdate({
        kind,
        recordId,
        updateId: started.updateId,
        parentId,
        body,
        mentions: picked,
        files: started.uploads.map((u, i) => ({ path: u.path, name: files[i].name })),
      });
      if (!done.ok) {
        setStatus(null);
        setError(done.error);
        return;
      }
      setBody("");
      setFiles([]);
      setPicked([]);
      setStatus(null);
      router.refresh();
      onPosted();
    } catch (err) {
      setStatus(null);
      setError(`The update did not post: ${(err as Error).message}. Try again.`);
    }
  }

  return (
    <form onSubmit={submit} className="relative space-y-2 px-5 py-3">
      <label htmlFor={`update-body-${parentId ?? "new"}`} className="sr-only">
        {parentId ? "Write a reply" : "Write an update"}
      </label>
      <textarea
        id={`update-body-${parentId ?? "new"}`}
        ref={box}
        value={body}
        onChange={onType}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            setQuery(null);
          }
        }}
        rows={parentId ? 2 : 3}
        maxLength={UPDATE_MAX_CHARS}
        placeholder={parentId ? "Write a reply. Type @ to mention a colleague." : "Write an update. Type @ to mention a colleague."}
        disabled={busy}
      />
      {query && matches.length > 0 ? (
        <ul role="listbox" className="glass-card absolute bottom-full left-5 z-10 mb-1 max-h-48 w-64 overflow-y-auto py-1">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="block w-full px-3 py-1.5 text-left text-sm text-white/85 hover:bg-white/10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="pill-neutral flex items-center gap-2 text-[11px]">
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <span className="text-white/45">{sizeLabel(f.size)}</span>
              <button
                type="button"
                aria-label={`Take off ${f.name}`}
                className="text-white/50 hover:text-white"
                disabled={busy}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <input
            ref={picker}
            id={`update-files-${parentId ?? "new"}`}
            type="file"
            multiple
            accept={UPDATE_ACCEPT}
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
            disabled={busy}
          />
          <label htmlFor={`update-files-${parentId ?? "new"}`} className="btn-outline cursor-pointer px-3 py-1.5 text-xs">
            Attach files
          </label>
        </div>
        <div className="flex items-center gap-2">
          {status ? <span className="text-xs text-white/55">{status}</span> : null}
          {onCancel ? (
            <button type="button" className="btn-outline text-xs" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className="btn-primary text-xs" disabled={busy}>
            {parentId ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
