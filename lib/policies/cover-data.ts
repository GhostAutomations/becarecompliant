import "server-only";

/**
 * The cover page's data (lib/policies/cover.ts): what the form chose, the reference number, and
 * everything the system already knows (owner, approver, dates, the change history), gathered
 * when a version is frozen into its PDF.
 */

import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/nav";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import {
  cleanReference,
  coverFromForm,
  coverReview,
  documentColours,
  nameWithRole,
  ordinalDate,
  referencePrefix,
  type CoverPage,
  type VersionFact,
} from "./cover";

const APPROVER_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager"];


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
  let isStandard = false;
  if (topicKey) {
    const { data } = await supabase.from("policy_topics").select("required_by").eq("key", topicKey).maybeSingle<{ required_by: string[] }>();
    requiredBy = data?.required_by ?? [];
    isStandard = Boolean(data);
  }
  const { data, error } = await supabase.rpc("next_policy_reference", { cid: companyId, p_prefix: referencePrefix(requiredBy, isStandard) });
  if (error || typeof data !== "string") return { error: `A reference number could not be given: ${error?.message ?? "no answer"}` };
  return { reference: data };
}

type PolicyCoverRow = {
  company_id: string;
  reference: string | null;
  owner_id: string | null;
  approver_id: string | null;
  applies_to: string | null;
  read_by: string | null;
  retention: string | null;
  classification: string | null;
  review_months: number | null;
  review_due_on: string | null;
  last_reviewed_on: string | null;
  last_reviewed_by_name: string | null;
  last_reviewed_by_role: string | null;
};
type VersionRow = {
  version: number;
  created_at: string;
  change_summary: string | null;
  review_reason: string | null;
  approved_by_name: string | null;
  approved_by_role: string | null;
};
type Db = Pick<Awaited<ReturnType<typeof createClient>>, "from">;

/** Everything stored about a policy that its cover prints, read with the given client. */
async function loadCoverFacts(db: Db, policyId: string) {
  const [{ data: p }, { data: versions }] = await Promise.all([
    db
      .from("company_policies")
      .select(
        "company_id, reference, owner_id, approver_id, applies_to, read_by, retention, classification, review_months, review_due_on, last_reviewed_on, last_reviewed_by_name, last_reviewed_by_role",
      )
      .eq("id", policyId)
      .maybeSingle<PolicyCoverRow>(),
    db
      .from("company_policy_versions")
      .select("version, created_at, change_summary, review_reason, approved_by_name, approved_by_role")
      .eq("policy_id", policyId)
      .order("version"),
  ]);
  const ids = [p?.owner_id, p?.approver_id].filter((x): x is string => Boolean(x));
  const { data: people } = ids.length
    ? await db.from("profiles").select("id, full_name, role").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string | null; role: string }> };
  const who = new Map(((people as Array<{ id: string; full_name: string | null; role: string }> | null) ?? []).map((x) => [x.id, x]));
  /* The front page's logo and colours (0410). Read with the service client: the logo sits in the
     private bucket and the colours on the company row, and the caller has already been allowed
     to see this policy. */
  let logoDataUrl: string | null = null;
  let colours = documentColours(null, null);
  if (p?.company_id) {
    const admin = createServiceClient();
    const [{ data: co }, logo] = await Promise.all([
      admin.from("companies").select("brand_primary, brand_secondary").eq("id", p.company_id).maybeSingle<{ brand_primary: string | null; brand_secondary: string | null }>(),
      getCompanyLogoDataUrl(p.company_id),
    ]);
    logoDataUrl = logo;
    colours = documentColours(co?.brand_primary, co?.brand_secondary);
  }
  return {
    p,
    versions: ((versions as VersionRow[] | null) ?? []),
    who,
    logoDataUrl,
    colours,
  };
}

function roleLabel(role: string | null | undefined): string | null {
  return role ? (ROLE_LABELS[role] ?? role) : null;
}

function nextReviewDate(p: PolicyCoverRow | null | undefined, from: Date): Date {
  if (p?.review_due_on && /^\d{4}-\d{2}-\d{2}$/.test(p.review_due_on)) return new Date(`${p.review_due_on}T12:00:00Z`);
  const next = new Date(from);
  next.setMonth(next.getMonth() + (p?.review_months ?? 12));
  return next;
}

function toFacts(rows: VersionRow[]): VersionFact[] {
  return rows.map((v) => ({
    version: v.version,
    at: new Date(v.created_at),
    changeSummary: v.change_summary,
    reviewReason: v.review_reason,
    approvedByName: v.approved_by_name,
    approvedByRole: v.approved_by_role,
  }));
}

