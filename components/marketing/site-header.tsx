import Link from "next/link";

/** Public marketing header. `authed` swaps the Sign in link for a Dashboard link. */
export default function SiteHeader({ authed = false }: { authed?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <Link href="/" className="text-sm font-bold text-white">
          Be Care <span className="text-gold-400">Compliant</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-white/75 sm:flex">
          <Link href="/#features" className="hover:text-white">Features</Link>
          <Link href="/#how" className="hover:text-white">How it works</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
        </nav>
        <div className="flex items-center gap-3">
          {authed ? (
            <Link href="/dashboard" className="text-sm text-white/80 hover:text-white">Dashboard</Link>
          ) : (
            <Link href="/login" className="text-sm text-white/80 hover:text-white">Sign in</Link>
          )}
          <Link href="/start-trial" className="btn-primary text-sm">Start free trial</Link>
        </div>
      </div>
    </header>
  );
}
