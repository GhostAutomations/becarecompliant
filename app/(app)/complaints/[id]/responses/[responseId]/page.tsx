import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getComplaintResponse } from "@/lib/complaints/data";
import { formatUkDate } from "@/lib/complaints/logic";

export const metadata: Metadata = { title: "Response" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function ComplaintResponsePage({
  params,
}: {
  params: Promise<{ id: string; responseId: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, responseId } = await params;
  if (!profile.company_id || !MANAGE_ROLES.includes(profile.role)) redirect("/complaints");

  const response = await getComplaintResponse(responseId);
  if (!response) redirect(`/complaints/${id}`);

  const heading = response.method === "email" ? "Initial response (email)" : "Initial response (letter)";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href={`/complaints/${id}`} label="Back to complaint" />

      <div>
        <h1 className="page-title">{heading}</h1>
        <p className="page-subtitle">Recorded response, stored unchanged as your inspection record.</p>
      </div>

      <div className="glass-card grid gap-3 p-5 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase text-white/40">Recorded by</p>
          <p className="text-sm text-white/85">{response.author_name ?? "Unknown"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-white/40">{response.method === "email" ? "Sent" : "Recorded"}</p>
          <p className="text-sm text-white/85">{fmtDateTime(response.sent_at ?? response.created_at)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-white/40">{response.method === "email" ? "Sent to" : "Address"}</p>
          <p className="text-sm text-white/85">{response.recipient ?? "Not recorded"}</p>
        </div>
      </div>

      <div className="glass-card space-y-3 p-5">
        {response.subject ? (
          <div>
            <p className="text-[11px] uppercase text-white/40">Subject</p>
            <p className="text-sm text-white/90">{response.subject}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[11px] uppercase text-white/40">
            {response.method === "email" ? "Message" : "Letter"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">{response.body}</p>
        </div>
      </div>

      <p className="text-xs text-white/40">
        Sent {formatUkDate((response.sent_at ?? response.created_at).slice(0, 10))}. This response is kept as
        a permanent record of your initial reply.
      </p>
    </div>
  );
}
