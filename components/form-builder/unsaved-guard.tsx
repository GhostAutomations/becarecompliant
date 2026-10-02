"use client";

/**
 * Asks before the form builder is left with unsaved changes (Phil, 2 Oct 2026, popup "Warn before
 * leaving"). An AI import of the Birdie audit sat unsaved in the builder, the page was left, and
 * fifty two questions went without a word. Covers a link inside the app (Back, the menu, Send to
 * companies) with our own dialog, and a refresh, closing the tab or typing an address with the
 * browser's own question, which is the only thing a browser allows there.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export default function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    function onClick(e: MouseEvent) {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (!target) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl"
      >
        <h2 id="unsaved-title" className="text-base font-semibold text-white">
          You have unsaved changes
        </h2>
        <p className="mt-2 text-sm text-white/70">
          If you leave now, the changes to this form are lost. Stay and press Save first, or leave without saving.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => setTarget(null)}>
            Stay on this form
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm text-red-300"
            onClick={() => {
              leaving.current = true;
              const to = target;
              setTarget(null);
              router.push(to);
            }}
          >
            Leave without saving
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
