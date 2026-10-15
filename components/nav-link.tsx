"use client";

/**
 * Be Care Compliant: a sidebar link that fetches its page when you point at it (Phil, 2026-10-15,
 * popup "A and B now"; docs/decisions/speed-plan.md).
 *
 * Before, every sidebar link on screen was fetched in the background as soon as any page opened:
 * about twenty requests at once, each running the sign-in checks, competing with the page actually
 * clicked. Now nothing is fetched just for being on screen. Resting the pointer on a link for a
 * moment (or focusing it with the keyboard, or touching it) fetches that whole page, so the click
 * usually lands on a page that is already on its way. A quick sweep of the pointer down the
 * sidebar fetches nothing.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

const HOVER_MS = 120;

export default function NavLink({
  href,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTouchStart,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchPage = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(fetchPage, HOVER_MS);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        fetchPage();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        fetchPage();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
