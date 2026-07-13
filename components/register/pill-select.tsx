"use client";

/**
 * Be Care Compliant — shared inline pill dropdown for the registers (People and
 * Service Users). The cell shows the current value as a coloured pill; clicking
 * opens a menu (rendered in a portal so the table's scroll area does not clip it)
 * of coloured pill options; choosing one saves inline via the given Server Action.
 * Generic over the record: pass recordId + recordField ("person_id" or
 * "service_user_id") so one component drives both registers.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

export type Tone = "green" | "amber" | "red" | "neutral";

export function toneClass(t: Tone): string {
  return t === "green"
    ? "pill-green"
    : t === "amber"
      ? "pill-amber"
      : t === "red"
        ? "pill-red"
        : "pill-neutral";
}

export function PillSelect({
  recordId,
  recordField,
  field,
  value,
  options,
  action,
  toneOf,
  moveToast,
}: {
  recordId: string;
  /** The form field name for the record id, e.g. "person_id" or "service_user_id". */
  recordField: string;
  field: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  toneOf: (value: string | null) => Tone;
  /** Optional per-value toast (e.g. "Moved to Cancelled") shown when chosen. */
  moveToast?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) setOptimistic(null);
  }, [pending]);

  const shown = optimistic ?? value ?? "";
  const currentLabel = options.find((o) => o.value === shown)?.label ?? "—";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  }

  function choose(v: string) {
    setOpen(false);
    if (v === (value ?? "")) return;
    setOptimistic(v);
    if (moveToast?.[v]) {
      window.dispatchEvent(new CustomEvent("bcc:toast", { detail: { message: moveToast[v] } }));
    }
    const fd = new FormData();
    fd.set(recordField, recordId);
    fd.set(field, v);
    startTransition(async () => {
      const res = await action(IDLE_STATE, fd);
      // Surface a refused inline save (e.g. an RLS no-op) rather than silently
      // reverting: dispatch the error to the toast host and drop the optimistic value.
      if (res && res.error) {
        window.dispatchEvent(new CustomEvent("bcc:toast", { detail: { message: res.error } }));
        setOptimistic(null);
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={pending}
        onClick={toggle}
        className={`${toneClass(toneOf(shown))} cursor-pointer ${pending ? "opacity-60" : ""}`}
      >
        {currentLabel}
        <span aria-hidden className="ml-1 opacity-60">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 140) }}
            className="z-50 flex flex-col items-start gap-1 rounded-xl border border-white/15 bg-navy-900 p-2 shadow-2xl"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                className={`${toneClass(toneOf(o.value))} cursor-pointer`}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
