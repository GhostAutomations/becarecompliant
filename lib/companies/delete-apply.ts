import "server-only";

/**
 * Be Care Compliant — deleting a company, for real.
 *
 * The rules live in lib/companies/deletion.ts (pure, unit tested). This file carries them
 * out. Two stages, agreed with Phil on 2026-08-18:
 *
 *   1. DELETE — the company disappears, every login of theirs stops working, and any live
 *      Stripe subscription is cancelled immediately. Nothing is erased. A tombstone row is
 *      written to company_deletions.
 *   2. PURGE — thirty days later, or when the founder presses Purge now: the storage objects,
 *      the auth users, the audit trail and every row of the tenant are erased, and the
 *      tombstone records what was actually removed.
 *
 * WHY THE ORDER INSIDE A PURGE IS WHAT IT IS. The files go first, then the logins, then the
 * rows, then the company. Deleting the company row first would CASCADE away the evidence rows
 * that name the objects in the bucket, and the objects would survive with nothing left
 * pointing at them — which is exactly the defect the retention work found in August ("an
 * anonymised record kept a full PDF of itself in the bucket"). Erasure has to be done in the
 * order that never loses the pointer before the thing it points at.
 *
 * AND IT CHECKS AFTERWARDS. A purge counts what is left when it has finished — objects under
 * the company's prefix, profiles still carrying its id, people rows — and records the answer.
 * "The delete statement returned no error" is not evidence that anything went.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { cancelSubscriptionNow } from "@/lib/billing/stripe-sync";
import {
  GRACE_DAYS,
  purgeAfterFrom,
  deleteRefusal,
  restoreRefusal,
  purgeRefusal,
} from "@/lib/companies/deletion";

/**
 * Every bucket that holds tenant files, keyed by company id as the first path segment.
 * Checked against storage.buckets on 2026-08-18: these are the only two that exist. A new
 * bucket added later MUST be added here, or a purge will leave its files behind — which is
 * why the purge counts what remains rather than trusting this list.
 */
export const COMPANY_BUCKETS = ["evidence", "absence-policies"] as const;

export type Actor = { id: string; email: string | null };

type CompanyRow = {
  id: string;
  name: string;
  slug: string | null;
  tier: string | null;
  regulator: string | null;
  status: string | null;
  purge_after: string | null;
};

/** What the company holds right now, for the tombstone. Head counts, so it stays cheap. */
export async function countCompanyContents(companyId: string): Promise<Record<string, number>> {
  const supabase = createServiceClient();
  const tables = [
    "branches",
    "profiles",
    "people",
    "service_users",
    "evidence",
    "check_instances",
    "complaints",
    "incidents",
    "invoices",
    "company_policies",
    "audit_log",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);
    // A count that failed is recorded as -1, never as 0. Zero is a claim about the data;
    // a failed query is a claim about the query, and the two must not look the same.
    counts[table] = error ? -1 : (count ?? 0);
  }
  return counts;
}

