import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/nav";

export const metadata: Metadata = { title: "Not available" };

/**
 * Where somebody lands when their company has switched a department off for their role.
 *
 * IT SAYS WHY. "You do not have permission" is what a screen says when it does not know, and it
 * sends the person to us. This one names the role and points at who can change it, because the
 * answer is a tick box their own Admin owns, not a bug.
 *
 * NEVER GATED ITSELF (moduleForPath returns null for it): a gate that redirects into a gated page
 * is a redirect loop.
 */
export default async function NoAccessPage() {
  const { profile } = await requireProfile();
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;
  return (
    <div className="page-shell">
      <h1 className="page-title mt-1">That area is switched off</h1>
      <p className="page-subtitle">
        Your company has not given the {roleLabel} role access to this part of Be Care Compliant.
      </p>
      <div className="glass-card mt-6 p-6 text-sm text-white/70">
        <p>
          Nothing has gone wrong and nothing is missing from your records. An Admin at your company
          chooses which departments each role opens, under Settings, User access.
        </p>
        <p className="mt-3">
          If you need this area for your job, ask them to switch it on for the {roleLabel} role.
        </p>
        <Link href="/dashboard" className="btn-primary mt-5 inline-block px-4 py-2">
          Back to the Dashboard
        </Link>
      </div>
    </div>
  );
}
