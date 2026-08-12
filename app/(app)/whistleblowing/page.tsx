import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import WhistleblowingRegister from "@/components/whistleblowing/whistleblowing-register";
import { listDisclosures } from "@/lib/whistleblowing/data";

export const metadata: Metadata = { title: "Whistleblowing" };

/** Company Admin and Responsible Individual only (Phil, 2026-08-12). Deliberately NOT
 *  branch managers, however senior: the commonest real disclosure is about a manager.
 *  This redirect is a courtesy, not the control — RLS refuses the rows either way. */
const MANAGE_ROLES = ["company_admin", "registered_individual", "platform_admin"];

export default async function WhistleblowingPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const rows = await listDisclosures(profile.company_id);

  return (
    <div className="mx-auto max-w-5xl">
      <WhistleblowingRegister rows={rows} canManage />
    </div>
  );
}
