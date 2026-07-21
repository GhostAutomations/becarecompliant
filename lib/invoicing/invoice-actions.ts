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
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";
import { INVOICING_ROLES, INVOICE_SERVICES, advanceRunDate } from "./types";
import { londonToday, getInvoice, getInvoicingConfig, getCompanyName } from "./data";
import { getCompanyLogoDataUrl } from "./logo";
import { renderInvoicePdf } from "./pdf";
import { sendEmail, type EmailAttachment } from "@/lib/email/resend";
import { companyInvoiceEmailHtml } from "@/lib/email/templates";
import { unitPricePence, lineAmountPence, type ServiceRate } from "@/lib/service-users/care-plan-consts";

type LineInput = {
  description: string;
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
  service: string | null;
  unit_label: string | null;
  handed: string | null;
  period_start: string | null;
  period_end: string | null;
};

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
  const isoOrNull = (v: unknown): string | null =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null;
  return arr
    .map((r) => {
      const o = r as Record<string, unknown>;
      const quantity = Math.max(0, Number(o.quantity ?? 0));
      const unit_price_pence = Math.round(Math.max(0, Number(o.unit_price_pence ?? 0)));
      // Prefer the exact total the builder computed; fall back to qty x unit.
      const provided = Number(o.line_total_pence);
      const line_total_pence = Number.isFinite(provided) && provided >= 0
        ? Math.round(provided)
        : Math.round(quantity * unit_price_pence);
      return {
        description: String(o.description ?? "").trim(),
        quantity,
        unit_price_pence,
        line_total_pence,
        service: o.service ? String(o.service) : null,
        unit_label: o.unit_label ? String(o.unit_label) : null,
        handed: o.handed ? String(o.handed) : null,
        period_start: isoOrNull(o.period_start),
        period_end: isoOrNull(o.period_end),
      };
    })
    .filter((l) => l.description !== "" && (l.quantity > 0 || l.unit_price_pence > 0));
}

/** Totals from lines that already carry an exact line_total_pence. */
function totalsFromLines(lines: LineInput[], vatEnabled: boolean, vatRate: number) {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    subtotal += l.line_total_pence;
    if (vatEnabled) vat += Math.round((l.line_total_pence * vatRate) / 100);
  }
  return { subtotalPence: subtotal, vatPence: vat, totalPence: subtotal + vat };
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

type BuilderLine = {
  service: string;
  unit: string;
  handed: string;
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
  description: string;
  period_start: string;
  period_end: string;
};

const HANDED_SUFFIX: Record<string, string> = { single: "Single Handed", double: "Double Handed" };

function addDaysUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Expand a service user's care plan over a date range into invoice lines,
 *  BROKEN DOWN BY WEEK: the period is split into 7 day windows from the start
 *  date, and each week produces its own set of lines (one per service+unit+handed)
 *  tagged with that week's from/to dates. Amounts are billed at the exact rate
 *  (rounded only at the line total). Called by the builder when a period is set. */
