import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import RaiseConcern from "@/components/staff/raise-concern";

export const metadata: Metadata = { title: "Raise a concern" };

/**
 * Open to ANY signed-in member of the company, at every level. A supervisor or a branch
 * manager may need to raise something about the person above them, and a route only carers
 * can use would be the one route that does not cover the commonest serious case.
 *
 * There is nothing to read on this page, so there is nothing to protect: the register
 * itself refuses everyone but the Admin and the Responsible Individual.
 */
export default async function RaiseConcernPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href="/my" label="Back to My area" />
        <h1 className="page-title mt-1">Raise a concern</h1>
        <p className="page-subtitle">
          If something at work is unsafe, dishonest or wrong, you can say so here. It goes to
          the Admin and the Responsible Individual only — not to your manager.
        </p>
      </div>

      <div className="glass-card p-6">
        <RaiseConcern />
      </div>

      <div className="glass-card p-5 text-xs text-white/55">
        <p className="mb-1 font-medium text-white/70">Before you use this</p>
        <p>
          Raising a concern in the public interest is protected by law (the Public Interest
          Disclosure Act 1998), and you do not have to be right — you have to believe it, and
          be raising it in good faith.
        </p>
        <p className="mt-2">
          You can also go outside your employer at any point, and for something serious you
          may prefer to. In Wales that is Care Inspectorate Wales; in England, the Care
          Quality Commission. If someone is at immediate risk, contact the local authority
          safeguarding team or the police rather than using this form.
        </p>
      </div>
    </div>
  );
}
