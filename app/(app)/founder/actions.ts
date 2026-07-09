"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAndSendInvite } from "@/lib/invites";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

const VALID_TIERS = ["business", "pro", "enterprise", "diamond", "black"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Founder-led company creation. Seeds one Team (office) + one Branch and,
 *  optionally, invites the first Company Admin. */
export async function createCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const tier = String(formData.get("tier") ?? "business");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const branchName =
    String(formData.get("branch_name") ?? "").trim() || "Main Branch";
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim();

  if (!name) return { error: "Enter a company name." };
  if (!VALID_TIERS.includes(tier)) return { error: "Choose a valid tier." };

  const slug = slugInput ? slugify(slugInput) : slugify(name);
  if (!slug) return { error: "Could not derive a slug. Enter one manually." };

  const supabase = await createClient();

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({ name, slug, tier })
    .select("id, name")
    .single();
  if (companyErr) {
    if (companyErr.code === "23505") {
      return { error: "That slug is already taken. Choose another." };
    }
    return { error: companyErr.message };
  }

  // Seed the included Team (office) and first Branch.
  const { error: branchErr } = await supabase.from("branches").insert([
    { company_id: company.id, name: `${name} Office`, kind: "team" },
    { company_id: company.id, name: branchName, kind: "branch" },
  ]);
  if (branchErr) {
    return { error: `Company created, but seeding branches failed: ${branchErr.message}` };
  }

  // Seed the founder-curated starter forms so the company has usable forms on
  // day one. Idempotent (safe if re-run); runs as the platform admin, which the
  // SECURITY DEFINER function authorises. A seeding failure must not fail company
  // creation, so it is surfaced in the note rather than thrown.
  const { data: seededCount, error: seedErr } = await supabase.rpc(
    "seed_company_form_templates",
    { cid: company.id },
  );

  // Seed the default People check catalogue (idempotent), linking each check to
  // the Forms just seeded. A failure must not fail company creation.
  const { data: checksSeeded, error: checksErr } = await supabase.rpc(
    "seed_company_people_checks",
    { cid: company.id },
  );

  // Seed the default Service User check catalogue (idempotent), linking each check to
  // the Forms just seeded. A failure must not fail company creation.
  const { data: suChecksSeeded, error: suChecksErr } = await supabase.rpc(
    "seed_company_service_user_checks",
    { cid: company.id },
  );

  await writeAudit({
    companyId: company.id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.created",
    entityType: "company",
    entityId: company.id,
    summary: `Created company ${name} on the ${tier} tier`,
    metadata: {
      tier,
      slug,
      branch_name: branchName,
      forms_seeded: seededCount ?? 0,
      checks_seeded: checksErr ? 0 : (checksSeeded ?? 0),
      su_checks_seeded: suChecksErr ? 0 : (suChecksSeeded ?? 0),
    },
  });

  let note = `Company ${name} created with its Team and first Branch.`;
  if (seedErr) {
    note += ` The starter forms could not be seeded: ${seedErr.message}`;
  } else {
    note += ` ${seededCount ?? 0} starter forms were added.`;
  }
  if (checksErr) {
    note += ` The People checks could not be seeded: ${checksErr.message}`;
  } else {
    note += ` ${checksSeeded ?? 0} People checks were configured.`;
  }
  if (suChecksErr) {
    note += ` The Service User checks could not be seeded: ${suChecksErr.message}`;
  } else {
    note += ` ${suChecksSeeded ?? 0} Service User checks were configured.`;
  }

  if (adminEmail) {
    const outcome = await createAndSendInvite({
      companyId: company.id,
      companyName: company.name,
      branchId: null,
      email: adminEmail,
      fullName: adminName,
      role: "company_admin",
      inviter: {
        id: user.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: "platform_admin",
      },
    });
    if (!outcome.ok) {
      note += ` The Admin invite could not be sent: ${outcome.error}`;
    } else if (!outcome.emailSent) {
      note += ` The Admin invite was recorded, but the email was not sent (${outcome.emailNote ?? "email not configured"}).`;
    } else {
      note += ` An Admin invite was emailed to ${adminEmail}.`;
    }
  }

  revalidatePath("/founder");
  return { ok: note };
}

/** Suspend, archive or reactivate a company. */
export async function setCompanyStatus(formData: FormData): Promise<void> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!companyId || !["active", "suspended", "archived"].includes(status)) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) return;

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    summary: `Set company status to ${status}`,
    metadata: { status },
  });

  revalidatePath("/founder");
}
