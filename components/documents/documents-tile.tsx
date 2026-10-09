"use client";

/**
 * Be Care Compliant — the Documents tile on a People or Service User record (0439, Phil
 * 2026-10-09: somewhere to keep "a copy of an email or a random copy of a certificate", in a tile
 * next to Updates with "a button saying upload" in its top right corner and the number of
 * documents).
 *
 * THE TILE matches the Updates tile beside it: the number of documents, the newest two (click one
 * to download it), Upload in the corner for anybody who may add documents, and View all, which
 * lists every document in the middle of the screen with its note, who added it and when.
 *
 * WHO MAY DO WHAT is decided by the database (0439): the people who read and write the record's
 * Updates read and upload documents, and a Company Admin removes one, with a reason. A removed
 * document leaves a line saying who removed it, when and why. This only offers what the database
 * will allow.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CentreDialog } from "@/components/panel-dialog";
import { openDocument, removeDocument, saveDocuments, startDocumentUpload } from "@/lib/documents/actions";
import {
  CERT_ACCEPT,
  DOC_ACCEPT,
  DOC_MAX_FILES,
  DOC_MAX_MB,
  DOC_NOTE_MAX,
  DOC_TITLE_MAX,
  docFileProblem,
  docFilesProblem,
  docMimeType,
  docSizeLabel,
  docTitleFromFileName,
  docTitleProblem,
  bookingAfterCertificate,
  certFilesProblem,
} from "@/lib/documents/rules";
import { deriveRenewalDate } from "@/lib/training/renewal";
import { saveTraining } from "@/lib/training/actions";
import { updateStamp } from "@/lib/updates/rules";
import type { CertificateCourse, DocumentKind, RecordDocument, RecordDocuments } from "@/lib/documents/types";

function toast(message: string) {
  window.dispatchEvent(new CustomEvent("bcc:toast", { detail: { message } }));
}

/* The link is made with the file's own name as a download, so following it saves the file and
   leaves the page where it is. A link click rather than a new window: a phone's browser blocks a
   window opened after a wait, and would do so without a word. */
function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchAndDownload(documentId: string): Promise<string | null> {
  try {
    const res = await openDocument({ documentId });
    if (!res.ok) return res.error;
    download(res.url);
    return null;
  } catch (e) {
    return `The document could not be opened: ${(e as Error).message}. Try again.`;
  }
}

export default function DocumentsTile({
  kind,
  recordId,
  data,
  canRemove,
  courses = [],
}: {
  kind: DocumentKind;
  recordId: string;
  data: RecordDocuments;
  /** Company Admins only; the database refuses anybody else. */
  canRemove: boolean;
  /** People only: training courses a certificate can be uploaded for (lib/documents/courses.ts). */
  courses?: CertificateCourse[];
}) {
  const [listOpen, setListOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeList = useCallback(() => setListOpen(false), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);

  const live = data.documents.filter((d) => !d.removedAt);
  const newest = live.slice(0, 2);

  async function open(id: string) {
    setError(null);
    setError(await fetchAndDownload(id));
  }

  return (
    /* h-full: the height of its row, like the Updates tile beside it. */
    <div className="glass-card h-full p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">Documents</h2>
        {data.canUpload && !data.loadError ? (
          <button type="button" className="btn-outline btn-tracker" onClick={() => setUploadOpen(true)} aria-haspopup="dialog">
            Upload
          </button>
        ) : null}
      </div>

      {data.loadError ? (
        <p className="form-error">{data.loadError}</p>
      ) : (
        <>
          <p className="text-2xl font-semibold text-white/85">{data.count}</p>
          {newest.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {newest.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 truncate text-left text-sm text-white/75 hover:text-white"
                    onClick={() => open(d.id)}
                    title={`Download ${d.title}`}
                  >
                    {d.title}
                  </button>
                  <span className="shrink-0 text-[12px] text-white/45">{updateStamp(d.createdAt).slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-white/55">
              {data.documents.length > 0
                ? "No documents on the record now."
                : data.canUpload
                  ? "No documents yet. Upload a copy of an email, a certificate or a letter."
                  : "No documents yet."}
            </p>
          )}
          {data.documents.length > 0 ? (
            <button
              type="button"
              className="mt-2 text-[12px] text-white/60 hover:text-white"
              onClick={() => setListOpen(true)}
              aria-haspopup="dialog"
            >
              View all
            </button>
          ) : null}
        </>
      )}
      {error ? <p className="form-error mt-2">{error}</p> : null}

      <CentreDialog
        open={listOpen}
        onClose={closeList}
        label={`Documents${data.count > 0 ? ` (${data.count})` : ""}`}
        footer={
          data.canUpload ? (
            <div className="flex justify-end px-5 py-3">
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => {
                  setListOpen(false);
                  setUploadOpen(true);
                }}
              >
                Upload
              </button>
            </div>
          ) : undefined
        }
      >
        {data.documents.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-white/55">No documents yet.</p>
        ) : (
          <ol className="divide-y divide-white/5">
            {data.documents.map((d) => (
              <li key={d.id} className="px-5 py-4">
                <DocumentRow d={d} canRemove={canRemove} />
              </li>
            ))}
          </ol>
        )}
      </CentreDialog>

      {data.canUpload ? <UploadDialog kind={kind} recordId={recordId} courses={kind === "person" ? courses : []} open={uploadOpen} onClose={closeUpload} /> : null}
    </div>
  );
}

