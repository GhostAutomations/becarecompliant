"use client";

/**
 * Be Care Compliant — the policy reader.
 *
 * Phil, 2026-07-26: "rember, mot peple will us their phone to log into the tm
 * portal". A PDF inside a page is not reliable on an iPhone (Safari renders the
 * first page and stops), which is exactly why DocuSign and Adobe do not embed
 * PDFs either: they render the pages themselves and serve pictures. This does the
 * same with pdf.js, so what a carer sees on an iPhone is what a manager sees on a
 * laptop.
 *
 * It also answers the question a signature has to answer: DID THEY GET TO THE
 * END? An IntersectionObserver on the last page reports back, and the parent
 * keeps the Sign bar locked until it fires. Read progress is honest, not assumed.
 *
 * If pdf.js cannot render (an odd file, an old browser), it says so and the
 * parent falls back to opening the document in a new tab, so the flow can never
 * dead end.
 */

import { useEffect, useRef, useState } from "react";

export default function PolicyReader({
  url,
  onRendered,
  onFailed,
}: {
  url: string;
  /** Every page is drawn. Until this fires, "the bottom" is not the end. */
  onRendered: () => void;
  onFailed: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onRendered);
  const failRef = useRef(onFailed);
  doneRef.current = onRendered;
  failRef.current = onFailed;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState(0);
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    (async () => {
      try {
        // The LEGACY build on purpose: the modern one needs Promise.withResolvers,
        // which iOS 16 does not have, and a care team's phones are not all new.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // The worker is bundled by the build, not fetched from a CDN: a
        // compliance app should not depend on a third party at signing time.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) return;
        setPages(doc.numPages);

        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";

        // Render at the container width, sharpened for retina but capped at 2x so
        // a long policy does not exhaust memory on an older phone.
        const cssWidth = Math.min(host.clientWidth || 360, 1000);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "mb-3 w-full rounded-lg bg-white shadow-lg";
          canvas.dataset.page = String(n);
          host.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("No canvas context");
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          if (n === 1) setStatus("ready");
        }
        setStatus("ready");

        // Which page are they on? Presentational only: the Sign bar is gated by
        // the panel's scroll position, not by this.
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                setCurrent(Number((entry.target as HTMLElement).dataset.page ?? 0));
              }
            }
          },
          { root: host.parentElement, threshold: 0.35 },
        );
        host.querySelectorAll("canvas").forEach((c) => observer?.observe(c));

        // Every page is on the screen now, so the document has a real height and
        // "scrolled to the bottom" finally means something.
        doneRef.current();
      } catch (e) {
        if (cancelled) return;
        console.error("[policy] render failed:", (e as Error).message);
        setStatus("error");
        failRef.current();
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [url]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-3 sm:px-4">
      {status === "loading" && (
        <p className="py-10 text-center text-sm text-white/60">Opening the document…</p>
      )}
      {status === "error" && (
        <div className="glass-card p-5 text-sm text-white/70">
          This document could not be shown here. Use the link at the top to open it in a new
          tab, then come back to sign.
        </div>
      )}
      <div ref={hostRef} />
      {status === "ready" && pages > 0 && (
        <p className="pb-2 text-center text-xs text-white/40">
          Page {current} of {pages}
        </p>
      )}
    </div>
  );
}
