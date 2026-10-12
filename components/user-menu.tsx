"use client";

/**
 * Be Care Compliant: the round profile button, top right (Phil, 2026-10-12).
 *
 * The top bar shows only a gold circle with the person's initials. Pressing it drops down a small
 * panel with their full name, job title and company, then Sign out. It replaced the name, role
 * pill and company stacked in the bar, which Phil did not like. Pressing anywhere else, Escape,
 * or moving to another page closes it.
 *
 * `role` is null for a carer's own login (no role line, Phil, 2026-07-27). `company` is the
 * company being managed in a support session, and empty for the Founder outside one.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function UserMenu({
  initials,
  name,
  role,
  company,
}: {
  initials: string;
  name: string;
  role: string | null;
  company: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Your profile: ${name}`}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gold-400/15 text-xs font-bold text-gold-400 ring-1 ring-gold-400/40 transition hover:bg-gold-400/25"
      >
        {initials}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-navy-900 p-3 shadow-2xl">
          <p className="break-words text-sm font-semibold text-white">{name}</p>
          {role ? <p className="mt-0.5 text-xs text-white/60">{role}</p> : null}
          {company ? <p className="mt-0.5 break-words text-xs text-white/60">{company}</p> : null}
          <div className="my-3 border-t border-white/10" />
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-ghost w-full justify-center px-3 py-2 text-xs">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
