import type { Metadata } from "next";
import BackLink from "@/components/back-link";
import MySignatureForm from "@/components/letters/my-signature-form";
import { myLetterSignatures } from "@/lib/letters/signature-actions";

export const metadata: Metadata = { title: "My signature" };

/**
 * MY SIGNATURE (Phil, 2026-10-12, Job 2 Part A, docs/decisions/letter-signatures.md). Reached from
 * the profile panel under the initials circle. Your own signatures, for the letters you sign:
 * nobody else can see, use or download them, which the database and storage enforce (0446).
 */
export default async function MySignaturePage() {
  const mine = await myLetterSignatures();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-10">
      <BackLink href="/dashboard" label="Dashboard" />
      <div>
        <h1 className="page-title">My signature</h1>
        <p className="page-subtitle">
          Keep a signature to put on the letters you send. When you make a letter you choose your uploaded
          signature, your drawn one, sign it there and then, or send it unsigned. Only you can see or use these.
        </p>
      </div>
      {mine.eligible ? (
        <MySignatureForm upload={mine.upload} drawn={mine.drawn} />
      ) : (
        <div className="glass-card p-5 text-sm text-white/70">{mine.reason}</div>
      )}
    </div>
  );
}
