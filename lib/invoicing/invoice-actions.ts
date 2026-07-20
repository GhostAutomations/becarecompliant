"use server";

/**
 * Invoice lifecycle actions. Draft is built and edited freely; Send allocates the
 * gapless per-company number via the SECURITY DEFINER RPC; Mark paid and Void are
 * simple guarded updates. RLS (Manager+ on the invoice's branch) is the real
 * guard. The client is always a Service User; the bill-to is snapshotted onto the
 * invoice at creation so later edits to the service user never change a raised
 * invoice.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";
import { INVOICING_ROLES, computeTotals } from "./types";
import { londonToday } from "./data";

type LineInput = { description: string; quantity: number; unit_price_pence: number };

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function isoDateOr(v: FormDataEntryValue | null, fallback: string | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

/** Parse the lines JSON the builder submits; drop empty rows, clamp numbers. */
function parseLines(raw: FormDataEntryValue | null): LineInput[] {
  let arr: unknown;
  try {
    arr = JSON.parse(String(raw ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        description: String(o.description ?? "").trim(),
        quantity: Math.max(0, Number(o.quantity ?? 0)),
        unit_price_pence: Math.round(Math.max(0, Number(o.unit_price_pence ?? 0))),
      };
    })
    .filter((l) => l.description !== "" && (l.quantity > 0 || l.unit_price_pence > 0));
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function guard(companyId: string | null, role: string): Promise<string | null> {
  if (!companyId) return "No company context.";
  const gate = await requireFeature(companyId, "invoicing");
  if (gate) return gate;
  if (!INVOICING_ROLES.includes(role)) return "You do not have permission to manage invoices.";
  return null;
}

export async function createInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const companyId = profile.company_id!;

  const serviceUserId = trimOrNull(formData.get("service_user_id"));
  if (!serviceUserId) return { error: "Choose a client." };
  const lines = parseLines(formData.get("lines"));
  if (lines.length === 0) return { error: "Add at least one line to the invoice." };

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select(
      "id, branch_id, full_name, private_invoicing, invoice_to, invoice_contact_name, invoice_address, invoice_phone, invoice_email, invoice_delivery",
    )
    .eq("id", serviceUserId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!su) return { error: "That client was not found." };
  if (!su.private_invoicing) return { error: "Turn on private invoicing for this service user first." };

  const { data: cfg } = await supabase
    .from("invoicing_config")
    .select("vat_enabled, default_payment_terms_days")
    .eq("company_id", companyId)
    .maybeSingle();
  const vatEnabled = Boolean(cfg?.vat_enabled);
  const terms = Number(cfg?.default_payment_terms_days ?? 14);
  const vatRate = vatEnabled ? 20 : 0;

  const withRates = lines.map((l) => ({ ...l, vat_rate: vatRate }));
  const totals = computeTotals(withRates, vatEnabled);

  const issue = isoDateOr(formData.get("issue_date"), londonToday())!;
  const due = isoDateOr(formData.get("due_date"), addDaysIso(issue, terms))!;

  const invoiceTo = su.invoice_to ?? "service_user";
  const billName =
    su.invoice_contact_name || (invoiceTo === "service_user" ? su.full_name : null);

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      branch_id: su.branch_id,
      service_user_id: su.id,
      status: "draft",
      issue_date: issue,
      due_date: due,
      supply_period_start: isoDateOr(formData.get("supply_period_start"), null),
      supply_period_end: isoDateOr(formData.get("supply_period_end"), null),
      subtotal_pence: totals.subtotalPence,
      vat_pence: totals.vatPence,
      total_pence: totals.totalPence,
      vat_applied: vatEnabled,
      invoice_to: invoiceTo,
      bill_to_name: billName,
      bill_to_address: su.invoice_address,
      bill_to_email: su.invoice_email,
      bill_to_phone: su.invoice_phone,
      delivery_method: su.invoice_delivery,
      notes: trimOrNull(formData.get("notes")),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !inv) return { error: "Could not create the invoice. Please try again." };

  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    withRates.map((l, i) => ({
      invoice_id: inv.id,
      company_id: companyId,
      description: l.description,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      line_total_pence: Math.round(l.quantity * l.unit_price_pence),
      vat_rate: l.vat_rate,
      position: i,
    })),
  );
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", inv.id);
    return { error: "Could not save the invoice lines. Please try again." };
  }

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_created",
    entityType: "invoice",
    entityId: inv.id,
    summary: `Created a draft invoice for ${su.full_name}`,
  });
  revalidatePath("/invoicing");
  return { redirectTo: `/invoicing/${inv.id}` };
}

