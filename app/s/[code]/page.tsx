import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveSmsLink } from "@/lib/sms/links";

/**
 * PUBLIC redirect for the short links in texts: becarecompliant.com/s/<code> (0486, Phil
 * 2026-10-15; in middleware PUBLIC_PATHS for this path only). It only redirects. The page it opens
 * keeps its own sign in and its own rules exactly as before, so the code alone opens nothing. An
 * unknown or expired code says so, plainly, and gives nothing away.
 */

export const metadata: Metadata = { title: "Link" };
export const dynamic = "force-dynamic";

export default async function SmsLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveSmsLink(code.toLowerCase());
  if (target) redirect(target);

  return (
    <main className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 p-4">
      <div className="mx-auto w-full max-w-md py-12">
        <p className="text-sm font-bold text-white">
          Be Care <span className="text-gold-400">Compliant</span>
        </p>
        <div className="glass-card mt-6 p-6">
          <h1 className="text-lg font-semibold text-white">This link has expired</h1>
          <p className="mt-2 text-sm text-white/70">
            It may have run out or been copied incorrectly. Please ask the person who sent it to send it again.
          </p>
        </div>
      </div>
    </main>
  );
}