function assemble(
  facts: Awaited<ReturnType<typeof loadCoverFacts>>,
  opts: { version: number; title: string; companyName: string; versions: VersionFact[]; nextReview: Date; current: boolean },
): CoverPage {
  const { p, who } = facts;
  const mine = opts.versions.find((v) => v.version === opts.version);
  const approver = p?.approver_id ? who.get(p.approver_id) : undefined;
  const approvedBy = mine?.approvedByName
    ? nameWithRole(mine.approvedByName, mine.approvedByRole)
    : nameWithRole(approver?.full_name, roleLabel(approver?.role));
  const laterReview =
    opts.current && p?.last_reviewed_on && /^\d{4}-\d{2}-\d{2}$/.test(p.last_reviewed_on)
      ? { on: new Date(`${p.last_reviewed_on}T12:00:00Z`), byName: p.last_reviewed_by_name, byRole: p.last_reviewed_by_role }
      : null;
  return {
    reference: p?.reference ?? null,
    title: opts.title,
    companyName: opts.companyName,
    version: opts.version,
    approvedOn: ordinalDate(mine?.at ?? new Date()),
    approvedBy,
    owner: p?.owner_id ? (who.get(p.owner_id)?.full_name ?? null) : null,
    nextReview: ordinalDate(opts.nextReview),
    appliesTo: p?.applies_to ?? "All staff",
    readBy: p?.read_by ?? "As set in Briefings",
    retention: p?.retention ?? "Kept for 8 years after it is replaced",
    classification: p?.classification ?? "Internal",
    history: opts.versions
      .filter((v) => v.version <= opts.version)
      .sort((a, b) => a.version - b.version)
      .map((v) => ({
        version: v.version,
        date: ordinalDate(v.at),
        change: v.changeSummary ?? (v.version === 1 ? "First issue" : "Not recorded"),
        approvedBy: v.approvedByName,
      })),
    logoDataUrl: facts.logoDataUrl,
    colours: facts.colours,
    review: coverReview({ version: opts.version, versions: opts.versions, nextReview: opts.nextReview, laterReview }),
  };
}

/**
 * The cover for a version being approved NOW (it is not in company_policy_versions yet): today's
 * date, the chosen approver, and the reason and changes typed on approval.
 */
export async function buildCoverPage(opts: {
  policyId: string;
  version: number;
  title: string;
  companyName: string;
  changeSummary: string;
  reviewReason: string;
}): Promise<{ cover: CoverPage; approvedByName: string | null; approvedByRole: string | null }> {
  const supabase = await createClient();
  const facts = await loadCoverFacts(supabase, opts.policyId);
  const approver = facts.p?.approver_id ? facts.who.get(facts.p.approver_id) : undefined;
  const approvedByName = approver?.full_name ?? null;
  const approvedByRole = roleLabel(approver?.role);
  const now = new Date();
  const next = new Date(now);
  next.setMonth(next.getMonth() + (facts.p?.review_months ?? 12));
  const versions: VersionFact[] = [
    ...toFacts(facts.versions).filter((v) => v.version < opts.version),
    { version: opts.version, at: now, changeSummary: opts.changeSummary, reviewReason: opts.reviewReason, approvedByName, approvedByRole },
  ];
  return {
    approvedByName,
    approvedByRole,
    cover: assemble(facts, { version: opts.version, title: opts.title, companyName: opts.companyName, versions, nextReview: next, current: false }),
  };
}

/**
 * THE COVER FOR A VERSION ALREADY SAVED (Phil, 2026-10-06: "where is the cover page?"). A written
 * policy is drawn fresh whenever someone opens it (lib/policies/render.ts), so its cover is built
 * from what was stored when that version was approved. render.ts passes the service client,
 * having already checked the reader may see the policy.
 */
export async function coverForSavedVersion(
  db: Db,
  opts: { policyId: string; version: number; title: string; companyName: string; currentVersion: number },
): Promise<CoverPage> {
  const facts = await loadCoverFacts(db, opts.policyId);
  const versions = toFacts(facts.versions);
  const mine = versions.find((v) => v.version === opts.version);
  const current = opts.version === opts.currentVersion;
  /* The current version's next review is the policy's own date (it moves on with "Reviewed, no
     changes needed"); an older version's was a year on from its own approval. */
  const nextReview = current
    ? nextReviewDate(facts.p, mine?.at ?? new Date())
    : (() => {
        const d = new Date(mine?.at ?? new Date());
        d.setMonth(d.getMonth() + (facts.p?.review_months ?? 12));
        return d;
      })();
  return assemble(facts, { version: opts.version, title: opts.title, companyName: opts.companyName, versions, nextReview, current });
}
