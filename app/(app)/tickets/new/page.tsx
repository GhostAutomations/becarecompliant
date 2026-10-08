import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { disabledModulesFor } from "@/lib/auth/module-access";
import { navEntriesForRole } from "@/lib/nav";
import { TICKET_RAISER_ROLES } from "@/lib/tickets/options";
import RaiseTicketForm, { type TicketDepartment } from "@/components/tickets/raise-ticket-form";

export const metadata: Metadata = { title: "Raise a ticket" };

export default async function NewTicketPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder/tickets");
  if (profile.role === "platform_admin") redirect("/tickets");
  if (!TICKET_RAISER_ROLES.includes(profile.role)) redirect("/dashboard");

  /* WHERE A PROBLEM IS (Phil): the departments in their own sidebar, then that department's
     sections, exactly as their sidebar shows them. */
  const disabled = await disabledModulesFor(profile.company_id, profile.role, profile.company_role_id ?? null);
  const departments: TicketDepartment[] = navEntriesForRole(profile.role, disabled)
    .filter((e) => e.href !== "/founder" && e.href !== "/tickets")
    .map((e) => ({ label: e.label, areas: (e.children ?? []).map((c) => c.label) }));

  return (
    <div className="page-form space-y-4">
      <Link href="/tickets" className="text-sm text-white/60 hover:text-white">← Back to Tickets</Link>
      <div>
        <h1 className="page-title">Raise a ticket</h1>
        <p className="page-subtitle">Tell us about a problem, or a feature you would like. We reply here and by email.</p>
      </div>
      <RaiseTicketForm departments={departments} />
    </div>
  );
}
