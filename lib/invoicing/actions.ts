"use server";

/**
 * Invoicing server actions (Phase 10 Additions). RLS (is_company_admin /
 * is_branch_manager) is the real guard; the checks here return a clean message
 * before the database refuses. Settings (config + rate list) are Admin only;
 * Private Clients are Branch Manager and above.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";
import { INVOICING_ROLES, INVOICE_SERVICES } from "./types";
import { uploadCompanyLogo } from "./logo";

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function poundsToPence(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const ADMIN_ROLES = ["company_admin", "platform_admin"];

/** Founder may set the starting invoice number; company admins may not (it is
 *  system controlled so numbering stays gapless and can't be re-based). */
function canEditNumberStart(profile: { role: string; actingAsCompanyId?: string }): boolean {
  return profile.role === "platform_admin" || Boolean(profile.actingAsCompanyId);
}

// ---------------------------------------------------------------------------
// Settings: invoicing_config
// ---------------------------------------------------------------------------
export async function saveInvoicingConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "invoicing");
  if (gate) return { error: gate };
  if (!ADMIN_ROLES.includes(profile.role)) return { error: "Only an Admin can change invoicing settings." };
  const companyId = profile.company_id;

  const vat_enabled = formData.get("vat_enabled") === "on";
  const vat_number = trimOrNull(formData.get("vat_number"));
  if (vat_enabled && !vat_number) {
    return { error: "Enter your VAT number to charge VAT, or untick VAT." };
  }
  const number_prefix = (trimOrNull(formData.get("number_prefix")) ?? "INV-").slice(0, 12);
  const default_payment_terms_days = Math.max(0, intOrNull(formData.get("default_payment_terms_days")) ?? 14);
  const payment_details = trimOrNull(formData.get("payment_details"));
  const invoice_footer = trimOrNull(formData.get("invoice_footer"));
  const overdue_reminders_enabled = formData.get("overdue_reminders_enabled") === "on";

  const supabase = await createClient();
  // Preserve the existing (or default) number_start unless the founder edits it.
  const { data: existing } = await supabase
    .from("invoicing_config")
    .select("number_start")
    .eq("company_id", companyId)
    .maybeSingle();
  let number_start = (existing?.number_start as number | undefined) ?? 1;
  if (canEditNumberStart(profile)) {
    number_start = Math.max(1, intOrNull(formData.get("number_start")) ?? number_start);
  }

  const { error } = await supabase.from("invoicing_config").upsert(
    {
      company_id: companyId,
      vat_enabled,
      vat_number: vat_enabled ? vat_number : null,
      number_prefix,
      number_start,
      default_payment_terms_days,
      payment_details,
      invoice_footer,
      overdue_reminders_enabled,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: "Could not save. Please try again." };

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.config_updated",
    entityType: "company",
    entityId: companyId,
    summary: "Updated invoicing settings",
  });
  revalidatePath("/settings/invoicing");
  return { ok: "Saved" };
}

// ---------------------------------------------------------------------------
// Settings: rate_list
// ---------------------------------------------------------------------------
export async function addRateLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "invoicing");
  if (gate) return { error: gate };
  if (!ADMIN_ROLES.includes(profile.role)) return { error: "Only an Admin can edit the rate list." };
  const description = trimOrNull(formData.get("description"));
  if (!description) return { error: "Enter a description." };
  const unit_price_pence = poundsToPence(formData.get("unit_price"));

  const supabase = await createClient();
  const { error } = await supabase.from("rate_list").insert({
    company_id: profile.company_id,
    description,
    unit_price_pence,
  });
  if (error) return { error: "Could not add. Please try again." };
  revalidatePath("/settings/invoicing");
  return { ok: "Added" };
}

/** Save the six hourly service rates (Care, Sit, Overnight, Sleep, Shopping,
 *  Cleaning). Double handed line prices are derived (x2) in the app. */
