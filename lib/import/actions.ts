"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { validateImport, type ValidateResult } from "./parse";
import { commitPeople, commitServiceUsers, type CommitResult, type ImportFlags } from "./commit";
import { importSummaryEmail } from "./email";

type Pop = "people" | "service_users";
function normPop(p: string): Pop | null {
  return p === "people" || p === "service_users" ? p : null;
}

export type CommitOutcome = {
  ok: boolean;
  message: string;
  flags?: ImportFlags;
  emailNote?: string;
};

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

async function companyAdminEmails(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("company_id", companyId)
    .eq("role", "company_admin")
    .eq("status", "active");
  return ((data as Array<{ email: string | null }> | null) ?? [])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));
}

export async function commitImportAction(
  population: string,
  csvText: string,
): Promise<CommitOutcome> {
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
  const flags: ImportFlags = {
    skipped: result.skipped,
    errored: result.errored,
  };
  const flagCount = flags.skipped.length + flags.errored.length;

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "records.imported",
    entityType: pop === "people" ? "person" : "service_user",
    entityId: null,
    summary: `Bulk imported ${result.created} ${pop === "people" ? "people" : "service users"}`,
    metadata: {
      created: result.created,
      skipped: flags.skipped.length,
      errors: flags.errored.length,
    },
  });

  revalidatePath(pop === "people" ? "/people" : "/service-users");

  // When anything was flagged, email the Company Admins a branded summary.
  let emailNote: string | undefined;
  if (flagCount > 0) {
    const { data: co } = await (await createClient())
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .maybeSingle();
    const { subject, html } = importSummaryEmail({
      companyName: (co?.name as string | null) ?? "your company",
      population: pop,
      created: result.created,
      flags,
    });
    if (!resendConfigured()) {
      emailNote = "Summary email not sent: email is not set up for this environment yet.";
    } else {
      const admins = await companyAdminEmails(profile.company_id);
      const targets = admins.length > 0 ? admins : [profile.email];
      const results = await Promise.all(targets.map((to) => sendEmail({ to, subject, html })));
      const anySent = results.some((r) => r.sent);
      emailNote = anySent
        ? `Summary emailed to the Company ${admins.length === 1 ? "Admin" : "Admins"}.`
        : "Summary email could not be sent.";
    }
  }

  const parts = [`Created ${result.created}`];
  if (flags.skipped.length) parts.push(`skipped ${flags.skipped.length} existing`);
  if (flags.errored.length) parts.push(`${flags.errored.length} could not be added`);
  return { ok: true, message: `${parts.join(", ")}.`, flags, emailNote };
}
