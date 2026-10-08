import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canWritePolicies, requireCompany } from "@/lib/auth/guards";
import { isCarerLogin } from "@/lib/auth/carer-login";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/action-form";
import PolicyLibrary from "@/components/settings/policy-library";
import CollapsibleSection, { CollapsibleRow } from "@/components/settings/collapsible-section";
import { listPolicies, getPolicyConfig } from "@/lib/assignments/data";
import { listOpenDrafts, topicsForCompany } from "@/lib/policies/data";
import { checklistFor, policyReviewRag } from "@/lib/policies/review";
import { WALES_REG12_TOPICS } from "@/lib/policies/library-seed";
import { markPolicyReviewed, setPolicyOwner, setPolicyTopic } from "@/lib/policies/ai-actions";

/**
 * Policies, a department of its own (Phil, 2026-10-06: "make that its own department, still
 * where a company can upload their policies but also where they can create a policy or have
 * their policy improved").
 *
 * From the top: write or improve with AI, anything waiting on you (guidance changed, drafts),
 * the policies your regulator expects and which you have, the review register, and the
 * library itself. Admins, and roles ticked "Can write and approve" in Role access (0399), do
 * the writing; everyone else here reads and sends policies out from Briefings.
 */

export const metadata: Metadata = { title: "Policies" };

const READERS = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