/** Replace a draft invoice's lines and header fields, recomputing totals. */
export async function updateInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const companyId = profile.company_id!;
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };
  const lines = parseLines(formData.get("lines"));
  if (lines.length === 0) return { error: "Add at least one line to the invoice." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!current) return { error: "Invoice not found." };
  if (current.status !== "draft") return { error: "Only a draft invoice can be edited." };

  const { data: cfg } = await supabase
    .from("invoicing_config")
    .select("vat_enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  const vatEnabled = Boolean(cfg?.vat_enabled);
  const vatRate = vatEnabled ? 20 : 0;
  const withRates = lines.map((l) => ({ ...l, vat_rate: vatRate }));
  const totals = computeTotals(withRates, vatEnabled);

  await supabase.from("invoice_lines").delete().eq("invoice_id", id);
  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    withRates.map((l, i) => ({
      invoice_id: id,
      company_id: companyId,
      description: l.description,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      line_total_pence: Math.round(l.quantity * l.unit_price_pence),
      vat_rate: l.vat_rate,
      position: i,
    })),
  );
  if (lineErr) return { error: "Could not save the invoice lines. Please try again." };

  const { error } = await supabase
    .from("invoices")
    .update({
      issue_date: isoDateOr(formData.get("issue_date"), londonToday()),
      due_date: isoDateOr(formData.get("due_date"), null),
      supply_period_start: isoDateOr(formData.get("supply_period_start"), null),
      supply_period_end: isoDateOr(formData.get("supply_period_end"), null),
      subtotal_pence: totals.subtotalPence,
      vat_pence: totals.vatPence,
      total_pence: totals.totalPence,
      vat_applied: vatEnabled,
      notes: trimOrNull(formData.get("notes")),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Could not save the invoice. Please try again." };

  revalidatePath(`/invoicing/${id}`);
  return { ok: "Saved" };
}

export async function sendInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invoicing_send_invoice", { p_invoice_id: id });
  if (error) return { error: "Could not send the invoice. Please try again." };

  await writeAudit({
    companyId: profile.company_id!,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_sent",
    entityType: "invoice",
    entityId: id,
    summary: `Sent invoice ${String(data ?? "")}`,
  });
  revalidatePath(`/invoicing/${id}`);
  revalidatePath("/invoicing");
  return { ok: "Sent" };
}

export async function markInvoicePaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const companyId = profile.company_id!;
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };
  const paid_date = isoDateOr(formData.get("paid_date"), londonToday());
  const paid_method = trimOrNull(formData.get("paid_method"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_date,
      paid_method,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .in("status", ["sent"])
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "Could not mark as paid. Only a sent invoice can be paid." };
  }
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_paid",
    entityType: "invoice",
    entityId: id,
    summary: "Marked an invoice as paid",
  });
  revalidatePath(`/invoicing/${id}`);
  revalidatePath("/invoicing");
  return { ok: "Marked paid" };
}

export async function voidInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const companyId = profile.company_id!;
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "void", updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not void this invoice." };
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_voided",
    entityType: "invoice",
    entityId: id,
    summary: "Voided an invoice",
  });
  revalidatePath(`/invoicing/${id}`);
  revalidatePath("/invoicing");
  return { ok: "Voided" };
}
