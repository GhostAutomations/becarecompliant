import "server-only";

/**
 * Be Care Compliant — the training courses the Documents Upload offers for a certificate
 * (Phil, 2026-10-09). The certificate is then saved by the Training register's own save
 * (saveTraining), so this only decides what to offer, by the same rules that register uses:
 *   - only to someone who may record this person's training (canRecordTraining, the
 *     transcription of person_training_write), never in support mode;
 *   - only active courses that apply to this person's job title, as on the matrix;
 *   - not for a leaver, who has left the matrix.
 * The person's own record of each course is read through the caller's client, so RLS decides.
 */

import { createClient } from "@/lib/supabase/server";
import { canRecordTraining } from "@/lib/auth/manage-scope";
import { courseAppliesToTitle } from "@/lib/training/probation-group";
import type { CertificateCourse } from "./types";

export async function getCertificateCourses(opts: {
  personId: string;
  companyId: string;
  jobTitle: string | null;
  recordBranchId: string | null;
  role: string;
  branchIds: string[];
  supportMode: boolean;
  isLeaver: boolean;
}): Promise<CertificateCourse[]> {
  if (opts.supportMode || opts.isLeaver) return [];
  if (!canRecordTraining({ role: opts.role, branchIds: opts.branchIds, recordBranchId: opts.recordBranchId })) return [];

  const supabase = await createClient();
  const [{ data: courses }, { data: rows }] = await Promise.all([
    supabase
      .from("training_courses")
      .select("id, name, renewal_months, job_titles, sort_order")
      .eq("company_id", opts.companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("person_training")
      .select("course_id, completed_on, expiry_on, booked_for, certificate_path")
      .eq("person_id", opts.personId),
  ]);
  const mine = new Map(
    ((rows ?? []) as Array<{ course_id: string; completed_on: string | null; expiry_on: string | null; booked_for: string | null; certificate_path: string | null }>).map(
      (r) => [r.course_id, r],
    ),
  );
  return ((courses ?? []) as Array<{ id: string; name: string; renewal_months: number | null; job_titles: string[] | null }>)
    .filter((c) => courseAppliesToTitle(c.job_titles, opts.jobTitle))
    .map((c) => {
      const r = mine.get(c.id);
      return {
        id: c.id,
        name: c.name,
        renewalMonths: c.renewal_months,
        completedOn: r?.completed_on ?? null,
        expiryOn: r?.expiry_on ?? null,
        bookedFor: r?.booked_for ?? null,
        hasCertificate: !!r?.certificate_path,
      };
    });
}
