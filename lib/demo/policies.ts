import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { parsePolicyText } from "@/lib/policies/text";
import { renderPolicyPdf } from "@/lib/policies/pdf";
import { storePolicyBytes } from "@/lib/assignments/storage";

/**
 * THE DEMO'S SAMPLE POLICIES (0359). seed_demo_company writes four written policies with their
 * wording and a storage path of "pending", exactly as a newly written policy starts. This draws
 * each one's PDF, stores it and records version 1, the same three steps a founder or Admin writing
 * a policy goes through (freezeWrittenVersion), so reading, signing and exporting them all work.
 *
 * Idempotent: only policies still "pending" are touched, so running it twice changes nothing.
 * Returns the problems, never throws: a demo whose policy PDFs could not be drawn is still a demo.
 */
export async function finishDemoPolicies(companyId: string, actorId: string): Promise<string[]> {
  const admin = createServiceClient();
  const problems: string[] = [];
  const { data: rows } = await admin
    .from("company_policies")
    .select("id, title, body, file_name, version")
    .eq("company_id", companyId)
    .eq("source", "text")
    .eq("storage_path", "pending");
  for (const p of (rows as Array<{ id: string; title: string; body: string | null; file_name: string; version: number | null }> | null) ?? []) {
    const body = p.body ?? "";
    try {
      const pdf = await renderPolicyPdf({
        companyName: "Demo Care Company Limited",
        title: p.title,
        version: p.version ?? 1,
        blocks: parsePolicyText(body),
        savedAt: new Date(),
      });
      const stored = await storePolicyBytes(companyId, p.id, p.file_name, pdf);
      if (!stored.ok) {
        problems.push(`${p.title}: ${stored.error}`);
        continue;
      }
      const { error: verErr } = await admin.from("company_policy_versions").insert({
        policy_id: p.id,
        version: p.version ?? 1,
        storage_path: stored.path,
        file_name: p.file_name,
        mime_type: "application/pdf",
        bytes: pdf.length,
        body,
        created_by: actorId,
      });
      if (verErr) {
        problems.push(`${p.title}: ${verErr.message}`);
        continue;
      }
      const { error: polErr } = await admin
        .from("company_policies")
        .update({ storage_path: stored.path, bytes: pdf.length, created_by: actorId, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (polErr) problems.push(`${p.title}: ${polErr.message}`);
    } catch (e) {
      problems.push(`${p.title}: ${(e as Error).message}`);
    }
  }
  return problems;
}
