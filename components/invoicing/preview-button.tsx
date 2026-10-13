"use client";

/**
 * PREVIEW (Phil, 2026-10-13, all companies): opens the draft invoice's PDF in a NEW tab, never the
 * page you are on.
 *
 * The tab is opened at once, inside the click and before anything is awaited, so Chrome, Edge and
 * Safari (and phones) treat it as the user's own click and never block it. It says "Preparing your
 * preview" until the PDF arrives. On the Edit page, `prepare` saves any unsaved changes first with
 * the existing save; if that save is refused the tab closes and the page shows its usual error,
 * with everything typed kept.
 */

import { useState } from "react";

function openPreviewTab(): Window | null {
  const w = window.open("", "_blank");
  if (!w) return null;
  try {
    w.document.write(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preparing your preview</title></head>' +
        '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1530;color:#e2e8f0;font:16px system-ui,sans-serif">' +
        "Preparing your preview…</body></html>",
    );
    w.document.close();
  } catch {
    // The message is a courtesy; the PDF still loads without it.
  }
  return w;
}

export default function InvoicePreviewButton({
  invoiceId,
  prepare,
  className = "btn-outline text-xs",
}: {
  invoiceId: string;
  /** Save anything unsaved first. Resolves false when the save was refused. */
  prepare?: () => Promise<boolean>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    const w = openPreviewTab();
    if (!w) {
      setError("Your browser stopped the preview tab opening. Allow pop ups for this site, then press Preview again.");
      return;
    }
    if (prepare) {
      setBusy(true);
      let ok = false;
      try {
        ok = await prepare();
      } finally {
        setBusy(false);
      }
      if (!ok) {
        w.close();
        return;
      }
    }
    try {
      w.opener = null;
    } catch {
      // Not every browser lets this be set; nothing depends on it.
    }
    w.location.replace(`/api/invoicing/${invoiceId}/preview`);
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={busy} className={className}>
        {busy ? "Preparing…" : "Preview"}
      </button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </>
  );
}
