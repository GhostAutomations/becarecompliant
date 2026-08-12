import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import WhistleblowingRegister from "@/components/whistleblowing/whistleblowing-register";
import { listDisclosures } from "@/lib/whistleblowing/data";

export const metadata: Metadata = { title: "Whistleblowing" };

/** Company Admin and Responsible Individual only (Phil, 2026-08-12). Deliberately NOT
 *  branch managers, however senior: the commonest real disclosure is about a manager.
 *  This redirect is a courtesy, not the control — RLS refuses the rows either way. */
/* NO platform_admin. The founder is not a reader of this register (migration 0177), and
 * leaving them in this list would let a support session render a page whose every query
 * comes back empty - which looks like a bug rather than a boundary. */
const MANAGE_ROLES = ["company_admin", "registered_individual"];

export default async function WhistleblowingPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  /*
   * SUPPORT MODE STOPS HERE, and says so.
   *
   * A platform admin acting inside a company is shadowed to company_admin for scoping, so
   * this page renders for them - but RLS reads the REAL auth.uid(), and 0177 gives the
   * founder no clause on this table. Without this branch they would get an empty register
   * and reasonably conclude the feature was broken. It is not: it is the boundary working.
   */
  if (profile.actingAsCompanyId) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">Whistleblowing</h1>
        <p className="page-subtitle">Not readable in support mode.</p>
        <div className="glass-card mt-5 border border-amber-300/20 p-5 text-sm text-white/75">
          <p className="font-medium text-white/90">This register is closed to us.</p>
          <p className="mt-2">
            Whistleblowing disclosures are readable by the company&rsquo;s own Admin and
            Responsible Individual, and by nobody else — including Be Care Compliant. That is
            enforced in the database, so it holds in support mode too.
          </p>
          <p className="mt-2 text-white/55">
            If a customer needs help with this section, you can be told what is on their
            screen; you cannot look for yourself.
          </p>
        </div>
      </div>
    );
  }

  const rows = await listDisclosures(profile.company_id);

  return (
    <div className="mx-auto max-w-5xl">
      <WhistleblowingRegister rows={rows} canManage />
    </div>
  );
}
