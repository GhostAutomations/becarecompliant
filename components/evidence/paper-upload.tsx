"use client";

/**
 * Be Care Compliant — "Done on paper? Upload it instead" (DEF-056). Admins only.
 *
 * Sits on the Complete page above the Form, as the other way of completing the same Check
 * (agreed by popup 2026-09-23). Tapped, the Form is swapped for three things: the date it was
 * done, the pages, and a button. The pages go from the browser straight into the private
 * evidence bucket (see lib/evidence/paper-actions.ts for why), then the Evidence is filed and
 * the Check moved on exactly as the Form would have.
 *
 * The rules the screen checks are the same functions the server checks (lib/evidence/paper.ts),
 * so a file the page accepts is a file the save accepts.
 */

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { finishPaperUpload, startPaperUpload } from "@/lib/evidence/paper-actions";
import {
  PAPER_ACCEPT,
  PAPER_MAX_FILES,
  PAPER_MAX_MB,
  paperDateProblem,
  paperFileProblem,
  paperFilesProblem,
} from "@/lib/evidence/paper";

export type PaperUploadProps = {
  instanceId: string;
  todayIso: string;
  /** Supervision only: the number the Complete button already knows, or the choices when
   *  it cannot know (every supervision in the cycle already done). */
  supervision: { preset: string | null; options: string[] } | null;
  /** Health Check only: which week it was has to be said. */
  healthCheck: boolean;
};

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PaperOrForm({ paper, children }: { paper: PaperUploadProps | null; children: ReactNode }) {
  const [mode, setMode] = useState<"form" | "paper">("form");
  if (!paper) return <>{children}</>;
  if (mode === "form") {
    return (
      <>
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="text-white/70">Done on paper? Upload the completed form as the evidence instead.</span>
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setMode("paper")}>
            Upload it instead
          </button>
        </div>
        {children}
      </>
    );
  }
  return <PaperUpload {...paper} onCancel={() => setMode("form")} />;
}

function PaperUpload({
  instanceId,
  todayIso,
  supervision,
  healthCheck,
  onCancel,
}: PaperUploadProps & { onCancel: () => void }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState("");
  const [supNumber, setSupNumber] = useState(supervision?.preset ?? "");
  const [week, setWeek] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added = Array.from(list);
    for (const f of added) {
      const problem = paperFileProblem({ name: f.name, size: f.size });
      if (problem) {
        setError(problem);
        return;
      }
    }
    const next = [...files, ...added];
    if (next.length > PAPER_MAX_FILES) {
      setError(`Upload up to ${PAPER_MAX_FILES} files at a time.`);
      return;
    }
    setError(null);
    setFiles(next);
    // Cleared so the same file, or the next photo, can be picked again.
    if (picker.current) picker.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem =
      paperDateProblem(date, todayIso) ??
      (supervision && !supNumber ? "Choose which supervision this was." : null) ??
      (healthCheck && !week ? "Choose which week's Health Check this was." : null) ??
      paperFilesProblem(files.map((f) => ({ name: f.name, size: f.size })));
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStatus("Preparing the upload…");
    try {
      const started = await startPaperUpload({
        instanceId,
        files: files.map((f) => ({ name: f.name, size: f.size })),
      });
      if (!started.ok) {
        setStatus(null);
        setError(started.error);
        return;
      }
      const storage = createClient().storage.from("evidence");
      for (let i = 0; i < started.uploads.length; i++) {
        const u = started.uploads[i];
        setStatus(files.length > 1 ? `Uploading page ${i + 1} of ${files.length}…` : "Uploading…");
        const { error: upErr } = await storage.uploadToSignedUrl(u.path, u.token, files[i], {
          contentType: files[i].type || undefined,
        });
        if (upErr) {
          setStatus(null);
          setError(`${files[i].name} did not upload: ${upErr.message}. Check your connection and try again.`);
          return;
        }
      }
      setStatus("Saving the evidence…");
      const done = await finishPaperUpload({
        instanceId,
        evidenceId: started.evidenceId,
        completedOn: date,
        supervisionType: supervision ? supNumber : null,
        week: healthCheck ? week : null,
        pages: started.uploads.map((u, i) => ({ fieldKey: u.fieldKey, path: u.path, name: files[i].name })),
      });
      if (!done.ok) {
        setStatus(null);
        setError(done.error);
        return;
      }
      router.replace(done.redirectTo);
    } catch (err) {
      setStatus(null);
      setError(`The upload did not finish: ${(err as Error).message}. Try again.`);
    }
  }

  const busy = status !== null;

  return (
    <form onSubmit={submit} className="glass-card space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Upload the paper copy</h2>
          <p className="mt-1 text-sm text-white/60">
            The scan or photos become the evidence for this check, dated the day it was done on
            paper. If that is earlier than the last one on file, it goes into the history and the
            next due date stays as it is.
          </p>
        </div>
        <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>
          Fill in the form instead
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="paper-date" className="form-label">Date it was completed</label>
          <input
            id="paper-date"
            type="date"
            max={todayIso}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </div>
        {/* ALWAYS ASKED for a paper supervision, starting at the one the record says is next.
            A paper upload is often history, and the history is Supervision 1 while the record
            is waiting for Supervision 2. */}
        {supervision ? (
          <div>
            <label htmlFor="paper-sup" className="form-label">Which supervision</label>
            <select id="paper-sup" value={supNumber} onChange={(e) => setSupNumber(e.target.value)} disabled={busy}>
              <option value="">Choose</option>
              {[...new Set([...supervision.options, ...(supervision.preset ? [supervision.preset] : [])])].sort().map((n) => (
                <option key={n} value={n}>Supervision {n}</option>
              ))}
            </select>
          </div>
        ) : null}
        {healthCheck ? (
          <div>
            <label htmlFor="paper-week" className="form-label">Which week</label>
            <select id="paper-week" value={week} onChange={(e) => setWeek(e.target.value)} disabled={busy}>
              <option value="">Choose</option>
              <option value="4">Week 4</option>
              <option value="8">Week 8</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="paper-files" className="form-label">The completed form</label>
        <input
          id="paper-files"
          ref={picker}
          type="file"
          multiple
          accept={PAPER_ACCEPT}
          onChange={(e) => addFiles(e.target.files)}
          disabled={busy || files.length >= PAPER_MAX_FILES}
        />
        <p className="form-hint">
          A PDF, or a photo of each page (JPG, PNG or HEIC). Up to {PAPER_MAX_FILES} files, {PAPER_MAX_MB} MB each.
          Pick again to add more pages.
        </p>
        {files.length > 0 ? (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-white/85">
                  {files.length > 1 ? `Page ${i + 1}: ` : ""}
                  {f.name}
                  <span className="ml-2 text-xs text-white/45">{sizeLabel(f.size)}</span>
                </span>
                <button
                  type="button"
                  className="btn-outline px-2.5 py-1 text-[11px]"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? status : "Upload and complete"}
        </button>
      </div>
    </form>
  );
}
