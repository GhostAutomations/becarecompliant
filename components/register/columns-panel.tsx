"use client";

/**
 * Be Care Compliant — the register "Columns" panel (Item 4). Company Admins pick
 * which custom checks appear as columns and drag to reorder them. Company-wide: the
 * saved order/visibility applies to everyone. Curated columns (Supervision, DBS,
 * Care Plan Review, etc.) are fixed and not listed here. Opened from a button on the
 * register; changes save through saveRegisterColumns and the matrix refreshes.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRegisterColumns } from "@/lib/register/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { RegisterCheckColumn } from "@/lib/register/custom-columns";

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

  // Keep local state in sync if the server list changes (after a save + refresh).
  useEffect(() => setItems(columns), [columns]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    resetFlash();
  }

  function toggle(id: string) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, show: !c.show } : c)));
    resetFlash();
  }

  async function save() {
    setPending(true);
    setError(null);
    const res = await saveRegisterColumns({
      population,
      columns: items.map((c) => ({ id: c.id, show: c.show })),
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    flash();
    router.refresh();
  }

  const shownCount = items.filter((c) => c.show).length;

  return (
    <div ref={panelRef} className="relative">
      <button type="button" className="btn-outline text-sm" onClick={() => setOpen((v) => !v)}>
        Columns{items.length ? ` (${shownCount}/${items.length})` : ""}
        <span aria-hidden className="ml-2 opacity-60">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-white/15 bg-navy-900 p-4 shadow-2xl">
          <p className="mb-1 text-sm font-semibold text-white">Custom check columns</p>
          <p className="mb-3 text-xs text-white/50">
            Show or hide checks and drag to reorder. The core columns are always shown.
          </p>

          {items.length === 0 ? (
            <p className="rounded-xl bg-white/5 p-3 text-xs text-white/60">
              No custom checks yet. Create a check type in Settings and it appears here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((c, i) => (
                <li
                  key={c.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex.current != null) move(dragIndex.current, i);
                    dragIndex.current = null;
                  }}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white/85"
                >
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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
