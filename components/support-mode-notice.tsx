import Link from "next/link";
import BackLink from "@/components/back-link";

/**
 * Shown instead of a form that support mode is never allowed to save.
 *
 * The founder managing as a company can read everything and can create records, but completing
 * a check writes SIGNED COMPLIANCE EVIDENCE, and evidence signed by the founder impersonating a
 * manager is worse than no evidence: an inspector reading it would be told a member of staff
 * did something they never did.
 *
 * It exists because the refusal used to arrive at the END — the buttons rendered, the form
 * filled in, you signed it, and the save came back "Not a member of this company", which is
 * also not what a page headed "Managing as ..." reads like.
 */
export default function SupportModeNotice({
  backHref,
  backLabel,
  what,
}: {
  backHref: string;
  backLabel: string;
  /** e.g. "complete this check" */
  what: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={backHref} label={backLabel} />
      <div className="glass-card mt-4 p-6">
        <h1 className="text-lg font-semibold text-white">Support mode cannot {what}</h1>
        <p className="mt-3 text-sm text-white/70">
          You are inside this company for support, so you can look at anything and put records
          right — but completing a check stores evidence signed by whoever completed it, and that
          has to be somebody who actually works here. An inspector reading it would otherwise be
          told a member of staff did something they never did.
        </p>
        <p className="mt-3 text-sm text-white/70">
          Ask somebody at the company to complete it, or exit support mode and go back to the
          founder console.
        </p>
        <Link href="/founder" className="mt-5 inline-block text-xs text-gold-300 hover:underline">
          Back to the Founder console
        </Link>
      </div>
    </div>
  );
}
