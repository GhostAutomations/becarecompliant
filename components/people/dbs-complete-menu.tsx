"use client";

/**
 * Be Care Compliant — the DBS card's Complete button (Phil, 2026-10-05).
 *
 * The card had to stay the size of Right to Work beside it, and three buttons do not fit a card
 * that is 150px wide on a narrow screen. So it is ONE Complete button, the same as every other
 * card's, and tapping it offers the three DBS forms. The list is drawn on the page itself
 * (a portal, fixed to the button) so the cards next to it can never paint over it.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function DbsCompleteMenu({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function place() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 256;
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
    { href: `/people/${personId}/tracker/dbs_renewal/complete`, label: "DBS", hint: "Date of issue and certificate" },
    { href: `/people/${personId}/tracker/dbs_pending/complete`, label: "Pending risk assessment", hint: "Starting before the certificate" },
    { href: `/people/${personId}/tracker/dbs_disclosure/complete`, label: "Disclosure risk assessment", hint: "Something shows on the certificate" },
  ];

  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn-primary btn-tile text-[13px]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Complete
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label="Complete a DBS form"
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
    </>
  );
}
