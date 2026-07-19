import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950/60">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">
              Be Care <span className="text-gold-400">Compliant</span>
            </p>
            <p className="mt-1 text-xs text-white/50">
              Compliance software for UK care providers, built for CQC and CIW.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            <Link href="/#features" className="hover:text-white">Features</Link>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href="/start-trial" className="hover:text-white">Start free trial</Link>
            <Link href="/login" className="hover:text-white">Sign in</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs text-white/40">
          &copy; {new Date().getFullYear()} Be Care Compliant. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
