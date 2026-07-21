"use client";

/**
 * Be Care Compliant — the shared "Saved" success message.
 *
 * Standing rule (Phil): a save confirmation is a BRIEF flash that then VANISHES.
 * It must never be a persistent green rectangle sitting on the screen. Bespoke
 * forms that show a separate success line (rather than flashing their button)
 * must route it through here so the green auto-clears after ~2s, every time.
 *
 * Pass `token` (usually the whole ActionState object) so the flash re-triggers on
 * every save, even when the message text is identical to the last one.
 */

import { useEffect, useRef, useState } from "react";

export default function SavedFlashMessage({
  message,
  token,
  className = "text-xs text-emerald-300",
  ms = 2000,
}: {
  message?: string | null;
  /** Any value that changes each save (e.g. the ActionState object). */
  token?: unknown;
  className?: string;
  ms?: number;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    setShown(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // token makes an identical repeat message flash again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, token, ms]);

  if (!shown) return null;
  return <span className={className}>{shown}</span>;
}
