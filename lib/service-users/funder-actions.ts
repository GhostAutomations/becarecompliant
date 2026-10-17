"use server";

/**
 * Be Care Compliant: add, rename, archive and restore a funder (Stage 7b part 1). Company Admins
 * only, here and in RLS (funders_write, 0508). Archived funders stay on the records that have
 * them and leave the Funder dropdown; nothing is ever deleted, because records point at them.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

function cleanName(raw: FormDataEntryValue | null): { name?: string; error?: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Enter the funder's name, for example Newport City Council." };
  if (name.length > 120) return { error: "The name is too long (120 characters at most)." };
  return { name };
}

const TAKEN = "That funder is already on your list.";

export async function addFunderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." };
  const n = cleanName(formData.get("name"));
  if (n.error) return { error: n.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funders")
    .insert({ company_id: companyId, name: n.name, created_by: user.id })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "23505" ? TAKEN : error.message };
  if (!data) return { error: "The funder could not be added. Ask a Company Admin." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.funder_added",
    entityType: "company",
    entityId: companyId,
    summary: `Added funder ${n.name}`,
    metadata: { funder_id: data.id },
  });
  revalidatePath("/settings/service-users");
  return { ok: "Added." };
}

export async function renameFunderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." };
  const id = String(formData.get("funder_id") ?? "");
  const n = cleanName(formData.get("name"));
  if (n.error) return { error: n.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funders")
    .update({ name: n.name })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id");
  if (error) return { error: error.code === "23505" ? TAKEN : error.message };
  if (!data?.length) return { error: "That funder could not be changed." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.funder_renamed",
    entityType: "company",
    entityId: companyId,
    summary: `Renamed a funder to ${n.name}`,
    metadata: { funder_id: id },
  });
  revalidatePath("/settings/service-users");
  return { ok: "Saved." };
}

export async function setFunderArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "Select a company first." };
  const id = String(formData.get("funder_id") ?? "");
  const archive = formData.get("archive") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funders")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("name");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That funder could not be changed." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: archive ? "company.funder_archived" : "company.funder_restored",
    entityType: "company",
    entityId: companyId,
    summary: `${archive ? "Archived" : "Restored"} funder ${(data[0] as { name: string }).name}`,
    metadata: { funder_id: id },
  });
  revalidatePath("/settings/service-users");
  return { ok: archive ? "Archived." : "Restored." };
}
