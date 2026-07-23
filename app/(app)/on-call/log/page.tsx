import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import LogRegister from "@/components/on-call/log-register";
import { listCallLog } from "@/lib/on-call/data";

export const metadata: Metadata = { title: "On Call · Call log" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

export default async function CallLogPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const rows = await listCallLog(profile.company_id);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RealtimeRefresh tables={["on_call_logs"]} channel="on-call-log-live" />
      <BackLink href="/on-call" label="Back to On Call" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Call log</h1>
          <p className="text-sm text-white/60">Out-of-hours calls and how they were handled.</p>
        </div>
        <Link href="/on-call/log/new" className="btn-primary text-sm">Log call</Link>
      </div>
      <LogRegister rows={rows} />
    </div>
  );
}
