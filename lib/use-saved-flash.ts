"use client";

/**
 * Be Care Compliant — shared "Saved" state for every save button.
 *
 * Standing rule (Phil, 2026-07-21): a save button shows "Saving…" on press, then
 * on success turns GREEN and reads Saved/Sent and STAYS that way until the section
 * is edited again, at which point it reverts. It is a persistent confirmation, not
 * a brief flash. Route bespoke buttons through this hook so they match ActionForm.
 *
 *   const [saved, flash, reset] = useSavedFlash();
 *   // on success: flash();  on edit: reset();
 *   className={saved ? "btn-saved" : "btn-primary"}
 *
 * The `ms` argument is retained for call-site compatibility but is ignored: the
 * saved state no longer auto-clears, it clears only on reset().
 */

import { useCallback, useState } from "react";

export function useSavedFlash(_ms = 2000): [boolean, () => void, () => void] {
  const [saved, setSaved] = useState(false);
  const flash = useCallback(() => setSaved(true), []);
  const reset = useCallback(() => setSaved(false), []);
  return [saved, flash, reset];
}
