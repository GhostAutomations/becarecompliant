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
import { withdrawBriefing } from "@/lib/assignments/actions";
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

/** What an outstanding briefing is. */
function whatItIs(a: AssignmentRow): string {
  if (a.kind === "notice") {
    const label = a.notice_kind ? NOTICE_KIND_LABELS[a.notice_kind] : "Briefing";
    const ask = a.notice_response ? NOTICE_RESPONSE_ASKS[a.notice_response].toLowerCase() : "to read";
    return `${label} ${ask}`;
  }
  if (a.kind === "policy") return `Policy to read and sign${a.policy_version ? `, version ${a.policy_version}` : ""}`;
  return "Form to complete";
}

/**
 * Outstanding, one tile per thing sent with everyone still to do it named inside (Phil,
 * 2026-10-08: "Cardiff meeting minutes, a list of names, the due date next to it, and then a
 * withdraw button"). A policy is grouped per version, because signing v1 and v2 are different.
 */
type OutstandingGroup = {
  key: string;
  kind: "policy" | "form" | "notice";
  targetId: string;
  version: number | null;
  title: string;
  what: string;
  dueDates: string[];
  people: Array<{ id: string; name: string; overdue: boolean; opened: boolean }>;
  latest: string;
};

function groupOutstanding(open: AssignmentRow[], today: string): OutstandingGroup[] {
  const map = new Map<string, OutstandingGroup>();
  for (const a of open) {
    const targetId = (a.kind === "notice" ? a.notice_id : a.kind === "policy" ? a.policy_id : a.form_id) ?? a.id;
    const key = `${a.kind}:${targetId}:${a.kind === "policy" ? (a.policy_version ?? "") : ""}`;
    const g =
      map.get(key) ??
      ({
        key,
        kind: a.kind,
        targetId,
        version: a.kind === "policy" ? a.policy_version : null,
        title: a.title,
        what: whatItIs(a),
        dueDates: [],
        people: [],
        latest: a.assigned_at,
      } satisfies OutstandingGroup);
    if (a.due_date && !g.dueDates.includes(a.due_date)) g.dueDates.push(a.due_date);
    g.people.push({
      id: a.id,
      name: a.person_name ?? "Someone",
      overdue: a.due_date != null && a.due_date < today,
      opened: a.read_at != null,
    });
    if (a.assigned_at > g.latest) g.latest = a.assigned_at;
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.dueDates.sort();
    g.people.sort((x, y) => x.name.localeCompare(y.name));
  }
  return [...map.values()].sort((x, y) => y.latest.localeCompare(x.latest));
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
  const outstanding = groupOutstanding(open, today);
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

      <FoldSection title="Outstanding" count={outstanding.length}>
        {outstanding.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Nothing outstanding.</div>
        ) : (
          // Two briefing tiles across on a wide screen, one on a phone (Phil, 2026-10-08).
          <div className="grid gap-3 lg:grid-cols-2">
            {outstanding.map((g) => {
              const anyOverdue = g.people.some((p) => p.overdue);
              const due =
                g.dueDates.length === 0
                  ? "No date"
                  : g.dueDates.length === 1
                    ? `Due ${fmtDate(g.dueDates[0])}`
                    : `Due ${fmtDate(g.dueDates[0])} to ${fmtDate(g.dueDates[g.dueDates.length - 1])}`;
              return (
                <div key={g.key} className="glass-card flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white" title={g.title}>
                        {g.title}
                      </p>
                      <p className="text-xs text-white/50">
                        {g.what} · {g.people.length} still to do it
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={anyOverdue ? "pill pill-red" : "pill pill-neutral"}>{due}</span>
                      <ActionForm
                        action={withdrawBriefing}
                        hidden={{
                          kind: g.kind,
                          target_id: g.targetId,
                          policy_version: g.version != null ? String(g.version) : "",
                        }}
                        label="Withdraw"
                        savedLabel="Withdrawn"
                        buttonClassName="btn-outline btn-xs"
                        className=""
                        confirm={`Withdraw this from all ${g.people.length} ${g.people.length === 1 ? "person" : "people"} still to do it? It disappears from their lists.`}
                      />
                    </div>
                  </div>
                  {/* Plain names in columns, five across (two on a phone), not pills (Phil,
                      2026-10-08). Red is overdue; "opened" means they have looked but not done it. */}
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
                    {g.people.map((p) => (
                      <li
                        key={p.id}
                        className={`truncate text-xs ${p.overdue ? "text-red-300" : "text-white/80"}`}
                        title={`${p.name}${p.overdue ? ", overdue" : p.opened ? ", opened, not yet done" : ""}`}
                      >
                        {p.name}
                        {p.opened ? <span className="text-white/40"> · opened</span> : null}
                      </li>
                    ))}
                  </ul>
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
