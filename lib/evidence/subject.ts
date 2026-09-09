import "server-only";

/**
 * Be Care Compliant — who a piece of Evidence is ABOUT.
 *
 * Phil, 2026-09-09, on opening evidence reference 480DE2E4: "i cant see joe bloggs
 * name anywhere on the pdf, so that form is essentially anonimous so the the CQC or
 * local authority go in and want to see paperwork, it is all pointless".
 *
 * He was right. The evidence PDF printed the company, the branch, who completed it,
 * when, the form version and the reference — and nothing that said whose check it was.
 * A Spot Check that does not name the care worker is not evidence of anything. The app
 * always knew: every Evidence row carries record_type and record_id. It simply never
 * put it on the paper.
 *
 * This module is the ONE place those two columns become a name, so the single PDF, the
 * emailed copy and the Evidence pack can never disagree about whose record it is.
 *
 * Read with the service role ON PURPOSE. The caller has already authorised the Evidence
 * row through its own RLS read; this is the name attached to that row, and resolving it
 * must not fail for a reason unrelated to permission. A subject that cannot be resolved
 * is never quietly blanked — see notOnFile.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { labelFor, notOnFile, type EvidenceRecordType, type EvidenceSubject } from "./subject-format";

export { describeSubject, labelFor, notOnFile } from "./subject-format";
export type { EvidenceRecordType, EvidenceSubject } from "./subject-format";

/** Resolve the subject of one Evidence row. Never throws. */
export async function loadEvidenceSubject(
  kind: EvidenceRecordType,
  recordId: string,
): Promise<EvidenceSubject> {
  try {
    const admin = createServiceClient();

    if (kind === "person") {
      const { data } = await admin
        .from("people")
        .select("full_name, job_title, scw_registration_number")
        .eq("id", recordId)
        .maybeSingle<{
          full_name: string;
          job_title: string | null;
          scw_registration_number: string | null;
        }>();
      if (!data?.full_name) return notOnFile(kind, recordId);
      return {
        kind,
        label: labelFor(kind),
        name: data.full_name,
        reference: data.scw_registration_number ? `SCW ${data.scw_registration_number}` : null,
        detail: data.job_title,
      };
    }

    if (kind === "service_user") {
      const { data } = await admin
        .from("service_users")
        .select("full_name, ssid")
        .eq("id", recordId)
        .maybeSingle<{ full_name: string; ssid: string | null }>();
      if (!data?.full_name) return notOnFile(kind, recordId);
      return {
        kind,
        label: labelFor(kind),
        name: data.full_name,
        reference: data.ssid ? `SSID ${data.ssid}` : null,
        detail: null,
      };
    }

    const { data } = await admin
      .from("complaints")
      .select("subject")
      .eq("id", recordId)
      .maybeSingle<{ subject: string | null }>();
    if (!data?.subject) return notOnFile(kind, recordId);
    return { kind, label: labelFor(kind), name: data.subject, reference: null, detail: null };
  } catch {
    return notOnFile(kind, recordId);
  }
}