export async function saveHourlyRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "invoicing");
  if (gate) return { error: gate };
  if (!ADMIN_ROLES.includes(profile.role)) return { error: "Only an Admin can set hourly rates." };

  const patch: Record<string, number> = {};
  for (const s of INVOICE_SERVICES) {
    patch[`rate_${s.key}_pence`] = poundsToPence(formData.get(`rate_${s.key}`));
    patch[`rate_${s.key}_fixed_pence`] = poundsToPence(formData.get(`rate_${s.key}_fixed`));
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoicing_config")
    .upsert({ company_id: profile.company_id, ...patch, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/settings/invoicing");
  return { ok: "Saved" };
}

/** Upload a company logo for branded invoices (Admin only). */
export async function saveCompanyLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "invoicing");
  if (gate) return { error: gate };
  if (!ADMIN_ROLES.includes(profile.role)) return { error: "Only an Admin can change the logo." };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > 2_000_000) return { error: "Please use a logo under 2MB." };

  const up = await uploadCompanyLogo(profile.company_id, file);
  if (!up.ok) return { error: "Could not upload the logo. Please try again." };
  const service = createServiceClient();
  const { error } = await service.from("companies").update({ logo_path: up.path }).eq("id", profile.company_id);
  if (error) return { error: "Could not save the logo. Please try again." };
  revalidatePath("/settings/invoicing");
  return { ok: "Logo saved" };
}

export async function deleteRateLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!ADMIN_ROLES.includes(profile.role)) return { error: "Only an Admin can edit the rate list." };
  const id = trimOrNull(formData.get("id"));
  if (!id) return { error: "Missing rate." };
  const supabase = await createClient();
  const { error } = await supabase.from("rate_list").delete().eq("id", id).eq("company_id", profile.company_id);
  if (error) return { error: "Could not remove. Please try again." };
  revalidatePath("/settings/invoicing");
  return { ok: "Removed" };
}

// ---------------------------------------------------------------------------
// Private Clients
// ---------------------------------------------------------------------------
function clientFieldsFromForm(formData: FormData) {
  const client_type = formData.get("client_type") === "organisation" ? "organisation" : "person";
  return {
    client_type,
    name: trimOrNull(formData.get("name")),
    contact_name: trimOrNull(formData.get("contact_name")),
    email: trimOrNull(formData.get("email")),
    phone: trimOrNull(formData.get("phone")),
    address_line1: trimOrNull(formData.get("address_line1")),
    address_line2: trimOrNull(formData.get("address_line2")),
    city: trimOrNull(formData.get("city")),
    postcode: trimOrNull(formData.get("postcode")),
    service_user_id: trimOrNull(formData.get("service_user_id")),
    payment_terms_days: intOrNull(formData.get("payment_terms_days")),
    notes: trimOrNull(formData.get("notes")),
  };
}

export async function createPrivateClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "invoicing");
  if (gate) return { error: gate };
  if (!INVOICING_ROLES.includes(profile.role)) return { error: "You do not have permission to add clients." };
  const branch_id = trimOrNull(formData.get("branch_id"));
  if (!branch_id) return { error: "Choose a branch." };
  const fields = clientFieldsFromForm(formData);
  if (!fields.name) return { error: "Enter the client name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("private_clients")
    .insert({ company_id: profile.company_id, branch_id, created_by: user.id, ...fields })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the client. Check your branch access and try again." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.client_created",
    entityType: "private_client",
    entityId: data.id,
    summary: `Added private client ${fields.name}`,
  });
  revalidatePath("/invoicing/clients");
  return { redirectTo: "/invoicing/clients" };
}

export async function updatePrivateClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!INVOICING_ROLES.includes(profile.role)) return { error: "You do not have permission to edit clients." };
  const id = trimOrNull(formData.get("id"));
  if (!id) return { error: "Missing client." };
  const fields = clientFieldsFromForm(formData);
  if (!fields.name) return { error: "Enter the client name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("private_clients")
    .update({ ...fields, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", profile.company_id)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not save. Check your access and try again." };
  revalidatePath("/invoicing/clients");
  revalidatePath(`/invoicing/clients/${id}`);
  return { ok: "Saved" };
}

export async function setPrivateClientStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!INVOICING_ROLES.includes(profile.role)) return { error: "You do not have permission." };
  const id = trimOrNull(formData.get("id"));
  const status = formData.get("status") === "archived" ? "archived" : "active";
  if (!id) return { error: "Missing client." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("private_clients")
    .update({ status, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", profile.company_id)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not update. Please try again." };
  revalidatePath("/invoicing/clients");
  return { redirectTo: "/invoicing/clients" };
}
