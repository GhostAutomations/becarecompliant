"use client";

/**
 * Be Care Compliant — the Subject access export button in Manage record (2026-09-24).
 *
 * Company Admins only (the page only draws it for them; the route refuses anybody else). It takes a
 * while on a long record, so it says so, stays pressed and ignores a second press (the lesson of
 * DEF-065), then starts the download from the five minute link the server hands back.
 */

import { useRef, useState } from "react";

export default function SubjectAccessExport({
  kind,
  recordId,
  recordName,
}: {
  kind: "person" | "service_user";
  recordId: string;
  recordName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const running = useRef(false);

  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/records/sar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, recordId }),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string; files?: number; missing?: string[] };
      if (!res.ok || !body.url) {
        setError(body.error || "The export could not be made. Please try again.");
        return;
      }
      window.location.assign(body.url);
      setDone(
        `Downloading: ${body.files ?? 0} files.` +
          (body.missing && body.missing.length
            ? ` ${body.missing.length} could not be read and are listed in README.txt.`
            : ""),
      );
    } catch (e) {
      setError(`The export did not finish: ${(e as Error).message}. Please try again.`);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold text-white/80">Subject access export</h3>
      <p className="mt-1 text-sm text-white/60">
        When {recordName} asks for the information held about them, this makes one ZIP of everything
        on this record: a readable PDF, a spreadsheet for each section, every completed form and every
        attached file. Read it and remove other people&apos;s details before you send it. The file is
        deleted from Be Care Compliant after a day, and each export is logged in History.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-outline text-xs" onClick={run} disabled={busy} aria-busy={busy}>
          {busy ? "Making the export…" : "Make the export"}
        </button>
        {busy ? <span className="text-xs text-white/50">This can take up to a minute on a long record.</span> : null}
        {done ? <span className="text-xs text-rag-green-soft">{done}</span> : null}
      </div>
      {error ? <p className="form-error mt-2">{error}</p> : null}
    </div>
  );
}
