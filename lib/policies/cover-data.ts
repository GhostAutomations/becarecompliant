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
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import {
  addMonthsClamped,
  cleanChangeSummary,
  cleanReference,
  coverFromForm,
  coverReview,
  documentColours,
  londonIso,
  middayOf,
  nameWithRole,
  ordinalDate,
  referencePrefix,
  reviewReasonFrom,
  type CoverPage,
  type DocumentColours,
  type FrozenCover,
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

/** Give an automatic reference back when the policy it was given to was not saved. Only the last
 *  number given can go back (0411 release_policy_reference), so nothing is ever given twice. */
export async function releaseReference(companyId: string, reference: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("release_policy_reference", { cid: companyId, p_reference: reference });
  } catch (e) {
    console.error("[policies] reference not given back", { reference, error: (e as Error).message });
  }
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
  cover: FrozenCover | null;
};
type Db = Pick<Awaited<ReturnType<typeof createClient>>, "from">;
type Person = { id: string; full_name: string | null; role: string };

/** Everything stored about a policy that its cover prints, read with the given client. */
async function loadCoverFacts(db: Db, policyId: string, extraPeople: string[] = []) {
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
      .select("version, created_at, change_summary, review_reason, approved_by_name, approved_by_role, cover")
      .eq("policy_id", policyId)
      .order("version"),
  ]);
  const ids = [p?.owner_id, p?.approver_id, ...extraPeople].filter((x): x is string => Boolean(x));
  const { data: people } = ids.length
    ? await db.from("profiles").select("id, full_name, role").in("id", ids)
    : { data: [] as Person[] };
  const who = new Map(((people as Person[] | null) ?? []).map((x) => [x.id, x]));
  return { p, versions: ((versions as VersionRow[] | null) ?? []), who };
}

/* The company's logo and colours as they are now. Read with the service client: the logo sits in
   the private bucket and the colours on the company row, and the caller has already been allowed
   to see this policy. */
async function liveBranding(companyId: string | null | undefined): Promise<{ logoDataUrl: string | null; colours: DocumentColours }> {
  if (!companyId) return { logoDataUrl: null, colours: documentColours(null, null) };
  const admin = createServiceClient();
  const [{ data: co }, logo] = await Promise.all([
    admin.from("companies").select("brand_primary, brand_secondary").eq("id", companyId).maybeSingle<{ brand_primary: string | null; brand_secondary: string | null }>(),
    getCompanyLogoDataUrl(companyId).catch(() => null),
  ]);
  return { logoDataUrl: logo, colours: documentColours(co?.brand_primary, co?.brand_secondary) };
}

