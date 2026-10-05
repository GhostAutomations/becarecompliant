"use client";

/**
 * Be Care Compliant — the DBS card's buttons (Phil, 2026-10-05, popups).
 *
 * [Complete] [Risk ▾] side by side, both the height of Complete. Complete opens the DBS form
 * straight away, as Right to Work's does; Risk drops down the two risk assessments. The card
 * stays the size of Right to Work beside it, so on a very narrow card the word "Risk" gives way
 * and only the arrow shows. The dropdown is drawn on the page itself (a portal, fixed to the
 * button) so the cards next to it can never paint over it.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function DbsCardButtons({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function place() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 248;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 8, left });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || button.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const shut = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  const choices = [
    { href: `/people/${personId}/tracker/dbs_pending/complete`, label: "Pending risk assessment", hint: "Starting before the certificate" },
    { href: `/people/${personId}/tracker/dbs_disclosure/complete`, label: "Disclosure risk assessment", hint: "Something shows on the certificate" },
  ];

  return (
    <div className="@container mt-3">
      <div className="flex justify-center gap-1.5">
        <Link
          href={`/people/${personId}/tracker/dbs_renewal/complete`}
          className="btn-primary shrink-0 text-[13px] sm:px-5 @max-[10.5rem]:px-2.5"
        >
          Complete
        </Link>
        <button
          ref={button}
          type="button"
          className="btn-outline shrink-0 px-3 text-[13px] @max-[10.5rem]:px-2.5"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Risk assessments"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="@max-[10.5rem]:hidden">Risk</span>
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && pos
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label="DBS risk assessments"
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 256 }}
              className="z-50 rounded-xl border border-white/10 bg-navy-900/95 p-2 shadow-xl backdrop-blur"
            >
              {choices.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  role="menuitem"
                  className="block rounded-lg px-3 py-2 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                  onClick={() => setOpen(false)}
                >
                  <span className="block text-sm font-semibold text-white">{c.label}</span>
                  <span className="block text-xs text-white/55">{c.hint}</span>
                </Link>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
