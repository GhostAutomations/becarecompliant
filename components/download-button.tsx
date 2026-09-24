"use client";

/**
 * Be Care Compliant — a download that takes a while, said out loud.
 *
 * DEF-065 (Phil, 2026-09-24): "I pressed inspection pack and it actually takes fifteen to twenty
 * seconds to download something. So I ended up pressing it two or three times and now I have had
 * multiple downloads." The pack was a plain link, and a plain link gives no sign anything is
 * happening while the server writes the AI narrative and draws the PDF, so a second and third
 * press looked like the right thing to do.
 *
 * This fetches the file itself, so the button can say what is happening, stays pressed until the
 * file arrives, ignores further presses, and says so if the server refuses. The file name is the
 * one the server gave it.
 */

import { useRef, useState } from "react";
import { fileNameFromDisposition } from "@/lib/export/download-name";

export default function DownloadButton({
  href,
  label,
  busyLabel,
  busyNote,
  fallbackName,
  className = "btn-primary text-sm",
}: {
  href: string;
  label: string;
  /** What the button says while the file is being made, e.g. "Preparing the pack…". */
  busyLabel: string;
  /** One line under the button while it works, e.g. "This takes about 20 seconds." */
  busyNote?: string;
  fallbackName: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  async function download() {
    if (running.current) return; // a second press while it works does nothing
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).trim();
        setError(text || "The file could not be made. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFromDisposition(res.headers.get("Content-Disposition"), fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("The file could not be downloaded. Check your connection and try again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        className={`${className} disabled:cursor-wait disabled:opacity-70`}
      >
        {busy ? busyLabel : label}
      </button>
      {busy && busyNote ? <p className="text-xs text-white/60">{busyNote}</p> : null}
      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-rag-red-soft">
          {error}
        </p>
      ) : null}
    </div>
  );
}