function DocumentRow({ d, canRemove }: { d: RecordDocument; canRemove: boolean }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Shown the moment the removal is saved: the page takes a few seconds to redraw, and until then
     the row must not still offer Download and Remove for a document that has gone. */
  const [gone, setGone] = useState<{ at: string; reason: string } | null>(null);
  const removedAt = d.removedAt ?? gone?.at ?? null;
  const removedBy = d.removedByName ?? (gone ? "you" : null);
  const removedReason = d.removedReason ?? gone?.reason ?? null;
  const removed = !!removedAt;

  async function open() {
    setError(null);
    setError(await fetchAndDownload(d.id));
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await removeDocument({ documentId: d.id, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGone({ at: new Date().toISOString(), reason: reason.trim() });
      setRemoving(false);
      setReason("");
      toast("Document removed.");
      router.refresh();
    } catch (e) {
      setError(`That did not save: ${(e as Error).message}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`break-words text-sm font-semibold ${removed ? "text-white/50" : "text-white"}`}>{d.title}</p>
          <p className="break-words text-[12px] text-white/45">
            Added {updateStamp(d.createdAt)} by {d.uploadedByName}
            {removed ? "" : ` · ${d.fileName} · ${docSizeLabel(d.bytes)}`}
          </p>
        </div>
        {!removed ? (
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" className="btn-outline px-2.5 py-1 text-[11px]" onClick={open}>
              Download
            </button>
            {canRemove && !removing ? (
              <button type="button" className="text-[12px] text-rag-red hover:text-white" onClick={() => setRemoving(true)}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {removed ? (
        <p className="mt-1 text-sm italic text-white/45">
          Removed by {removedBy ?? "an Admin"}
          {removedAt ? ` on ${updateStamp(removedAt)}` : ""}. Reason: {removedReason}
        </p>
      ) : d.note ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/75">{d.note}</p>
      ) : null}

      {removing && !removed ? (
        <div className="mt-2 space-y-2">
          <label className="form-label" htmlFor={`remove-doc-${d.id}`}>
            Why is this document being removed?
          </label>
          <input
            id={`remove-doc-${d.id}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
          <p className="form-hint">
            The file is deleted. A line saying who removed it, when and why stays here. A copy already saved to your
            company&apos;s cloud drive stays there, so delete it there as well if it should go.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-danger text-xs"
              disabled={busy || reason.trim().length < 3}
              onClick={remove}
            >
              {busy ? "Removing…" : "Remove it"}
            </button>
            <button
              type="button"
              className="btn-outline text-xs"
              disabled={busy}
              onClick={() => {
                setRemoving(false);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error mt-2">{error}</p> : null}
    </div>
  );
}

type Picked = { key: string; file: File; title: string };

function londonTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function ukDate(iso: string | null): string {
  return iso ? iso.split("-").reverse().join("/") : "";
}

/** Where the course stands now, so the person can see what the certificate will change. */
function courseNow(c: CertificateCourse): string {
  if (!c.completedOn && !c.expiryOn) return c.bookedFor ? `Not recorded yet. Booked for ${ukDate(c.bookedFor)}.` : "Not recorded yet.";
  const done = c.completedOn ? `Completed ${ukDate(c.completedOn)}` : "Completed";
  return c.expiryOn ? `${done}, renews ${ukDate(c.expiryOn)}.` : `${done}.`;
}

function UploadDialog({
  kind,
  recordId,
  courses,
  open,
  onClose,
}: {
  kind: DocumentKind;
  recordId: string;
  /** People only, for those who may record this person's training; empty otherwise. */
  courses: CertificateCourse[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState("");
  /* "" is an ad hoc document; otherwise the training course the certificate is for (Phil,
     2026-10-09). A certificate goes onto the course by the Training register's own save, with
     the date completed, so training compliance moves with it. */
  const [courseId, setCourseId] = useState("");
  const [completedOn, setCompletedOn] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Files already sent by an attempt whose save then failed. Trying again saves those rather than
     sending them a second time, and the database saves an upload once however often it is asked,
     so a save that worked but whose answer was lost cannot make two copies. Cleared whenever the
     chosen files change. */
  const [sent, setSent] = useState<{ batchId: string; paths: string[] } | null>(null);
  const busy = status !== null;
  const course = courses.find((c) => c.id === courseId) ?? null;
  const today = londonTodayIso();
  const renews = course && completedOn ? deriveRenewalDate(completedOn, course.renewalMonths) : null;

  // Not while an upload is under way: closing would hide it without stopping it.
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  function choosePurpose(next: string) {
    // The two kinds of upload take different files, so a change starts the choice again.
    setCourseId(next);
    setPicked([]);
    setSent(null);
    setError(null);
    if (picker.current) picker.current.value = "";
  }

  function addFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (course) {
      const one = incoming.slice(0, 1);
      const p = certFilesProblem(one.map((f) => ({ name: f.name, size: f.size })));
      if (p) setError(p);
      else {
        setError(null);
        seq.current += 1;
        setPicked([{ key: `doc-${seq.current}`, file: one[0], title: course.name }]);
      }
      if (picker.current) picker.current.value = "";
      return;
    }
    const problems: string[] = [];
    const next = [...picked];
    for (const f of incoming) {
      const p = docFileProblem({ name: f.name, size: f.size });
      if (p) {
        problems.push(p);
        continue;
      }
      if (next.length >= DOC_MAX_FILES) {
        problems.push(`Upload up to ${DOC_MAX_FILES} files at a time.`);
        break;
      }
      seq.current += 1;
      next.push({ key: `doc-${seq.current}`, file: f, title: docTitleFromFileName(f.name) });
    }
    if (next.length !== picked.length) {
      setPicked(next);
      setSent(null);
    }
    setError(problems.length ? problems.slice(0, 3).join(" ") : null);
    if (picker.current) picker.current.value = "";
  }

  function takeOff(key: string) {
    setPicked((p) => p.filter((x) => x.key !== key));
    setSent(null);
    setError(null);
  }

  function rename(key: string, title: string) {
    setPicked((p) => p.map((x) => (x.key === key ? { ...x, title } : x)));
  }

  function reset() {
    setPicked([]);
    setNote("");
    setCourseId("");
    setCompletedOn("");
    setSent(null);
    setError(null);
  }

  /** A certificate onto a training course, through the Training register's own save. */
  async function saveCertificate(c: CertificateCourse) {
    const problem =
      certFilesProblem(picked.map((p) => ({ name: p.file.name, size: p.file.size }))) ??
      (!completedOn ? "Enter the date the training was completed." : completedOn > today ? "The date completed cannot be in the future." : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStatus("Saving the certificate…");
    try {
      const f = picked[0].file;
      const fd = new FormData();
      fd.set("person_id", recordId);
      fd.set("course_id", c.id);
      fd.set("intent", "save");
      fd.set("completed_on", completedOn);
      // Blank: the renewal date is worked out from the course, exactly as the register does it.
      fd.set("expiry_on", "");
      fd.set("booked_for", bookingAfterCertificate(c.bookedFor, completedOn) ?? "");
      fd.set("certificate", f.type ? f : new File([f], f.name, { type: docMimeType(f.name) }));
      const res = await saveTraining({}, fd);
      if (res.error) {
        setStatus(null);
        setError(res.error);
        return;
      }
      reset();
      setStatus(null);
      onClose();
      toast(`Certificate saved to ${c.name}.`);
      router.refresh();
    } catch (err) {
      setStatus(null);
      setError(`The certificate did not save: ${(err as Error).message}. Try again.`);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (course) {
      await saveCertificate(course);
      return;
    }
    const files = picked.map((p) => ({ name: p.file.name, size: p.file.size }));
    const problem =
      docFilesProblem(files) ??
      picked.map((p) => docTitleProblem(p.title)).find((x): x is string => !!x) ??
      (note.trim().length > DOC_NOTE_MAX ? `A note can be up to ${DOC_NOTE_MAX} characters.` : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      let batch = sent;
      if (!batch) {
        setStatus("Preparing the upload…");
        const started = await startDocumentUpload({ kind, recordId, files });
        if (!started.ok) {
          setStatus(null);
          setError(started.error);
          return;
        }
        const storage = createClient().storage.from("record-documents");
        for (let i = 0; i < started.uploads.length; i++) {
          const u = started.uploads[i];
          const f = picked[i].file;
          setStatus(picked.length > 1 ? `Uploading file ${i + 1} of ${picked.length}…` : "Uploading…");
          // A saved email often arrives with no type at all: give it the one its name says.
          const body = f.type ? f : new File([f], f.name, { type: docMimeType(f.name) });
          const { error: upErr } = await storage.uploadToSignedUrl(u.path, u.token, body, {
            contentType: body.type || undefined,
          });
          if (upErr) {
            setStatus(null);
            setError(`${f.name} did not upload: ${upErr.message}. Check your connection and try again.`);
            return;
          }
        }
        batch = { batchId: started.batchId, paths: started.uploads.map((u) => u.path) };
        setSent(batch);
      }
      setStatus("Saving…");
      const paths = batch.paths;
      const done = await saveDocuments({
        kind,
        recordId,
        batchId: batch.batchId,
        note,
        files: picked.map((p, i) => ({ path: paths[i], name: p.file.name, title: p.title.trim() })),
      });
      if (!done.ok) {
        setStatus(null);
        if (done.restart) setSent(null);
        setError(done.error);
        return;
      }
      const n = done.saved;
      reset();
      setStatus(null);
      onClose();
      toast(n === 1 ? "Document uploaded." : `${n} documents uploaded.`);
      router.refresh();
    } catch (err) {
      setStatus(null);
      setError(`The upload did not finish: ${(err as Error).message}. Try again.`);
    }
  }

  return (
    <CentreDialog
      open={open}
      onClose={close}
      label={course ? `Upload a certificate: ${course.name}` : "Upload documents"}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
          {status ? <span className="mr-auto text-xs text-white/55">{status}</span> : null}
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button type="submit" form="record-document-upload" className="btn-primary text-xs" disabled={busy || picked.length === 0}>
            {course ? "Save certificate" : picked.length > 1 ? `Upload ${picked.length} documents` : "Upload"}
          </button>
        </div>
      }
    >
      <form id="record-document-upload" onSubmit={submit} className="space-y-4 px-5 py-4">
        {courses.length > 0 ? (
          <div>
            <label htmlFor="record-document-purpose" className="form-label">
              What is this for?
            </label>
            <select
              id="record-document-purpose"
              value={courseId}
              onChange={(e) => choosePurpose(e.target.value)}
              disabled={busy}
            >
              <option value="">An ad hoc document</option>
              <optgroup label="A certificate for a training course">
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {course ? (
              <p className="form-hint mt-1">
                {courseNow(course)} The certificate is saved on the course in Training
                {course.hasCertificate ? ", in place of the one already there" : ""}.
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <input
            ref={picker}
            id="record-document-files"
            type="file"
            multiple={!course}
            accept={course ? CERT_ACCEPT : DOC_ACCEPT}
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
            disabled={busy}
          />
          <label htmlFor="record-document-files" className="btn-outline inline-flex cursor-pointer px-3 py-1.5 text-xs">
            {course ? (picked.length > 0 ? "Choose a different file" : "Choose the certificate") : picked.length > 0 ? "Choose more files" : "Choose files"}
          </label>
          <p className="form-hint mt-2">
            {course
              ? "One file: a PDF, a Word file or a photo, under 4 MB."
              : `A photo, a PDF, a Word or Excel file, or a saved email. Up to ${DOC_MAX_FILES} files at a time, ${DOC_MAX_MB} MB each.`}
          </p>
        </div>

        {picked.length > 0 ? (
          <ul className="space-y-3">
            {picked.map((p) => (
              <li key={p.key} className="rounded-xl border border-white/10 p-3">
                {course ? (
                  <div className="flex items-start justify-between gap-2">
                    <p className="form-hint break-words">
                      {p.file.name} · {docSizeLabel(p.file.size)}
                    </p>
                    <button
                      type="button"
                      aria-label={`Take off ${p.file.name}`}
                      className="text-[12px] text-white/50 hover:text-white"
                      disabled={busy}
                      onClick={() => takeOff(p.key)}
                    >
                      Take off
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <label htmlFor={`${p.key}-title`} className="form-label">
                        Name
                      </label>
                      <button
                        type="button"
                        aria-label={`Take off ${p.file.name}`}
                        className="text-[12px] text-white/50 hover:text-white"
                        disabled={busy}
                        onClick={() => takeOff(p.key)}
                      >
                        Take off
                      </button>
                    </div>
                    <input
                      id={`${p.key}-title`}
                      type="text"
                      value={p.title}
                      onChange={(e) => rename(p.key, e.target.value)}
                      maxLength={DOC_TITLE_MAX}
                      disabled={busy}
                    />
                    <p className="form-hint mt-1 break-words">
                      {p.file.name} · {docSizeLabel(p.file.size)}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {course ? (
          <div>
            <label htmlFor="record-document-completed" className="form-label">
              Date completed
            </label>
            <input
              id="record-document-completed"
              type="date"
              value={completedOn}
              max={today}
              onChange={(e) => setCompletedOn(e.target.value)}
              disabled={busy}
            />
            <p className="form-hint">
              {course.renewalMonths == null
                ? "A one off course: it does not renew."
                : renews
                  ? `Renews on ${ukDate(renews)}, worked out from the course.`
                  : `Renews ${course.renewalMonths} ${course.renewalMonths === 1 ? "month" : "months"} after the date completed.`}
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="record-document-note" className="form-label">
              Note (optional)
            </label>
            <textarea
              id="record-document-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={DOC_NOTE_MAX}
              disabled={busy}
              placeholder="For example: emailed by the council on 3 October."
            />
            <p className="form-hint">Saved with every file in this upload.</p>
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </CentreDialog>
  );
}
