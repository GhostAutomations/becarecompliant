"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { validateImport, type ValidateResult } from "./parse";
import { commitPeople, commitServiceUsers, type CommitResult } from "./commit";

type Pop = "people" | "service_users";
function normPop(p: string): Pop | null {
  return p === "people" || p === "service_users" ? p : null;
}

export async function validateImportAction(
  population: string,
  csvText: string,
): Promise<ValidateResult> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { ok: false, error: "No company context." };
  const pop = normPop(population);
  if (!pop) return { ok: false, error: "Choose People or Service Users." };
  return validateImport(profile.company_id, pop, csvText);
}

export async function commitImportAction(
  population: string,
  csvText: string,
): Promise<{ ok: boolean; message: string }> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { ok: false, message: "No company context." };
  const pop = normPop(population);
  if (!pop) return { ok: false, message: "Choose People or Service Users." };

  const res = await validateImport(profile.company_id, pop, csvText);
  if (!res.ok) return { ok: false, message: res.error };

  const result: CommitResult =
    pop === "people"
      ? await commitPeople(profile.company_id, user.id, res.rows)
      : await commitServiceUsers(profile.company_id, user.id, res.rows);

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "records.imported",
    entityType: pop === "people" ? "person" : "service_user",
    entityId: null,
    summary: `Bulk imported ${result.created} ${pop === "people" ? "people" : "service users"}`,
    metadata: { created: result.created, skipped: result.skipped, errors: result.errors },
  });

  revalidatePath(pop === "people" ? "/people" : "/service-users");

  const parts = [`Created ${result.created}`];
  if (result.skipped) parts.push(`skipped ${result.skipped} existing`);
  if (result.errors) parts.push(`${result.errors} could not be added`);
  return { ok: true, message: `${parts.join(", ")}.` };
}