/** A logo copy kept with a version, as a data URL (null when there is none or it cannot be read). */
async function frozenLogo(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await createServiceClient().storage.from(EVIDENCE_BUCKET).download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const mime = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Copy the company logo beside a version, so its cover keeps the logo of the day it was approved. */
export async function keepLogoForVersion(companyId: string, policyId: string, version: number): Promise<string | null> {
  try {
    const admin = createServiceClient();
    const { data: co } = await admin.from("companies").select("logo_path").eq("id", companyId).maybeSingle<{ logo_path: string | null }>();
    const src = co?.logo_path;
    if (!src) return null;
    const ext = (src.match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png").toLowerCase();
    const dest = `${companyId}/policies/${policyId}/v${version}-logo.${ext}`;
    const { error } = await admin.storage.from(EVIDENCE_BUCKET).copy(src, dest);
    if (error && !/exists/i.test(error.message)) return null;
    return dest;
  } catch {
    return null;
  }
}

function roleLabel(role: string | null | undefined): string | null {
  return role ? (ROLE_LABELS[role] ?? role) : null;
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

function history(versions: VersionFact[], upTo: number): CoverPage["history"] {
  return versions
    .filter((v) => v.version <= upTo)
    .sort((a, b) => a.version - b.version)
    .map((v) => ({
      version: v.version,
      date: ordinalDate(v.at),
      change: v.changeSummary ?? (v.version === 1 ? "First issue" : "Not recorded"),
      approvedBy: v.approvedByName,
    }));
}

/**
 * The cover for a version being approved NOW (it is not in company_policy_versions yet): today's
 * date, the chosen approver (or, when none is chosen, the person approving it), and the reason
 * and changes given on approval. Also returns the frozen cover to store with the version.
 */
export async function buildCoverPage(opts: {
  policyId: string;
  version: number;
  title: string;
  companyName: string;
  changeSummary: string;
  reviewReason: string;
  /** Who is saving it, named as approver when nobody is chosen (review, 2026-10-07). */
  actorId: string;
  /** The logo copy kept with this version (keepLogoForVersion). */
  logoPath: string | null;
}): Promise<{ cover: CoverPage; frozen: FrozenCover; approvedByName: string | null; approvedByRole: string | null }> {
  const supabase = await createClient();
  const facts = await loadCoverFacts(supabase, opts.policyId, [opts.actorId]);
  const { p, who } = facts;
  const approver = (p?.approver_id ? who.get(p.approver_id) : undefined) ?? who.get(opts.actorId);
  const approvedByName = approver?.full_name ?? null;
  const approvedByRole = roleLabel(approver?.role);
  const now = new Date();
  const nextReviewIso = addMonthsClamped(londonIso(now), p?.review_months ?? 12);
  const branding = await liveBranding(p?.company_id);
  const logoDataUrl = (await frozenLogo(opts.logoPath)) ?? branding.logoDataUrl;
  const versions: VersionFact[] = [
    ...toFacts(facts.versions).filter((v) => v.version < opts.version),
    { version: opts.version, at: now, changeSummary: opts.changeSummary, reviewReason: opts.reviewReason, approvedByName, approvedByRole },
  ];
  const frozen: FrozenCover = {
    reference: p?.reference ?? null,
    approvedBy: nameWithRole(approvedByName, approvedByRole),
    owner: p?.owner_id ? (who.get(p.owner_id)?.full_name ?? null) : null,
    appliesTo: p?.applies_to ?? "All staff",
    readBy: p?.read_by ?? "As set in Briefings",
    retention: p?.retention ?? "Kept for 8 years after it is replaced",
    classification: p?.classification ?? "Internal",
    nextReviewIso,
    colours: branding.colours,
    logoPath: opts.logoPath,
  };
  const cover: CoverPage = {
    reference: frozen.reference,
    title: opts.title,
    companyName: opts.companyName,
    version: opts.version,
    approvedOn: ordinalDate(now),
    approvedBy: frozen.approvedBy,
    owner: frozen.owner,
    nextReview: ordinalDate(middayOf(nextReviewIso)),
    appliesTo: frozen.appliesTo,
    readBy: frozen.readBy,
    retention: frozen.retention,
    classification: frozen.classification,
    history: history(versions, opts.version),
    logoDataUrl,
    colours: frozen.colours,
    review: coverReview({ version: opts.version, versions, nextReview: middayOf(nextReviewIso) }),
  };
  return { cover, frozen, approvedByName, approvedByRole };
}

/**
 * THE COVER FOR A VERSION ALREADY SAVED. A written policy is drawn fresh whenever someone opens it
 * (lib/policies/render.ts), so its cover is built from what was frozen when that version was
 * approved (Phil, 2026-10-07: "As it was at that version"). A version saved before covers were
 * frozen falls back to the policy's settings now. render.ts passes the service client, having
 * already checked the reader may see the policy.
 */
export async function coverForSavedVersion(
  db: Db,
  opts: { policyId: string; version: number; title: string; companyName: string; currentVersion: number },
): Promise<CoverPage> {
  const facts = await loadCoverFacts(db, opts.policyId);
  const { p, who } = facts;
  const rows = facts.versions;
  const versions = toFacts(rows);
  const mineRow = rows.find((v) => v.version === opts.version);
  const mine = versions.find((v) => v.version === opts.version);
  const at = mine?.at ?? new Date();
  const current = opts.version === opts.currentVersion;
  const frozen = mineRow?.cover ?? null;

  /* Next review: the current version follows the policy's own date (it moves on with "Reviewed,
     no changes needed"); an older version keeps the date it had. */
  const ownIso =
    frozen?.nextReviewIso ?? addMonthsClamped(londonIso(at), p?.review_months ?? 12);
  const nextIso = current && p?.review_due_on && /^\d{4}-\d{2}-\d{2}$/.test(p.review_due_on) ? p.review_due_on : ownIso;

  const branding = frozen ? null : await liveBranding(p?.company_id);
  const logoDataUrl = frozen ? await frozenLogo(frozen.logoPath) : branding!.logoDataUrl;
  const approver = p?.approver_id ? who.get(p.approver_id) : undefined;
  const approvedBy =
    frozen?.approvedBy ??
    (mine?.approvedByName ? nameWithRole(mine.approvedByName, mine.approvedByRole) : nameWithRole(approver?.full_name, roleLabel(approver?.role)));
  const laterReview =
    current && p?.last_reviewed_on && /^\d{4}-\d{2}-\d{2}$/.test(p.last_reviewed_on)
      ? { on: middayOf(p.last_reviewed_on), byName: p.last_reviewed_by_name, byRole: p.last_reviewed_by_role }
      : null;
  return {
    reference: frozen?.reference ?? p?.reference ?? null,
    title: opts.title,
    companyName: opts.companyName,
    version: opts.version,
    approvedOn: ordinalDate(at),
    approvedBy,
    owner: frozen ? frozen.owner : p?.owner_id ? (who.get(p.owner_id)?.full_name ?? null) : null,
    nextReview: ordinalDate(middayOf(nextIso)),
    appliesTo: frozen?.appliesTo ?? p?.applies_to ?? "All staff",
    readBy: frozen?.readBy ?? p?.read_by ?? "As set in Briefings",
    retention: frozen?.retention ?? p?.retention ?? "Kept for 8 years after it is replaced",
    classification: frozen?.classification ?? p?.classification ?? "Internal",
    history: history(versions, opts.version),
    logoDataUrl,
    colours: frozen?.colours ?? branding!.colours,
    review: coverReview({ version: opts.version, versions, nextReview: middayOf(nextIso), laterReview }),
  };
}

/**
 * THE COVER FOR A DRAFT NOT YET APPROVED (Preview as PDF; Phil, 2026-10-07: "during the creation
 * process, there's no preview option"). Built from what the approval form holds right now, with
 * the same choices the approval would store, so the preview matches the approved copy.
 *
 * Nothing is stored and NO REFERENCE NUMBER IS SPENT (next_policy_reference gives numbers out with
 * no gaps, so asking it for one here would burn one): a new policy prints only a reference you
 * typed, the next version of a policy keeps that policy's. "Approved on" says it is not approved
 * yet, so a printed preview can never pass for the real document.
 */
export async function previewCoverPage(opts: {
  companyId: string;
  companyName: string;
  title: string;
  fd: FormData;
  /** The person previewing, named as approver when nobody is chosen, as the approval would. */
  actorId: string;
  /** The policy this becomes the next version of, or null for a new policy. */
  targetPolicyId: string | null;
}): Promise<{ cover: CoverPage; version: number }> {
  const supabase = await createClient();
  const fd = opts.fd;
  const target = opts.targetPolicyId;
  const coverOnForm = fd.get("cover_present") === "1";
  const c = coverFromForm((k) => fd.get(k));
  const facts = target ? await loadCoverFacts(supabase, target) : null;
  const p = facts?.p ?? null;

  let version = 1;
  if (target) {
    const { data } = await supabase.from("company_policies").select("version").eq("id", target).maybeSingle<{ version: number | null }>();
    version = (data?.version ?? 1) + 1;
  }

  /* The same people the approval names: the approver chosen on the form (nobody chosen means the
     person approving), and the owner chosen, or the policy's own when it is a new version. */
  const approverId = coverOnForm ? c.approver_id : (p?.approver_id ?? null);
  const ownerId = String(fd.get("owner_id") ?? "").trim() || p?.owner_id || null;
  const ids = [approverId, ownerId, opts.actorId].filter((x): x is string => Boolean(x));
  /* People in the company, and the person previewing even when they are not (the founder managing
     the company), who is named as approver when nobody is chosen, as buildCoverPage does. */
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", ids)
    .or(`company_id.eq.${opts.companyId},id.eq.${opts.actorId}`);
  const who = new Map(((people as Person[] | null) ?? []).map((x) => [x.id, x]));
  const approver = (approverId ? who.get(approverId) : undefined) ?? who.get(opts.actorId);
  const approvedByName = approver?.full_name ?? null;
  const approvedByRole = roleLabel(approver?.role);

  const now = new Date();
  const nextReviewIso = addMonthsClamped(londonIso(now), p?.review_months ?? 12);
  const branding = await liveBranding(opts.companyId);
  const versions: VersionFact[] = [
    ...(facts ? toFacts(facts.versions).filter((v) => v.version < version) : []),
    {
      version,
      at: now,
      changeSummary: cleanChangeSummary(fd.get("change_summary"), target ? "Updated" : "First issue"),
      reviewReason: reviewReasonFrom(fd.get("review_reason"), !target),
      approvedByName,
      approvedByRole,
    },
  ];
  const cover: CoverPage = {
    /* A typed reference is used on a new version too (updateWrittenPolicy). With none typed, a new
       version keeps its own; one with no reference yet is given a number on approval, never here. */
    reference: cleanReference(fd.get("reference")) ?? (target ? (p?.reference ?? null) : null),
    title: opts.title,
    companyName: opts.companyName,
    version,
    approvedOn: "Not yet approved",
    approvedBy: nameWithRole(approvedByName, approvedByRole),
    owner: ownerId ? (who.get(ownerId)?.full_name ?? null) : null,
    nextReview: ordinalDate(middayOf(nextReviewIso)),
    appliesTo: coverOnForm ? c.applies_to : (p?.applies_to ?? "All staff"),
    readBy: coverOnForm ? c.read_by : (p?.read_by ?? "As set in Briefings"),
    retention: coverOnForm ? c.retention : (p?.retention ?? "Kept for 8 years after it is replaced"),
    classification: coverOnForm ? c.classification : (p?.classification ?? "Internal"),
    history: history(versions, version),
    logoDataUrl: branding.logoDataUrl,
    colours: branding.colours,
    review: coverReview({ version, versions, nextReview: middayOf(nextReviewIso) }),
  };
  return { cover, version };
}
