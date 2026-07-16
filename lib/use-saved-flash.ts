"use client";

/**
 * Be Care Compliant — shared "Saved" flash for every save button.
 *
 * Standing rule: a save button shows "Saving…" on press, a brief green "Saved"
 * flash on success (~2s), then reverts to its normal label. It must NEVER stay a
 * stuck green box. Route bespoke buttons through this hook so they all behave the
 * same as the shared ActionForm.
 *
 *   const [saved, flash, reset] = useSavedFlash();
 *   // on success: flash();  on edit: reset();
 *   className={saved ? "btn-saved" : "btn-primary"}
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useSavedFlash(ms = 2000): [boolean, () => void, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flash = useCallback(() => {
    setSaved(true);
    clear();
    timer.current = setTimeout(() => setSaved(false), ms);
  }, [ms, clear]);

  const reset = useCallback(() => {
    clear();
    setSaved(false);
  }, [clear]);

  // Clear any pending timer on unmount.
  useEffect(() => clear, [clear]);

  return [saved, flash, reset];
}
