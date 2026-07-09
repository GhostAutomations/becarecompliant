import Link from "next/link";

/** A clear Back link for sub-pages. Placed at the top, above the title. */
export default function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition hover:text-white"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}
