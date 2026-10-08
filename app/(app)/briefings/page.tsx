import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isCarerLogin } from "@/lib/auth/carer-login";
import { requireCompany } from "@/lib/auth/guards";
import ActionForm from "@/components/action-form";
import RealtimeRefresh from "@/components/realtime-refresh";
import SendBriefing from "@/components/briefings/send-briefing";
import CompletedBriefings from "@/components/briefings/completed-briefings";
import NoticesSent from "@/components/briefings/notices-sent";
import FoldSection from "@/components/briefings/fold-section";
import { listMemoSenders } from "@/lib/briefings/senders";
import { cancelAssignment } from "@/lib/assignments/actions";
import type { AssignmentRow } from "@/lib/assignments/types";
import { NOTICE_KIND_LABELS, NOTICE_RESPONSE_ASKS } from "@/lib/briefings/notice-rules";
import {
  listAssignments,
  listAssignableForms,
  listBriefingAudience,
  listPolicies,
} from "@/lib/assignments/data";

/**
 * Briefings, a department of its own (Phil, 2026-07-26, promoted out of People
 * and renamed from "Assignments").
 *
 * A briefing is something you send the team and expect back: a policy to read and
 * sign, or a form to complete. This is the Manager's side of it. A Team Member
 * sees their own briefings in their own area.
 */

export const metadata: Metadata = { title: "Briefings" };

const MANAGER_PLUS = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

/** What the outstanding line says it is. */
function whatItIs(a: AssignmentRow): string {
  if (a.kind === "notice") {
    const label = a.notice_kind ? NOTICE_KIND_LABELS[a.notice_kind] : "Briefing";
    const ask = a.notice_response ? NOTICE_RESPONSE_ASKS[a.notice_response].toLowerCase() : "to read";
    return `${label} ${ask}${a.read_at ? `, opened ${fmtDate(a.read_at.slice(0, 10))}` : ""}`;
  }
  return a.kind === "policy" ? "To read and confirm" : "Form to complete";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function BriefingsPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (isCarerLogin(profile.role)) redirect("/my");
  if (!MANAGER_PLUS.includes(profile.role)) redirect("/dashboard");

  const [assignments, forms, policies, people, senders] = await Promise.all([
    listAssignments(profile.company_id),
    listAssignableForms(profile.company_id),
    listPolicies(profile.company_id),
    listBriefingAudience(profile.company_id),
    listMemoSenders(profile.company_id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const open = assignments.filter((a) => a.status === "assigned");
  // Memos and messages have their own list below, one row per thing sent.
  const done = assignments.filter((a) => a.status === "completed" && a.kind !== "notice");

  return (
    <div className="page-shell space-y-6">
      <RealtimeRefresh tables={["assignments"]} channel="assignments" />
      <div>
        <h1 className="page-title">Briefings</h1>
        <p className="page-subtitle">
          Policies to read and sign, forms to complete, and memos, messages and documents for
          your team. They are emailed and see them when they log in, and you can see who has
          read, confirmed or signed. Signatures and forms are filed as Evidence on their record.
        </p>
      </div>

      <SendBriefing
        forms={forms}
        policies={policies}
        people={people}
        /* "Me" is already the first choice, so you are not listed twice. */
        senders={senders.filter((s) => s.id !== profile.id)}
      />

      {policies.length === 0 && (
        // Policies are their own department now (2026-10-06), and a memo or message can be sent
        // without one, so this only explains the empty policy list (Phil, 2026-10-08).
        <p className="text-xs text-white/60">
          No policies yet, so there are none to send. Add them in{" "}
          <Link href="/policies" className="text-amber-200 underline decoration-white/30 underline-offset-2">
            Policies
          </Link>
          . You can still send memos and messages{forms.length > 0 ? ", and forms" : ""}.
        </p>
      )}

      <FoldSection title="Outstanding" count={open.length}>
        {open.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Nothing outstanding.</div>
        ) : (
          // Compact tiles, four across on a wide screen (Phil, 2026-10-08: "such a big gap in between
          // the memo name and ... due ... withdraw"). Two on a tablet, one on a phone.
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {open.map((a) => {
              const overdue = a.due_date != null && a.due_date < today;
              return (
                <div key={a.id} className="glass-card flex flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white" title={a.title}>
                      {a.title}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {a.person_name ?? "Someone"} · {whatItIs(a)}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <span className={overdue ? "pill pill-red" : "pill pill-neutral"}>
                      {a.due_date ? `Due ${fmtDate(a.due_date)}` : "No date"}
                    </span>
                    <ActionForm
                      action={cancelAssignment}
                      hidden={{ assignment_id: a.id }}
                      label="Withdraw"
                      savedLabel="Withdrawn"
                      buttonClassName="btn-outline btn-xs"
                      className=""
                      confirm="Withdraw this briefing? It disappears from their list."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FoldSection>

      <NoticesSent assignments={assignments} />

      <CompletedBriefings completed={done} />
    </div>
  );
}
