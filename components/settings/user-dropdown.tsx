"use client";

/**
 * Be Care Compliant — a real dropdown of people.
 *
 * Phil, 2026-07-26, after two wrong attempts: "the names should be within it,
 * not tiles under it". So this is the same pattern as the Additional branch
 * views menu: a field-styled button that opens a FLOATING PANEL, and the names
 * live inside that panel. Nothing is laid out down the page.
 *
 * Picking a name closes the menu and opens that person's popup.
 */

import { useEffect, useRef, useState } from "react";
import UserPopup, { type BranchOption, type UserListItem } from "@/components/settings/user-popup";

export default function UserDropdown({
  title,
  subtitle,
  users,
  branches,
  emptyText,
}: {
  title: string;
  subtitle: string;
  users: UserListItem[];
  branches: BranchOption[];
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UserListItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative sm:max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={subtitle}
        className="flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-left text-sm text-white shadow-sm backdrop-blur"
      >
        <span>
          {title} ({users.length})
        </span>
        <span aria-hidden className={`ml-2 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 flex max-h-80 w-full flex-col overflow-auto rounded-xl border border-white/15 bg-navy-900 p-1.5 shadow-2xl">
          {users.length === 0 ? (
            <span className="px-2 py-2 text-xs text-white/50">{emptyText}</span>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelected(u);
                  setOpen(false);
                }}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">
                    {u.fullName || u.email}
                    {u.isSelf ? <span className="text-white/40"> (you)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-white/45">{u.email}</span>
                </span>
                {u.status !== "active" ? (
                  <span className="shrink-0 text-xs text-rag-red-soft">{u.status}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      {selected ? (
        <UserPopup user={selected} branches={branches} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
