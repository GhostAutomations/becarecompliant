import Link from "next/link";

// The app's own not found page. Without this file an unknown address renders Next.js's
// bare black 404, which looks like an outage on a product an inspector may be sitting
// in front of. Branded, and it offers the two sensible places to go.
export default function NotFound() {
  return (
    <div className="app-bg flex min-h-dvh items-center justify-center px-6">
      <div className="glass-card w-full max-w-md px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-400">404</p>
        <h1 className="page-title mt-2">Page not found</h1>
        <p className="page-subtitle mt-2">
          That page does not exist, or it may have moved. Check the address, or head back
          to somewhere familiar.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className="btn-primary">Go to your dashboard</Link>
          <Link href="/" className="btn-outline">Back to the website</Link>
        </div>
      </div>
    </div>
  );
}
