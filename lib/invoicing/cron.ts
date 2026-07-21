import "server-only";

/**
 * Invoicing automation, run daily by /api/cron/invoicing:
 *  1. Recurring schedules draft the next invoice when it falls due. The run is
 *     claimed by advancing next_run_date in a conditional update, so a double
 *     cron invocation never double-drafts.
 *  2. Overdue reminders email the company's Admins and Managers (internally, Be
 *     Care Compliant branded) when sent invoices pass their due date. Gated by
 *     the per-company overdue_reminders_enabled toggle and Resend being set up.
 *     Deduped to at most one email per recipient per week.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { getRecipients } from "@/lib/notifications/data";
import { siteUrl } from "@/lib/site";
import { formatMoney, computeTotals } from "./types";
import { londonToday } from "./data";

const MANAGER_PLUS = new Set([
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
]);

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function advance(
  iso: string,
  frequency: string,
  interval: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
): string {
  const n = Math.max(1, interval);
  if (frequency === "weekly") {
    let out = addDaysIso(iso, 7 * n);
    if (dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek <= 6) {
      const [yy, mm, dd] = out.split("-").map(Number);
      const dt = new Date(Date.UTC(yy, mm - 1, dd));
      const cur = (dt.getUTCDay() + 6) % 7; // Mon=0
      dt.setUTCDate(dt.getUTCDate() + (dayOfWeek - cur));
      out = dt.toISOString().slice(0, 10);
    }
    return out;
  }
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const wanted = dayOfMonth != null && dayOfMonth >= 1 && dayOfMonth <= 28 ? dayOfMonth : d;
  target.setUTCDate(Math.min(wanted, last));
  return target.toISOString().slice(0, 10);
}

/** Monday of the current London week, as the weekly dedupe bucket. */
function weekStartIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export async function runRecurringInvoices(): Promise<{ drafted: number; failures: string[] }> {
  const supabase = createServiceClient();
  const today = londonToday();
  const out = { drafted: 0, failures: [] as string[] };

  const { data: due } = await supabase
    .from("invoice_schedules")
    .select("id, company_id, branch_id, service_user_id, frequency, interval_count, next_run_date, day_of_week, day_of_month")
    .eq("active", true)
    .lte("next_run_date", today);
  const schedules = (due as Array<{
    id: string; company_id: string; branch_id: string; service_user_id: string | null;
    frequency: string; interval_count: number; next_run_date: string;
    day_of_week: number | null; day_of_month: number | null;
  }> | null) ?? [];

  for (const sc of schedules) {
    try {
      // Claim the run by advancing next_run_date; if no row updates, another run won.
      const nextDate = advance(sc.next_run_date, sc.frequency, sc.interval_count, sc.day_of_week, sc.day_of_month);
      const { data: claimed } = await supabase
        .from("invoice_schedules")
        .update({ next_run_date: nextDate, updated_at: new Date().toISOString() })
        .eq("id", sc.id)
        .eq("next_run_date", sc.next_run_date)
        .eq("active", true)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const [{ data: su }, { data: cfg }, { data: lines }] = await Promise.all([
        supabase.from("service_users").select("full_name, invoice_to, invoice_contact_name, invoice_address, invoice_phone, invoice_email, invoice_delivery").eq("id", sc.service_user_id).maybeSingle(),
        supabase.from("invoicing_config").select("vat_enabled, default_payment_terms_days").eq("company_id", sc.company_id).maybeSingle(),
        supabase.from("invoice_schedule_lines").select("description, service, unit_label, handed, quantity, unit_price_pence, vat_rate, position").eq("schedule_id", sc.id).order("position", { ascending: true }),
      ]);
      const scheduleLines = (lines as Array<{ description: string; service: string | null; unit_label: string | null; handed: string | null; quantity: number; unit_price_pence: number; vat_rate: number; position: number }> | null) ?? [];
      if (!su || scheduleLines.length === 0) continue;

      const vatEnabled = Boolean(cfg?.vat_enabled);
      const terms = Number(cfg?.default_payment_terms_days ?? 14);
      const withRates = scheduleLines.map((l) => ({
        description: l.description,
        service: l.service,
        unit_label: l.unit_label,
        handed: l.handed,
        quantity: Number(l.quantity),
        unit_price_pence: l.unit_price_pence,
        vat_rate: vatEnabled ? l.vat_rate || 20 : 0,
      }));
      const totals = computeTotals(withRates, vatEnabled);
      const invoiceTo = su.invoice_to ?? "service_user";
      const billName = su.invoice_contact_name || (invoiceTo === "service_user" ? su.full_name : null);

      const { data: inv } = await supabase
        .from("invoices")
        .insert({
          company_id: sc.company_id,
          branch_id: sc.branch_id,
          service_user_id: sc.service_user_id,
          schedule_id: sc.id,
          status: "draft",
          issue_date: today,
          due_date: addDaysIso(today, terms),
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
        })
        .select("id")
        .single();
      if (!inv) {
        out.failures.push(`schedule ${sc.id}: invoice insert failed`);
        continue;
      }
      await supabase.from("invoice_lines").insert(
        withRates.map((l, i) => ({
          invoice_id: inv.id,
          company_id: sc.company_id,
          description: l.description,
          service: l.service,
          unit_label: l.unit_label,
          handed: l.handed,
          quantity: l.quantity,
          unit_price_pence: l.unit_price_pence,
          line_total_pence: Math.round(l.quantity * l.unit_price_pence),
          vat_rate: l.vat_rate,
          position: i,
        })),
      );
      out.drafted += 1;
    } catch (e) {
      out.failures.push(`schedule ${sc.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

export async function runOverdueReminders(): Promise<{ sent: number; skipped: number; failures: string[] }> {
  const out = { sent: 0, skipped: 0, failures: [] as string[] };
  if (!resendConfigured()) return out;
  const supabase = createServiceClient();
  const today = londonToday();
  const week = weekStartIso(today);
  const appUrl = siteUrl();

  const { data: configs } = await supabase
    .from("invoicing_config")
    .select("company_id, companies(name)")
    .eq("overdue_reminders_enabled", true);
  const companies = (configs as Array<{ company_id: string; companies: { name: string } | null }> | null) ?? [];

  for (const c of companies) {
    try {
      const { data: overdue } = await supabase
        .from("invoices")
        .select("id, number, due_date, total_pence, service_users(full_name)")
        .eq("company_id", c.company_id)
        .eq("status", "sent")
        .lt("due_date", today)
        .order("due_date", { ascending: true });
      const rows = (overdue as Array<{ id: string; number: string | null; due_date: string; total_pence: number; service_users: { full_name: string } | null }> | null) ?? [];
      if (rows.length === 0) continue;

      const companyName = c.companies?.name ?? "your company";
      const recipients = (await getRecipients(c.company_id)).filter((r) => MANAGER_PLUS.has(r.role));
      const listHtml = rows
        .map(
          (r) =>
            `<tr><td style="padding:4px 8px;color:#0d1d4b;">${escapeHtml(r.number ?? "Draft")}</td><td style="padding:4px 8px;color:#0d1d4b;">${escapeHtml(r.service_users?.full_name ?? "")}</td><td style="padding:4px 8px;color:#0d1d4b;">due ${escapeHtml(r.due_date)}</td><td style="padding:4px 8px;color:#0d1d4b;text-align:right;">${escapeHtml(formatMoney(r.total_pence))}</td></tr>`,
        )
        .join("");

      for (const recipient of recipients) {
        const subject = `${rows.length} overdue invoice${rows.length === 1 ? "" : "s"} at ${companyName}`;
        const logId = await claimNotification({
          companyId: c.company_id,
          recipientProfileId: recipient.profileId,
          channel: "email",
          kind: "invoice_overdue",
          dedupeKey: `invoice_overdue:${c.company_id}:${recipient.profileId}:${week}`,
          toAddress: recipient.email,
          subject,
          metadata: { overdue: rows.length },
        });
        if (!logId) {
          out.skipped += 1;
          continue;
        }
        const result = await sendEmail({
          to: recipient.email,
          subject,
          html: noticeEmailHtml({
            preheader: subject,
            heading: "Overdue invoices",
            bodyHtml: `<p style="margin:0 0 12px 0;">These private client invoices are past their due date and unpaid:</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">${listHtml}</table>`,
            ctaLabel: "Open Invoicing",
            ctaUrl: `${appUrl}/invoicing`,
          }),
        });
        if (result.sent) out.sent += 1;
        else if (result.skippedReason) out.skipped += 1;
        else out.failures.push(`overdue ${recipient.email}: ${result.error}`);
        await settleNotification(
          logId,
          result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
          result.error ?? result.skippedReason,
        );
      }
    } catch (e) {
      out.failures.push(`company ${c.company_id}: ${(e as Error).message}`);
    }
  }
  return out;
}
