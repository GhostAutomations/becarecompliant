"use client";

/**
 * Be Care Compliant — the register "Columns" panel (Item 6). Company Admins pick which custom
 * checks appear as columns, drag to reorder them, and choose WHAT each column says: the check's
 * next due date, or the latest answer to one question on its form. Company-wide: the saved
 * order, visibility and contents apply to everyone. The curated checks named in
 * CURATED_CHECK_KEYS already have their own fixed columns and are not listed here.
 *
 * One place to think about columns: which ones, what order, what they say, while looking at the
 * register they change.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRegisterColumns } from "@/lib/register/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  MAX_REGISTER_COLUMNS,
  shownColumnCount,
  type RegisterCheckColumn,
} from "@/lib/register/custom-columns";

export default function ColumnsPanel({
  population,
  columns,
}: {
  population: "people" | "service_users";
  columns: RegisterCheckColumn[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RegisterCheckColumn[]>(columns);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, flash, resetFlash] = useSavedFlash();
  const dragIndex = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  // A ref as well as state, so discard() can read it without being recreated on every save.
  const pendingRef = useRef(false);

  /*
   * Take the server list, but NEVER over an Admin who is mid edit.
   *
   * Both registers mount RealtimeRefresh, which re-renders on a ten second poll and on every
   * check anybody in the company completes. Each of those hands down a fresh array, so syncing
   * unconditionally would throw away a half finished reorder every ten seconds and the Admin
   * would conclude the panel does not work. Their own save clears the flag, so the list they get
   * back after saving is the one that lands.
   */
  useEffect(() => {
    if (dirty.current) return;
    setItems(columns);
  }, [columns]);

  function edited() {
    dirty.current = true;
    resetFlash();
    setError(null);
  }

  /*
   * Closing without saving DISCARDS. Without this the dirty flag has no exit: an Admin who ticks
   * two columns, thinks better of it and closes the panel would keep those ticks in front of them
   * all day, never see a colleague's changes, and could reopen hours later and save a stale list
   * back over reality. A register is a screen people leave open.
   */
  const discard = useCallback(() => {
    // Never mid save. Closing while the action is in flight would drop the result into a panel
    // that is no longer on screen, so a failure would be swallowed and the Admin would believe it
    // landed. Same guard the planned review cell uses.
    if (pendingRef.current) return;
    dirty.current = false;
    setItems(columns);
    setError(null);
    setOpen(false);
  }, [columns]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) discard();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") discard();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, discard]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    edited();
  }

  const shown = shownColumnCount(items);
  const atCap = shown >= MAX_REGISTER_COLUMNS;

  function toggle(id: string) {
    const target = items.find((c) => c.id === id);
    // Refused HERE as well as on the server, so the Admin is told before they press Save
    // rather than after. The server is still the one that decides.
    if (target && !target.show && atCap) {
      setError(
        `You can show up to ${MAX_REGISTER_COLUMNS} extra columns. Hide one before adding another.`,
      );
      return;
    }
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, show: !c.show } : c)));
    edited();
  }

  function setDisplay(id: string, key: string) {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, displayFieldKey: key === "" ? null : key } : c)),
    );
    edited();
  }

  async function save() {
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const res = await saveRegisterColumns({
      population,
      columns: items.map((c) => ({ id: c.id, show: c.show, displayFieldKey: c.displayFieldKey })),
    });
    pendingRef.current = false;
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Only now may the server list win again.
    dirty.current = false;
    flash();
    router.refresh();
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        className="btn-outline text-sm"
        onClick={() => (open ? discard() : setOpen(true))}
      >
        Columns{items.length ? ` (${shown}/${items.length})` : ""}
        <span aria-hidden className="ml-2 opacity-60">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-2xl border border-white/15 bg-navy-900 p-4 shadow-2xl">
          <p className="mb-1 text-sm font-semibold text-white">Custom check columns</p>
          <p className="mb-3 text-xs text-white/50">
            Show or hide checks, drag to reorder, and choose what each column says. Up to{" "}
            {MAX_REGISTER_COLUMNS} can be shown at once. The core columns are always shown.
          </p>

          {items.length === 0 ? (
            <p className="rounded-xl bg-white/5 p-3 text-xs text-white/60">
              No custom checks yet. Create a check type in Settings and it appears here.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
              {items.map((c, i) => (
                <li
                  key={c.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex.current != null) move(dragIndex.current, i);
                    dragIndex.current = null;
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white/85"
                >
                  <div className="flex items-center gap-2">
                    <span
                      draggable
                      onDragStart={() => (dragIndex.current = i)}
                      onDragEnd={() => (dragIndex.current = null)}
                      className="cursor-grab select-none text-white/40"
                      aria-hidden
                    >
                      ⠿
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                      aria-pressed={c.show}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                          c.show ? "bg-gold-400 text-navy-900" : "border border-white/30 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className={`truncate ${c.show ? "" : "text-white/50"}`}>{c.name}</span>
                    </button>
                    <div className="flex items-center">
                      <button
                        type="button"
                        className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        aria-label={`Move ${c.name} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                        onClick={() => move(i, i + 1)}
                        disabled={i === items.length - 1}
                        aria-label={`Move ${c.name} down`}
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  {c.show ? (
                    <div className="mt-1.5 pl-6">
                      <label htmlFor={`col-shows-${c.id}`} className="sr-only">
                        What the {c.name} column shows
                      </label>
                      <select
                        id={`col-shows-${c.id}`}
                        value={c.displayFieldKey ?? ""}
                        onChange={(e) => setDisplay(c.id, e.target.value)}
                        className="w-full text-xs"
                      >
                        <option value="">Shows: when it is next due</option>
                        {c.choices.map((ch) => (
                          <option key={ch.key} value={ch.key}>
                            Shows: {ch.label}
                          </option>
                        ))}
                      </select>
                      {c.choices.length === 0 ? (
                        <p className="mt-1 text-[11px] text-white/40">
                          This check has no date or choice questions to show, so it shows when it
                          is next due.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="form-error mt-2 text-xs">{error}</p> : null}

          {items.length > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className={`${saved ? "btn-saved" : "btn-primary"} text-sm`}
              >
                {pending ? "Saving…" : saved ? "Saved" : "Save columns"}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={pending}
                className="btn-ghost px-3 py-2 text-sm text-white/60"
              >
                Cancel
              </button>
              <span className="text-xs text-white/40">
                The colour always comes from the check.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
