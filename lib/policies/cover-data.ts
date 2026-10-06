import "server-only";

/**
 * The cover page's data (lib/policies/cover.ts): what the form chose, the reference number, and
 * everything the system already knows (owner, approver, dates, the change history), gathered
 * when a version is frozen into its PDF.
 */

import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/nav";
import { cleanReference, coverFromForm, referencePrefix, type CoverPage } from "./cover";

const APPROVER_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager"];

function ukLong(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "long", year: "numeric" }).format(d);
}

/** The cover fields to store from a form, or null when the form did not carry them. */
export async function coverPatchFrom(
  fd: FormData,
  companyId: string,
): Promise<{ patch: Record<string, string | null> } | { error: string } | null> {
  if (fd.get("cover_present") !== "1") return null;
  const c = coverFromForm((k) => fd.get(k));
  const owner = String(fd.get("owner_id") ?? "").trim() || null;
  const supabase = await createClient();
  for (const [id, what] of [[c.approver_id, "approve"], [owner, "own"]] as const) {
    if (!id) continue;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .in("role", APPROVER_ROLES)
      .maybeSingle();
    if (!data) return { error: `The person chosen to ${what} this policy is not a manager or admin in your company.` };
  }
  return {
    patch: {
      applies_to: c.applies_to,
      read_by: c.read_by,
      retention: c.retention,
      classification: c.classification,
      approver_id: c.approver_id,
      ...(owner ? { owner_id: owner } : {}),
    },
  };
}

/** A typed reference, or the next automatic one for the policy's area (POL-HR-004). */
export async function referenceFor(
  fd: FormData,
  companyId: string,
  topicKey: string | null,
): Promise<{ reference: string } | { error: string }> {
  const typed = String(fd.get("reference") ?? "").trim();
  if (typed) {
    const clean = cleanReference(typed);
    if (!clean) return { error: "A reference can only use letters, numbers, dashes, full stops and slashes, up to 30 characters." };
    return { reference: clean };
  }
  const supabase = await createClient();
  let requiredBy: string[] = [];
  if (topicKey) {
    const { data } = await supabase.from("policy_topics").select("required_by").eq("key", topicKey).maybeSingle<{ required_by: string[] }>();
    requiredBy = data?.required_by ?? [];
  }
  const { data, error } = await supabase.rpc("next_policy_reference", { cid: companyId, p_prefix: referencePrefix(requiredBy) });
  if (error || typeof data !== "string") return { error: `A reference number could not be given: ${error?.message ?? "no answer"}` };
  return { reference: data };
}

/** Everything the cover needs for this version, read as it stands in the database now. */
export async function buildCoverPage(opts: {
  policyId: string;
  version: number;
  title: string;
  companyName: string;
  changeSummary: string;
}): Promise<{ cover: CoverPage; approvedByName: string | null; approvedByRole: string | null }> {
  const supabase = await createClient();
  const [{ data: p }, { data: versions }] = await Promise.all([
    supabase
      .from("company_policies")
      .select("reference, owner_id, approver_id, applies_to, read_by, retention, classification, review_months")
      .eq("id", opts.policyId)
      .maybeSingle<{
        reference: string | null;
        owner_id: string | null;
        approver_id: string | null;
        applies_to: string | null;
        read_by: string | null;
        retention: string | null;
        classification: string | null;
        review_months: number | null;
      }>(),
    supabase
      .from("company_policy_versions")
      .select("version, created_at, change_summary, approved_by_name")
      .eq("policy_id", opts.policyId)
      .order("version"),
  ]);
  const ids = [p?.owner_id, p?.approver_id].filter((x): x is string => Boolean(x));
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name, role").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string | null; role: string }> };
  const who = new Map(((people as Array<{ id: string; full_name: string | null; role: string }> | null) ?? []).map((x) => [x.id, x]));
  const approver = p?.approver_id ? who.get(p.approver_id) : undefined;
  const approvedByName = approver?.full_name ?? null;
  const approvedByRole = approver ? (ROLE_LABELS[approver.role] ?? approver.role) : null;
  const approvedBy = approvedByName ? `${approvedByName}${approvedByRole ? `, ${approvedByRole}` : ""}` : null;
  const owner = p?.owner_id ? (who.get(p.owner_id)?.full_name ?? null) : null;

  const now = new Date();
  const next = new Date(now);
  next.setMonth(next.getMonth() + (p?.review_months ?? 12));

  const earlier = ((versions as Array<{ version: number; created_at: string; change_summary: string | null; approved_by_name: string | null }> | null) ?? [])
    .filter((v) => v.version < opts.version)
    .map((v) => ({
      version: v.version,
      date: ukLong(new Date(v.created_at)),
      change: v.change_summary ?? (v.version === 1 ? "First issue" : "Not recorded"),
      approvedBy: v.approved_by_name,
    }));

  return {
    approvedByName,
    approvedByRole,
    cover: {
      reference: p?.reference ?? null,
      title: opts.title,
      companyName: opts.companyName,
      version: opts.version,
      approvedOn: ukLong(now),
      approvedBy,
      owner,
      nextReview: ukLong(next),
      appliesTo: p?.applies_to ?? "All staff",
      readBy: p?.read_by ?? "As set in Briefings",
      retention: p?.retention ?? "Kept for 8 years after it is replaced",
      classification: p?.classification ?? "Internal",
      history: [
        ...earlier,
        { version: opts.version, date: ukLong(now), change: opts.changeSummary, approvedBy: approvedByName },
      ],
    },
  };
}
