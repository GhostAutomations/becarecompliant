import "server-only";

/**
 * Be Care Compliant — a written policy, rendered to PDF ON DEMAND.
 *
 * Phil, 2026-07-27: the reader showed the corrected formatting but the saved PDF
 * still had the old one, with "some bold, some not" on the numbered sections.
 * That was inevitable: the PDF was frozen at save time, so it carried whatever
 * the parser understood on the day it was written, and no later improvement
 * could ever reach it.
 *
 * So a written policy is no longer served from a stored file. The WORDING is
 * frozen per version in company_policy_versions.body — that is the thing a
 * signature is against — and the PDF is drawn from it whenever somebody asks for
 * it. Identical to how the evidence PDF already works: frozen data, deterministic
 * render, nothing to go stale in a bucket.
 *
 * (A copy is still written to storage at save time so exports and anything else
 * reading storage_path keep working, but it is never what a reader is served.)
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { parsePolicyText } from "@/lib/policies/text";
import { renderPolicyPdf } from "@/lib/policies/pdf";

/**
 * Render one version of a written policy. Pass a version to reproduce exactly
 * what somebody signed; omit it for the current wording.
 */
export async function renderWrittenPolicy(
  policyId: string,
  version?: number | null,
): Promise<{ ok: true; pdf: Buffer; title: string } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const { data: policy } = await admin
    .from("company_policies")
    .select("id, company_id, title, body, version, source, companies:company_id(name)")
    .eq("id", policyId)
    .maybeSingle();
  if (!policy) return { ok: false, error: "That policy could not be found." };
  if (policy.source !== "text") return { ok: false, error: "That policy is an uploaded document." };

  const wanted = version ?? (policy.version as number);
  let body = policy.body as string | null;

  // The wording AS SIGNED, when an older version is asked for.
  if (wanted !== policy.version) {
    const { data: v } = await admin
      .from("company_policy_versions")
      .select("body")
      .eq("policy_id", policyId)
      .eq("version", wanted)
      .maybeSingle();
    if (v?.body) body = v.body as string;
  }
  if (!body || !body.trim()) return { ok: false, error: "That version has no stored wording." };

  const company = (Array.isArray(policy.companies) ? policy.companies[0] : policy.companies) as
    | { name: string }
    | null;

  const pdf = await renderPolicyPdf({
    companyName: company?.name ?? "Your company",
    title: policy.title as string,
    version: wanted,
    blocks: parsePolicyText(body),
    savedAt: new Date(),
  });
  return { ok: true, pdf, title: policy.title as string };
}