export async function carePlanLinesForPeriod(
  serviceUserId: string,
  from: string,
  to: string,
): Promise<{ lines: BuilderLine[]; error?: string }> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { lines: [], error: err };
  if (!serviceUserId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { lines: [] };
  }

  const supabase = await createClient();
  const [{ data: entries }, { data: cfg }] = await Promise.all([
    supabase
      .from("care_plan_entries")
      .select("day_of_week, service, unit, handed, quantity")
      .eq("service_user_id", serviceUserId)
      .order("position", { ascending: true }),
    supabase.from("invoicing_config").select("*").eq("company_id", profile.company_id!).maybeSingle(),
  ]);
  const plan = (entries as Array<{ day_of_week: number; service: string; unit: string; handed: string; quantity: number }> | null) ?? [];
  if (plan.length === 0) return { lines: [] };

  const config = (cfg ?? {}) as Record<string, number>;
  const rateFor = (label: string): ServiceRate | undefined => {
    const svc = INVOICE_SERVICES.find((s) => s.label === label);
    if (!svc) return undefined;
    return {
      label,
      hourly_pence: Number(config[`rate_${svc.key}_pence`] ?? 0),
      fixed_pence: Number(config[`rate_${svc.key}_fixed_pence`] ?? 0),
    };
  };

  const out: BuilderLine[] = [];
  // Walk the period one week (7 days) at a time, from the start date.
  let weekStart = from;
  let weekGuard = 0;
  while (weekStart <= to && weekGuard < 60) {
    weekGuard += 1;
    const rawEnd = addDaysUtc(weekStart, 6);
    const weekEnd = rawEnd > to ? to : rawEnd; // last week may be partial

    // Count each weekday (0 = Monday) inside this week window.
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let d = new Date(`${weekStart}T00:00:00Z`);
    const end = new Date(`${weekEnd}T00:00:00Z`);
    let dayGuard = 0;
    while (d <= end && dayGuard < 8) {
      counts[(d.getUTCDay() + 6) % 7] += 1;
      d.setUTCDate(d.getUTCDate() + 1);
      dayGuard += 1;
    }

    // Merge this week's plan entries by service + unit + handed.
    const merged = new Map<string, BuilderLine>();
    for (const e of plan) {
      const occ = counts[e.day_of_week] ?? 0;
      const qty = occ * Number(e.quantity);
      if (qty <= 0) continue;
      const handed = e.handed === "double" ? "double" : "single";
      const key = `${e.service}|${e.unit}|${handed}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.line_total_pence = lineAmountPence(rateFor(e.service), e.unit, handed, existing.quantity);
      } else {
        merged.set(key, {
          service: e.service,
          unit: e.unit,
          handed,
          quantity: qty,
          unit_price_pence: unitPricePence(rateFor(e.service), e.unit, handed),
          line_total_pence: lineAmountPence(rateFor(e.service), e.unit, handed, qty),
          description: `${e.service} - ${e.unit} (${HANDED_SUFFIX[handed]})`,
          period_start: weekStart,
          period_end: weekEnd,
        });
      }
    }
    out.push(...merged.values());
    weekStart = addDaysUtc(weekStart, 7);
  }
  return { lines: out };
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
  const totals = totalsFromLines(lines, vatEnabled, vatRate);

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
      service: l.service,
      unit_label: l.unit_label,
      handed: l.handed,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      line_total_pence: l.line_total_pence,
      period_start: l.period_start,
      period_end: l.period_end,
      vat_rate: l.vat_rate,
      position: i,
    })),
  );
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", inv.id);
    return { error: "Could not save the invoice lines. Please try again." };
  }

  // Optional recurring schedule: the next invoice drafts automatically on the
  // chosen cadence. The template lines mirror this invoice's lines.
  if (formData.get("repeat") === "on") {
    const frequency = formData.get("frequency") === "weekly" ? "weekly" : "monthly";
    const interval = Math.max(1, Number(formData.get("interval_count") ?? 1) || 1);
    const dowRaw = intOrNull(formData.get("day_of_week"));
    const domRaw = intOrNull(formData.get("day_of_month"));
    const day_of_week = frequency === "weekly" && dowRaw != null && dowRaw >= 0 && dowRaw <= 6 ? dowRaw : null;
    const day_of_month = frequency === "monthly" && domRaw != null && domRaw >= 1 && domRaw <= 28 ? domRaw : null;
    const { data: sched } = await supabase
      .from("invoice_schedules")
      .insert({
        company_id: companyId,
        branch_id: su.branch_id,
        service_user_id: su.id,
        frequency,
        interval_count: interval,
        day_of_week,
        day_of_month,
        next_run_date: advanceRunDate(issue, frequency, interval, { dayOfWeek: day_of_week, dayOfMonth: day_of_month }),
        active: true,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (sched) {
      await supabase.from("invoice_schedule_lines").insert(
        withRates.map((l, i) => ({
          schedule_id: sched.id,
          company_id: companyId,
          description: l.description,
          service: l.service,
          unit_label: l.unit_label,
          handed: l.handed,
          quantity: l.quantity,
          unit_price_pence: l.unit_price_pence,
          period_start: l.period_start,
          period_end: l.period_end,
          vat_rate: l.vat_rate,
          position: i,
        })),
      );
    }
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
  const totals = totalsFromLines(lines, vatEnabled, vatRate);

  await supabase.from("invoice_lines").delete().eq("invoice_id", id);
  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    withRates.map((l, i) => ({
      invoice_id: id,
      company_id: companyId,
      description: l.description,
      service: l.service,
      unit_label: l.unit_label,
      handed: l.handed,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      line_total_pence: l.line_total_pence,
      period_start: l.period_start,
      period_end: l.period_end,
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

  // Email the branded PDF to the client when their delivery method is Email.
  // Post clients are numbered and marked Sent, but not emailed.
  const emailNote = await emailInvoiceOnSend(id, profile);

  revalidatePath(`/invoicing/${id}`);
  revalidatePath("/invoicing");
  return { ok: emailNote ? `Sent. ${emailNote}` : "Sent" };
}

/** Re-send the invoice email to the client (gold Resend button on a sent invoice).
 *  Uses the exact same company-branded email as the first send. */
export async function resendInvoiceEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };
  const note = await emailInvoiceOnSend(id, profile);
  if (note === null) return { error: "Invoice not found." };
  revalidatePath(`/invoicing/${id}`);
  return { ok: note };
}

/** Attach the branded invoice PDF and email it to the bill-to address. Returns a
 *  short note for the UI when something needs surfacing (emailed, not emailed, or
 *  the email dependency is missing), or null when there is nothing to add. */
async function emailInvoiceOnSend(
  invoiceId: string,
  profile: { id: string; email: string; role: string; company_id: string | null },
): Promise<string | null> {
  try {
    const inv = await getInvoice(invoiceId);
    if (!inv) return null;
    if (inv.delivery_method !== "email") return "This client is set to receive invoices by post, so no email was sent.";
    if (!inv.bill_to_email) return "No email address on file for this client, so no email was sent.";

    const [config, companyName, logo] = await Promise.all([
      getInvoicingConfig(inv.company_id),
      getCompanyName(inv.company_id),
      getCompanyLogoDataUrl(inv.company_id),
    ]);
    const pdf = await renderInvoicePdf(inv, config, companyName, londonToday(), logo);

    // Inline the company logo (cid) so Gmail/Outlook render it (they strip
    // data-URI images). Falls back to the company name if there is no logo.
    const attachments: EmailAttachment[] = [
      { filename: `Invoice-${inv.number}.pdf`, content: pdf.toString("base64"), contentType: "application/pdf" },
    ];
    let logoCid: string | null = null;
    const logoMatch = logo?.match(/^data:(.*?);base64,(.*)$/);
    if (logoMatch) {
      logoCid = "companylogo";
      attachments.push({
        filename: "logo",
        content: logoMatch[2],
        contentType: logoMatch[1],
        contentId: logoCid,
      });
    }

    const html = companyInvoiceEmailHtml({
      companyName,
      invoiceNumber: inv.number ?? "Invoice",
      dueDateIso: inv.due_date,
      logoCid,
      replyable: Boolean(config.reply_to_email),
    });

    const result = await sendEmail({
      to: inv.bill_to_email,
      subject: `${companyName} invoice ${inv.number}`,
      html,
      attachments,
      // Client replies go to the company's own inbox, not the no-reply sender.
      ...(config.reply_to_email ? { replyTo: config.reply_to_email } : {}),
    });

    if (result.sent) {
      await writeAudit({
        companyId: inv.company_id,
        actorId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        action: "invoicing.invoice_emailed",
        entityType: "invoice",
        entityId: invoiceId,
        summary: `Emailed invoice ${inv.number} to ${inv.bill_to_email}`,
      });
      return `Emailed to ${inv.bill_to_email}.`;
    }
    if (result.skippedReason) return "Email is not set up yet, so the invoice was not emailed. Ask the founder to configure email.";
    return "The invoice was marked sent, but the email could not be delivered. Please try again or send it manually.";
  } catch {
    return "The invoice was marked sent, but the email could not be prepared.";
  }
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

export async function cancelSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const id = trimOrNull(formData.get("schedule_id"));
  if (!id) return { error: "Missing schedule." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_schedules")
    .update({ active: false, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", profile.company_id!)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not cancel this schedule." };
  revalidatePath("/invoicing/schedules");
  return { ok: "Cancelled" };
}

/** Hard delete an invoice and all record of it (its lines cascade). Per Phil: no
 *  void state, a delete removes everything. Note this can leave a gap in the sent
 *  number sequence. */
export async function deleteInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const err = await guard(profile.company_id, profile.role);
  if (err) return { error: err };
  const companyId = profile.company_id!;
  const id = trimOrNull(formData.get("invoice_id"));
  if (!id) return { error: "Missing invoice." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("invoices")
    .select("number")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not delete this invoice. Check your access and try again." };
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_deleted",
    entityType: "invoice",
    entityId: id,
    summary: `Deleted invoice ${existing?.number ?? "(draft)"}`,
  });
  revalidatePath("/invoicing");
  redirect("/invoicing");
}