/** Every object under a company's prefix in one bucket. Storage lists one folder at a time. */
async function listCompanyObjects(bucket: string, companyId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const paths: string[] = [];
  const queue: string[] = [companyId];
  while (queue.length) {
    const prefix = queue.shift() as string;
    let offset = 0;
    // Paged, because a long standing customer's evidence folder is not 100 files.
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 100, offset });
      if (error) throw new Error(`${bucket}: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const full = `${prefix}/${entry.name}`;
        // Supabase marks a folder by returning no id / no metadata for it.
        if (entry.id === null || entry.id === undefined) queue.push(full);
        else paths.push(full);
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  return paths;
}

/* ===========================================================================
 * STAGE ONE — delete
 * =========================================================================== */

export type DeleteOutcome =
  | { ok: false; error: string }
  | { ok: true; message: string; purgeAfter: string; stripeCancelled: boolean };

export async function softDeleteCompany(input: {
  companyId: string;
  typedName: string;
  actor: Actor;
  isFounder: boolean;
}): Promise<DeleteOutcome> {
  const supabase = createServiceClient();

  const { data, error: readError } = await supabase
    .from("companies")
    .select("id, name, slug, tier, regulator, status, purge_after")
    .eq("id", input.companyId)
    .maybeSingle();
  // A failed read and a missing row mean different things, and only one of them is the
  // founder's problem.
  if (readError) return { ok: false, error: "Could not read that company just now. Try again." };
  const company = (data as CompanyRow | null) ?? null;
  if (!company) return { ok: false, error: "That company no longer exists." };

  const refusal = deleteRefusal({
    typedName: input.typedName,
    companyName: company.name,
    status: company.status,
    isFounder: input.isFounder,
  });
  if (refusal) return { ok: false, error: refusal };

  const counts = await countCompanyContents(company.id);

  // Stripe BEFORE the status write, and on purpose. If the status write fails after Stripe was
  // cancelled, the founder sees a refusal and a company still standing — annoying, and fixable
  // by subscribing again. The other order risks a company that is gone from the product and
  // still being charged every month, which is the failure nobody notices until a statement.
  const { data: billingData } = await supabase
    .from("company_billing")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("company_id", company.id)
    .maybeSingle();
  const billing = (billingData ?? null) as {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  } | null;

  let stripeCancelled = true;
  let stripeNote: string | null = null;
  if (billing?.stripe_subscription_id) {
    const cancelled = await cancelSubscriptionNow(company.id);
    stripeCancelled = cancelled.cancelled;
    if (!cancelled.cancelled) {
      stripeNote = cancelled.reason ?? "error";
    }
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = purgeAfterFrom(deletedAt);

  const { data: updated, error: updateError } = await supabase
    .from("companies")
    .update({ status: "deleted", deleted_at: deletedAt, purge_after: purgeAfter })
    .eq("id", company.id)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Nothing was saved. The company may already have gone." };
  }

  const { error: tombError } = await supabase.from("company_deletions").insert({
    company_id: company.id,
    company_name: company.name,
    company_slug: company.slug,
    tier: company.tier,
    regulator: company.regulator,
    deleted_at: deletedAt,
    deleted_by: input.actor.id,
    deleted_by_email: input.actor.email,
    purge_after: purgeAfter,
    stripe_customer_id: billing?.stripe_customer_id ?? null,
    stripe_subscription_id: billing?.stripe_subscription_id ?? null,
    stripe_cancelled: stripeCancelled,
    stripe_note: stripeNote,
    counts,
  });
  if (tombError) {
    /* PUT IT BACK. The tombstone is the only thing that will survive the purge, and a deletion
       with no record of who did it, when, or what was in it is not something to leave standing
       in a product that promises an audit trail to a regulator. Undo the status change and
       refuse, rather than proceed into a state that cannot be accounted for. */
    const { error: revertError } = await supabase
      .from("companies")
      .update({ status: company.status ?? "active", deleted_at: null, purge_after: null })
      .eq("id", company.id);
    if (revertError) {
      return {
        ok: false,
        error:
          `${company.name} was marked as deleted, its record of the deletion could not be written, ` +
          `AND it could not be put back (${revertError.message}). Its subscription has been cancelled. ` +
          `Fix this now: the company is locked out with no record of why.`,
      };
    }
    return {
      ok: false,
      error:
        `The deletion was not recorded (${tombError.message}), so nothing was deleted. ` +
        (billing?.stripe_subscription_id
          ? "Their subscription HAS been cancelled, so check it in Stripe before trying again."
          : "Try again."),
    };
  }

  await writeAudit({
    companyId: company.id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: "platform_admin",
    action: "company.deleted",
    entityType: "company",
    entityId: company.id,
    summary: `Deleted ${company.name}; erased for good after ${GRACE_DAYS} days`,
    metadata: { purge_after: purgeAfter, stripe_cancelled: stripeCancelled, counts },
  });

  const stripeLine = !billing?.stripe_subscription_id
    ? " They had no subscription to cancel."
    : stripeCancelled
      ? " Their subscription has been cancelled."
      : ` THEIR SUBSCRIPTION COULD NOT BE CANCELLED (${stripeNote}), so they are still being charged. Cancel it in the Stripe dashboard.`;

  return {
    ok: true,
    purgeAfter,
    stripeCancelled,
    message:
      `${company.name} is deleted. Everyone there is locked out now, and nothing of theirs is ` +
      `erased until ${new Date(purgeAfter).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}, ` +
      `until when it can still be restored.${stripeLine}`,
  };
}

/* ===========================================================================
 * Restore, while the grace period lasts
 * =========================================================================== */

export async function restoreCompany(input: {
  companyId: string;
  actor: Actor;
  isFounder: boolean;
}): Promise<{ ok: false; error: string } | { ok: true; message: string }> {
  const supabase = createServiceClient();
  const { data, error: readError } = await supabase
    .from("companies")
    .select("id, name, status")
    .eq("id", input.companyId)
    .maybeSingle();
  if (readError) return { ok: false, error: "Could not read that company just now. Try again." };
  const company = (data as { id: string; name: string; status: string | null } | null) ?? null;
  if (!company) return { ok: false, error: "That company no longer exists." };

  const { data: tombData } = await supabase
    .from("company_deletions")
    .select("id, purged_at")
    .eq("company_id", company.id)
    .is("restored_at", null)
    .order("deleted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tomb = (tombData ?? null) as { id: string; purged_at: string | null } | null;

  const refusal = restoreRefusal({
    status: company.status,
    purgedAt: tomb?.purged_at ?? null,
    isFounder: input.isFounder,
  });
  if (refusal) return { ok: false, error: refusal };

  const { data: updated, error } = await supabase
    .from("companies")
    .update({ status: "active", deleted_at: null, purge_after: null })
    .eq("id", company.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: "Nothing was restored." };

  if (tomb) {
    await supabase
      .from("company_deletions")
      .update({ restored_at: new Date().toISOString() })
      .eq("id", tomb.id);
  }

  await writeAudit({
    companyId: company.id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: "platform_admin",
    action: "company.restored",
    entityType: "company",
    entityId: company.id,
    summary: `Restored ${company.name} before it was purged`,
  });

  return {
    ok: true,
    message:
      `${company.name} is back and everyone there can sign in again. Their subscription was ` +
      `cancelled when they were deleted and does NOT come back — they will need to subscribe again.`,
  };
}

/* ===========================================================================
 * STAGE TWO — purge
 * =========================================================================== */

export type PurgeOutcome =
  | { ok: false; error: string }
  | { ok: true; message: string; removed: Record<string, number> };

export async function purgeCompany(input: {
  companyId: string;
  actor: Actor | null;
  /** 'founder' when somebody pressed Purge now, 'cron' when the clock ran out. */
  by: "founder" | "cron";
  force: boolean;
}): Promise<PurgeOutcome> {
  const supabase = createServiceClient();

  const { data, error: readError } = await supabase
    .from("companies")
    .select("id, name, slug, tier, regulator, status, purge_after")
    .eq("id", input.companyId)
    .maybeSingle();
  if (readError) return { ok: false, error: "Could not read that company just now. Try again." };
  const company = (data as CompanyRow | null) ?? null;
  if (!company) return { ok: false, error: "That company no longer exists." };

  const { data: tombData } = await supabase
    .from("company_deletions")
    .select("id, purged_at")
    .eq("company_id", company.id)
    .is("restored_at", null)
    .order("deleted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tomb = (tombData ?? null) as { id: string; purged_at: string | null } | null;

  const refusal = purgeRefusal({
    status: company.status,
    purgeAfter: company.purge_after,
    purgedAt: tomb?.purged_at ?? null,
    nowISO: new Date().toISOString(),
    force: input.force,
  });
  if (refusal) return { ok: false, error: refusal };

  const removed: Record<string, number> = {};

  // 1. THE FILES FIRST, while the rows that name them still exist.
  for (const bucket of COMPANY_BUCKETS) {
    let paths: string[];
    try {
      paths = await listCompanyObjects(bucket, company.id);
    } catch (e) {
      return { ok: false, error: `Could not list ${bucket}: ${(e as Error).message}. Nothing was erased.` };
    }
    let done = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) {
        return {
          ok: false,
          error: `Could not remove files from ${bucket}: ${error.message}. Nothing else was erased, so it can be run again.`,
        };
      }
      done += batch.length;
    }
    removed[`storage:${bucket}`] = done;
  }

  // 2. THE LOGINS. Deleting the auth user cascades their profile, branch rows and assignments.
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("company_id", company.id);
  if (profileError) {
    return { ok: false, error: `Could not list the logins: ${profileError.message}. Nothing else was erased.` };
  }
  const profiles = (profileRows ?? []) as { id: string; email: string | null; role: string }[];
  let logins = 0;
  const loginFailures: string[] = [];
  for (const p of profiles) {
    // The founder is not a member of any tenant, but refuse anyway: a platform_admin row
    // carrying a company_id would be a bug, and deleting the founder's own login to fix it
    // would be a very expensive way to find out.
    if (p.role === "platform_admin") continue;
    const { error } = await supabase.auth.admin.deleteUser(p.id);
    if (error) loginFailures.push(`${p.email ?? p.id}: ${error.message}`);
    else logins += 1;
  }
  removed.logins = logins;
  if (loginFailures.length) {
    return {
      ok: false,
      error:
        `${loginFailures.length} login(s) could not be deleted, so the company has been left ` +
        `standing rather than half erased: ${loginFailures.join("; ")}`,
    };
  }

  // 3. THE ROWS THAT DO NOT CASCADE. These five reference companies with SET NULL, so a plain
  //    delete would leave staff names, emails, phone numbers and Stripe payloads floating free
  //    with nothing to say whose they were. That is the opposite of an erasure.
  for (const table of ["audit_log", "sms_opt_outs", "trial_requests", "stripe_events"]) {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("company_id", company.id);
    if (error) return { ok: false, error: `Could not clear ${table}: ${error.message}.` };
    removed[table] = count ?? 0;
  }
  // Any profile row left without an auth user behind it (an invite that never became a login).
  const { count: strayProfiles } = await supabase
    .from("profiles")
    .delete({ count: "exact" })
    .eq("company_id", company.id);
  removed.stray_profiles = strayProfiles ?? 0;

  // 4. THE COMPANY, which CASCADES the other sixty-two tables.
  const { data: gone, error: deleteError } = await supabase
    .from("companies")
    .delete()
    .eq("id", company.id)
    .select("id");
  if (deleteError) return { ok: false, error: `Could not delete the company: ${deleteError.message}.` };
  if (!gone || gone.length === 0) return { ok: false, error: "Nothing was deleted." };
  removed.company = 1;

  // 5. LOOK AT WHAT IS LEFT. A delete that returned no error is not proof that anything went.
  const leftovers: Record<string, number> = {};
  for (const table of ["people", "service_users", "evidence", "profiles", "audit_log"]) {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id);
    if ((count ?? 0) > 0) leftovers[table] = count ?? 0;
  }
  for (const bucket of COMPANY_BUCKETS) {
    try {
      const left = await listCompanyObjects(bucket, company.id);
      if (left.length) leftovers[`storage:${bucket}`] = left.length;
    } catch {
      // The bucket could not be re-listed; the count below records that we do not know.
      leftovers[`storage:${bucket}`] = -1;
    }
  }
  const purgeError = Object.keys(leftovers).length
    ? `Left behind: ${JSON.stringify(leftovers)}`
    : null;

  if (tomb) {
    await supabase
      .from("company_deletions")
      .update({
        purged_at: new Date().toISOString(),
        purged_by: input.by,
        purge_counts: removed,
        purge_error: purgeError,
      })
      .eq("id", tomb.id);
  }

  await writeAudit({
    // No company id: there is no company any more, and pointing an audit row at a row that no
    // longer exists is how you end up with a trail nobody can follow.
    companyId: null,
    actorId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    actorRole: input.by === "cron" ? "system" : "platform_admin",
    action: "company.purged",
    entityType: "company",
    entityId: company.id,
    summary: `Purged ${company.name} for good`,
    metadata: { removed, leftovers, by: input.by },
  });

  if (purgeError) {
    return {
      ok: false,
      error: `${company.name} was erased, but not completely. ${purgeError}`,
    };
  }

  return {
    ok: true,
    removed,
    message: `${company.name} has been erased. ${removed.logins} login(s), ${
      removed["storage:evidence"] ?? 0
    } evidence file(s) and every record it held are gone; only the record of the deletion remains.`,
  };
}

/** The nightly job: purge every company whose grace period has run out. */
export async function runCompanyPurge(): Promise<{
  due: number;
  purged: number;
  errors: string[];
}> {
  const supabase = createServiceClient();
  const nowISO = new Date().toISOString();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("status", "deleted")
    .not("purge_after", "is", null)
    .lte("purge_after", nowISO);
  if (error) return { due: 0, purged: 0, errors: [`could not list deleted companies: ${error.message}`] };

  const dueList = (data ?? []) as { id: string; name: string }[];
  const errors: string[] = [];
  let purged = 0;
  for (const company of dueList) {
    const outcome = await purgeCompany({
      companyId: company.id,
      actor: null,
      by: "cron",
      force: false,
    });
    if (outcome.ok) purged += 1;
    else errors.push(`${company.name}: ${outcome.error}`);
  }
  return { due: dueList.length, purged, errors };
}
