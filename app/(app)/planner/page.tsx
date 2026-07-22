import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";
import { featureEnabled } from "@/lib/billing/tier";

export const metadata: Metadata = { title: "My Planner" };

// Everyone except a Viewer / Team Member.
const ALLOWED = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
];

export default async function PlannerPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">My Planner</h1>
          <p className="page-subtitle">
            The tasks you have booked in to carry out: supervisions, spot checks,
            reviews and more.
          </p>
        </div>
        <Link href="/planner/whiteboard" className="btn-ghost text-sm">
          Whiteboard
        </Link>
      </div>

      <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
          <NavIcon icon="planner" className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-white">Nothing planned yet</h2>
        <p className="max-w-md text-sm text-white/60">
          When a task is booked in for you to carry out, it appears here and on the
          branch whiteboard. Booking is coming in the next step.
        </p>
      </div>
    </div>
  );
}
