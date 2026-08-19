"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { validateImport, type ValidateResult } from "./parse";
import { commitPeople, commitServiceUsers, type CommitResult, type ImportFlags } from "./commit";
import { importSummaryEmail } from "./email";
import {
  validateTrainingImport,
  commitTrainingImport,
  type TrainingValidateResult,
} from "./training";

type Pop = "people" | "service_users";
function normPop(p: string): Pop | null {
  return p === "people" || p === "service_users" ? p : null;
}

export type CommitOutcome = {
  ok: boolean;
  message: string;
  flags?: ImportFlags;
  emailNote?: string;
  /**
   * Training only. The preview warns about a renamed or unrecognised course column, and the
   * preview is cleared the moment Import succeeds. Carried through so the warning survives the
   * import that it is warning about.
   */
  columnNotes?: { unknown: string[]; missing: string[] };
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
  /** Tick on the import screen: create the Team Member logins but hold their emails. */
  holdEmail = false,
): Promise<CommitOutcome> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { ok: false, message: "No company context." };
  const pop = normPop(population);
  if (!pop) return { ok: false, message: "Choose People or Service Users." };

  const res = await validateImport(profile.company_id, pop, csvText);
  if (!res.ok) return { ok: false, message: res.error };

  const result: CommitResult =
    pop === "people"
      ? await commitPeople(
          profile.company_id,
          user.id,
          res.rows,
          {
            id: user.id,
            name: profile.full_name,
            email: profile.email,
            role: profile.role,
          },
          holdEmail,
        )
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
      invited: result.invited ?? 0,
      not_invited: result.notInvited ?? 0,
      logins_held: holdEmail,
      invite_failed: result.inviteFailed?.length ?? 0,
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
  if (result.invited) parts.push(`invited ${result.invited} to their own login`);
  if (result.policiesGiven) {
    parts.push(`sent ${result.policiesGiven} policies to sign`);
  }
  if (result.notInvited) {
    parts.push(
      `${result.notInvited} had a demo address (example.com and similar) so were not emailed`,
    );
  }
  if (result.inviteFailed?.length) {
    parts.push(`${result.inviteFailed.length} could not be invited`);
  }
  if (flags.skipped.length) parts.push(`skipped ${flags.skipped.length} existing`);
  if (flags.errored.length) parts.push(`${flags.errored.length} could not be added`);
  return { ok: true, message: `${parts.join(", ")}.`, flags, emailNote };
}

/**
 * Training import, kept as its own pair rather than bent into the People one.
 *
 * The shapes genuinely differ: training never creates a carer, its cells hold renewal dates
 * rather than completions, and its preview reports unrecognised columns. Forcing all that
 * through validateImport would have made the working import harder to read for no gain.
 */
export async function validateTrainingImportAction(csvText: string): Promise<TrainingValidateResult> {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { ok: false, error: "No company context." };
  return validateTrainingImport(profile.company_id, csvText);
}

export async function commitTrainingImportAction(csvText: string): Promise<CommitOutcome> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { ok: false, message: "No company context." };

  // Re-validated on the server: the preview the browser saw is not what authorises the write.
  const res = await validateTrainingImport(profile.company_id, csvText);
  if (!res.ok) return { ok: false, message: res.error };

  const out = await commitTrainingImport(profile.company_id, res.rows, user.id);

  /*
   * The preview names every row it refused, and then the preview DISAPPEARS the moment Import is
   * pressed. Without this, a manager sees "Imported 2 training records for 2 carers" and has no
   * way to know five other carers were skipped for a stale column, a duplicate name or a branch
   * that does not exist. People and Service Users already report this; Training now matches them.
   */
  const rejected = res.rows.filter((r) => r.status === "error");
  const flags: ImportFlags = {
    skipped: [],
    errored: rejected.map((r) => ({ name: r.name || `Row ${r.row}`, errors: r.errors })),
  };
  /*
   * A batch Postgres refused is a different failure from a row the preview refused, but the person
   * reading the screen needs both. One line PER CARER, not one line per batch, so the panel names
   * everybody who is missing. The driver message goes to the server log: "duplicate key value
   * violates unique constraint" is not something a care manager can act on.
   */
  const writeFailed: ImportFlags["errored"] = [];
  for (const f of out.failures) {
    console.error("[import] training batch failed:", f.error);
    for (const n of f.names) {
      writeFailed.push({
        name: n,
        errors: ["Could not be saved. Nothing was changed for this carer, so you can upload again."],
      });
    }
  }
  flags.errored.push(...writeFailed);
  const columnNotes = { unknown: res.unknownColumns, missing: res.missingColumns };
  const notAdded = flags.errored.length;

  if (out.written === 0) {
    // Audited even though nothing was written: an import where EVERY row was refused is the one
    // an inspector most needs to see, and it would otherwise leave no trace at all.
    await writeAudit({
      companyId: profile.company_id,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "training.imported",
      entityType: "training_course",
      summary: `Training import added nothing, ${notAdded} ${notAdded === 1 ? "row" : "rows"} refused`,
      metadata: { records: 0, carers: 0, failures: out.failures.length, rejected: notAdded },
    });
    /*
     * Nothing was written, so the PREVIEW IS STILL ON SCREEN: it already names every refused row
     * and every column we did not recognise. Repeating that here would print all of it twice. Only
     * a batch the database refused is new information, because the preview passed those rows.
     */
    return {
      ok: false,
      message:
        writeFailed.length > 0
          ? "Nothing was saved. Please check the carers listed and upload again."
          : "Nothing was imported. Check the rows below, fix them in the sheet and upload again.",
      flags: { skipped: [], errored: writeFailed },
    };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "training.imported",
    entityType: "training_course",
    summary: `Imported ${out.written} training records for ${out.carers} carers`,
    metadata: {
      records: out.written,
      carers: out.carers,
      failures: out.failures.length,
      // An import that skipped five rows must not read as a clean import on the Audit trail.
      rejected: notAdded,
    },
  });

  revalidatePath("/people/training");
  // ONE number, and it is the number of lines the panel below shows, so counting them agrees.
  const skipped =
    notAdded > 0 ? ` ${notAdded} ${notAdded === 1 ? "row was" : "rows were"} not added.` : "";
  return {
    ok: true,
    message: `Imported ${out.written} training records for ${out.carers} ${out.carers === 1 ? "carer" : "carers"}.${skipped}`,
    flags,
    columnNotes,
  };
}