function ukDate(iso: string | null): string {
  if (!iso) return "No date";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const RAG_PILL = { red: "pill pill-red", amber: "pill pill-amber", green: "pill pill-green" } as const;

export default async function PoliciesPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (isCarerLogin(profile.role)) redirect("/my");
  if (!READERS.includes(profile.role)) redirect("/dashboard");
  const companyId = profile.company_id;
  const writer =
    profile.role === "company_admin" || profile.role === "platform_admin" || (await canWritePolicies(companyId));

  const supabase = await createClient();
  const { data: coRow } = await supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle<{ regulator: string | null }>();
  const [policies, config, { topics, register: policyRegister }, drafts, { data: reviewRows }, { data: co }, { data: people }] = await Promise.all([
    listPolicies(companyId, true),
    writer ? getPolicyConfig(companyId) : Promise.resolve(null),
    topicsForCompany(companyId, coRow?.regulator ?? null),
    writer ? listOpenDrafts(companyId) : Promise.resolve([]),
    supabase
      .from("company_policies")
      .select("id, title, topic_key, owner_id, review_due_on, last_reviewed_on, guidance_changed_at, guidance_change_note")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("title"),
    supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle<{ regulator: string | null }>(),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("company_id", companyId)
      .in("role", ["company_admin", "registered_individual", "registered_manager", "manager"])
      .eq("status", "active")
      .order("full_name"),
  ]);
  const active = policies.filter((p) => p.status === "active");
  const archived = policies.filter((p) => p.status === "archived");
  type ReviewRow = {
    id: string;
    title: string;
    topic_key: string | null;
    owner_id: string | null;
    review_due_on: string | null;
    last_reviewed_on: string | null;
    guidance_changed_at: string | null;
    guidance_change_note: string | null;
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  /* Red, then amber, then green, soonest first within each (Phil, 2026-10-06: "amber and red
     need to be at the top of the lists so we can see them easy"). */
  const ragRank = { red: 0, amber: 1, green: 2 } as const;
  const register = [...((reviewRows as ReviewRow[] | null) ?? [])].sort(
    (a, b) =>
      ragRank[policyReviewRag(a.review_due_on, today)] - ragRank[policyReviewRag(b.review_due_on, today)] ||
      (a.review_due_on ?? "").localeCompare(b.review_due_on ?? "") ||
      a.title.localeCompare(b.title),
  );
  const owners = (people as Array<{ id: string; full_name: string | null }> | null) ?? [];
  const changed = register.filter((r) => r.guidance_changed_at);
  const haveTopic = new Map(register.filter((r) => r.topic_key).map((r) => [r.topic_key as string, r]));
  const regulators = checklistFor(co?.regulator ?? null);
  const expected = topics.filter((t) => t.required_by.some((r) => regulators.includes(r as "ciw" | "cqc")));
  const missing = expected.filter((t) => !haveTopic.has(t.key));
  /* Employment law is the same in England and Wales, so every company gets the same HR list. */
  const hrTopics = topics.filter((t) => t.required_by.includes("hr"));
  const hrMissing = hrTopics.filter((t) => !haveTopic.has(t.key));
  const topicTitle = new Map(topics.map((t) => [t.key, t.title]));
  /* A company's own register (0405): its sections, in the register's order, each its own card. */
  const registerSections: Array<{ section: string; lines: typeof policyRegister }> = [];
  for (const line of policyRegister) {
    const last = registerSections[registerSections.length - 1];
    if (last && last.section === line.section) last.lines.push(line);
    else registerSections.push({ section: line.section, lines: [line] });
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Policies</h1>
          <p className="page-subtitle">
            Write, improve, review and keep your policies up to date. Send them out from{" "}
            <Link href="/briefings" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">Briefings</Link>{" "}
            for your team to read and sign.
          </p>
        </div>
        {writer ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/policies/write" className="btn-primary">Write a policy with AI</Link>
            <Link href="/policies/improve" className="btn-outline">Improve a policy with AI</Link>
          </div>
        ) : null}
      </div>

      {changed.length > 0 ? (
        <section className="glass-card space-y-2 border border-amber-400/40 p-5">
          <h2 className="text-sm font-semibold text-white">The guidance behind {changed.length === 1 ? "a policy" : `${changed.length} policies`} has changed</h2>
          {changed.map((r) => (
            <div key={r.id} className="text-sm text-white/75">
              <span className="font-semibold text-white">{r.title}:</span> {r.guidance_change_note}
              {writer ? (
                <Link href={`/policies/improve?policy=${r.id}`} className="ml-2 text-gold-300 hover:underline">Review it with AI</Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {writer && drafts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Drafts waiting for you</h2>
          <div className="glass-card divide-y divide-white/10">
            {drafts.map((d) => (
              <Link key={d.id} href={`/policies/drafts/${d.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-white/5">
                <span className="text-sm font-semibold text-white">{d.title}</span>
                <span className="pill pill-amber">{d.kind === "write" ? "New draft" : "Review"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {registerSections.length > 0 ? (
        <>
          <p className="text-sm text-white/70">
            {policyRegister.filter((l) => haveTopic.has(l.topic_key)).length} of {policyRegister.length} policies on your register
            are in place.
          </p>
          {/* Each section a dropdown like Settings > Users, its count on the button, two per row and
              opening over the page (Phil, 2026-10-07 and 2026-10-08: "next to safeguarding, it should
              say 0 of 3 in place"; "two columns worth of drop downs so the page isn't so long"). */}
          <div className="grid gap-3 sm:grid-cols-2">
            {registerSections.map(({ section, lines }) => (
              <CollapsibleSection
                key={section}
                floating
                title={section}
                detail={`${lines.filter((l) => haveTopic.has(l.topic_key)).length} of ${lines.length} in place`}
              >
                <div className="px-2 py-1">
                  <TopicChecklist
                    columns={1}
                    topics={lines.map((l) => ({ key: l.topic_key, title: l.title }))}
                    have={haveTopic}
                    writer={writer}
                    tag={(key) => (/reg 12\(1\)/i.test(lines.find((l) => l.topic_key === key)?.legal_basis ?? "") ? "reg 12" : null)}
                  />
                </div>
              </CollapsibleSection>
            ))}
          </div>
          {writer ? (
            <p className="form-hint">
              Already have one of these? Set &quot;Standard policy&quot; on it in the Review register and it counts.
            </p>
          ) : null}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
      <CollapsibleSection
          floating
          title={`Policies your regulator expects${regulators.length === 1 ? (regulators[0] === "ciw" ? " (Care Inspectorate Wales)" : " (CQC)") : ""}`}
          detail={topics.length === 0 ? undefined : `${expected.length - missing.length} of ${expected.length} in place`}
        >
          {topics.length === 0 ? (
            <div className="px-2 py-1 text-sm text-white/60">The policy library is being set up. This list appears once it is loaded.</div>
          ) : (
            <div className="px-2 py-1">
              {regulators.includes("ciw") ? (
                <p className="mb-3 text-sm text-white/70">
                  Regulation 12 of the Regulated Services (Service Providers and Responsible Individuals) (Wales)
                  Regulations 2017 names ten of them; the others are expected under their own regulations.
                </p>
              ) : null}
              <TopicChecklist
                columns={1}
                topics={expected}
                have={haveTopic}
                writer={writer}
                tag={(key) => (regulators.includes("ciw") && WALES_REG12_TOPICS.has(key) ? "reg 12" : null)}
              />
              {writer ? (
                <p className="form-hint mt-3">
                  Already have one of these? Set &quot;Standard policy&quot; on it in the Review register and it counts.
                </p>
              ) : null}
            </div>
          )}
        </CollapsibleSection>
  
        {hrTopics.length > 0 ? (
          <CollapsibleSection floating title="HR policies" detail={`${hrTopics.length - hrMissing.length} of ${hrTopics.length} in place`}>
            <div className="px-2 py-1">
              <p className="mb-3 text-sm text-white/70">
                Employment law is the same in England and Wales, so these are written from Acas and GOV.UK
                guidance, including the Employment Rights Act 2025 changes.
              </p>
              <TopicChecklist columns={1} topics={hrTopics} have={haveTopic} writer={writer} tag={() => null} />
            </div>
          </CollapsibleSection>
        ) : null}
        </div>
      )}

      {/* Review register on the left, Library on the right, one line; whichever is open shows full
          width underneath, because its rows carry dropdowns and buttons (Phil, 2026-10-08). */}
      <CollapsibleRow
        items={[
          {
            key: "register",
            title: "Review register",
            count: register.length,
            children: (
              <>
        {register.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">No policies yet.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {register.map((r) => {
              const rag = policyReviewRag(r.review_due_on, today);
              return (
                /* One line on a wide screen, the dropdowns beside the title rather than under it, labels
                   to their left (Phil, 2026-10-07: "lots of wasted space ... the height needs reducing,
                   not narrower"). On a phone the controls wrap under the title. */
                <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{r.title}</p>
                    <span className={RAG_PILL[rag]}>
                      {r.review_due_on ? `${rag === "red" ? "Review overdue" : "Review due"} ${ukDate(r.review_due_on)}` : "No review date set"}
                    </span>
                  </div>
                  {writer ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionForm action={setPolicyTopic} hidden={{ policy_id: r.id }} label="Save" inline inlineTight buttonClassName="btn-ghost text-xs">
                        <div className="flex items-center gap-2">
                          <label className="whitespace-nowrap text-xs text-white/50" htmlFor={`topic-${r.id}`}>Standard policy</label>
                          <div className="w-52">
                            <select id={`topic-${r.id}`} name="topic_key" defaultValue={r.topic_key ?? ""}>
                              <option value="">Not one of the standard policies</option>
                              {topics.map((t) => (
                                <option key={t.key} value={t.key}>{t.title}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </ActionForm>
                      <ActionForm action={setPolicyOwner} hidden={{ policy_id: r.id }} label="Save" inline inlineTight buttonClassName="btn-ghost text-xs">
                        <div className="flex items-center gap-2">
                          <label className="whitespace-nowrap text-xs text-white/50" htmlFor={`owner-${r.id}`}>Owner</label>
                          <div className="w-44">
                            <select id={`owner-${r.id}`} name="owner_id" defaultValue={r.owner_id ?? ""}>
                              <option value="">No owner</option>
                              {owners.map((o) => (
                                <option key={o.id} value={o.id}>{o.full_name || "Unnamed"}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </ActionForm>
                      <ActionForm
                        action={markPolicyReviewed}
                        hidden={{ policy_id: r.id }}
                        label="Reviewed, no changes needed"
                        buttonClassName="btn-outline text-xs"
                        confirm={`Mark "${r.title}" as reviewed today with no changes? The next review date moves on by its review period.`}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-white/50">
                      {r.topic_key ? topicTitle.get(r.topic_key) : "Not one of the standard policies"}
                      {r.owner_id ? ` · Owner: ${owners.find((o) => o.id === r.owner_id)?.full_name ?? "Unknown"}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
              </>
            ),
          },
          {
            key: "library",
            title: "Library",
            count: active.length,
            children: (
              <>
        {writer && config ? (
          <PolicyLibrary policies={active} config={config} />
        ) : active.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">No policies have been added yet. Your Admin adds them here.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {active.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                  <p className="text-xs text-white/50">Version {p.version}</p>
                </div>
                <a href={`/api/policies/${p.id}/file`} target="_blank" rel="noreferrer" className="btn-outline">Open</a>
              </div>
            ))}
          </div>
        )}
              </>
            ),
          },
        ]}
      />

      {writer && archived.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Archived</h2>
          <div className="glass-card divide-y divide-white/10">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <p className="truncate text-sm text-white/70">{p.title}</p>
                <span className="pill pill-neutral">Archived</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A tick list of standard policies, missing ones first, each missing one a link to write it with AI. */
function TopicChecklist({
  topics,
  have,
  writer,
  tag,
  columns = 2,
}: {
  topics: Array<{ key: string; title: string }>;
  have: Map<string, unknown>;
  writer: boolean;
  tag: (key: string) => string | null;
  /** One column inside a dropdown, which is only half the page wide. */
  columns?: 1 | 2;
}) {
  return (
    <div className={`grid gap-x-6 gap-y-1${columns === 2 ? " sm:grid-cols-2" : ""}`}>
      {[...topics]
        .sort((a, b) => Number(have.has(a.key)) - Number(have.has(b.key)))
        .map((t) => {
          const got = have.has(t.key);
          const label = tag(t.key);
          return (
            <div key={t.key} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className={`min-w-0 ${got ? "text-white/80" : "text-white"}`}>
                {got ? "✓ " : "✗ "}
                {t.title}
                {label ? <span className="ml-1 text-xs text-white/40">{label}</span> : null}
              </span>
              {!got && writer ? (
                /* Never wraps, so every one lines up on the right on a phone (Phil, 2026-10-08). */
                <Link href={`/policies/write?topic=${t.key}`} className="shrink-0 whitespace-nowrap text-xs text-gold-300 hover:underline">
                  Write with AI
                </Link>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}
