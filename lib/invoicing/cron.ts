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
import { formatMoney, billingPeriodFor } from "./types";
import { londonToday } from "./data";
import { overdueForRecipient, type OverdueRow } from "./overdue-scope";
import { ukDate } from "@/lib/dates";
import { buildCarePlanLines, rateLookup, type PlanEntryRow } from "./care-plan-billing";
import { unitPricePence } from "@/lib/service-users/care-plan-consts";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export type ScheduleRunRow = {
  id: string;
  company_id: string;
  branch_id: string;
  service_user_id: string | null;
  frequency: string;
  interval_count: number;
  next_run_date: string;
  day_of_week: number | null;
  day_of_month: number | null;
};

export const SCHEDULE_RUN_COLUMNS =
  "id, company_id, branch_id, service_user_id, frequency, interval_count, next_run_date, day_of_week, day_of_month";

type DraftLine = {
  description: string;
  service: string | null;
  unit_label: string | null;
  handed: string | null;
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
  vat_rate: number;
  period_start: string | null;
  period_end: string | null;
};

export type DraftResult = {
  invoiceId: string;
  from: string;
  to: string;
  lineCount: number;
  totalPence: number;
  source: "care_plan" | "fixed_lines";
};

/**
 * Draft ONE invoice from a schedule, for the cadence period ENDING the day before
 * `runDate` (arrears, Phil 2026-07-27). Shared by the daily cron and the manual
 * "Draft it now" button, so what the button proves is what the cron does.
 *
 * Lines come from the care plan whenever the schedule was built from one and the
 * plan still covers the period, so a changed care plan is billed correctly instead
 * of replaying quantities frozen when the schedule was created. Otherwise the
 * schedule's own lines are replayed. EITHER WAY the amount is quantity times the price the
 * invoice prints, the same rule the builder follows.
 *
 * This function does NOT claim or advance the schedule; the caller decides that.
 */
export async function draftFromSchedule(
  supabase: SupabaseClient,
  sc: ScheduleRunRow,
  runDate: string,
): Promise<{ result?: DraftResult; error?: string }> {
  const { from, to } = billingPeriodFor(runDate, sc.frequency, sc.interval_count);

  const [{ data: su }, { data: cfg }, { data: lines }, { data: plan }] = await Promise.all([
    supabase
      .from("service_users")
      .select(
        "full_name, invoice_to, invoice_contact_name, invoice_address, invoice_phone, invoice_email, invoice_delivery",
      )
      .eq("id", sc.service_user_id)
      .maybeSingle(),
    supabase.from("invoicing_config").select("*").eq("company_id", sc.company_id).maybeSingle(),
    supabase
      .from("invoice_schedule_lines")
      .select("description, service, unit_label, handed, quantity, unit_price_pence, vat_rate, position, period_start, period_end")
      .eq("schedule_id", sc.id)
      .order("position", { ascending: true }),
    supabase
      .from("care_plan_entries")
      .select("day_of_week, service, unit, handed, quantity, effective_from, effective_to")
      .eq("service_user_id", sc.service_user_id)
      .order("position", { ascending: true }),
  ]);

  if (!su) return { error: "the client could not be read" };

  const config = (cfg ?? {}) as Record<string, unknown>;
  const vatEnabled = Boolean(config.vat_enabled);
  const terms = Number(config.default_payment_terms_days ?? 14);
  const rateFor = rateLookup(config);

  const scheduleLines = (lines as Array<{
    description: string; service: string | null; unit_label: string | null; handed: string | null;
    quantity: number; unit_price_pence: number; vat_rate: number; position: number;
    period_start: string | null; period_end: string | null;
  }> | null) ?? [];

  // A schedule is care-plan billed when the invoice it came from carried week dates.
  const carePlanBilled = scheduleLines.some((l) => l.period_start !== null);
  const planRows = (plan as PlanEntryRow[] | null) ?? [];

  let draftLines: DraftLine[] = [];
  let source: DraftResult["source"] = "fixed_lines";

  if (carePlanBilled && planRows.length > 0) {
    const derived = buildCarePlanLines(planRows, config, from, to);
    if (derived.length > 0) {
      source = "care_plan";
      draftLines = derived.map((l) => ({
        description: l.description,
        service: l.service,
        unit_label: l.unit,
        handed: l.handed,
        quantity: l.quantity,
        unit_price_pence: l.unit_price_pence,
        line_total_pence: l.line_total_pence,
        vat_rate: vatEnabled ? 20 : 0,
        period_start: l.period_start,
        period_end: l.period_end,
      }));
    }
  }

  /*
   * Fall back to the schedule's own lines, repriced at TODAY's rates.
   *
   * The unit price is recomputed alongside the total, not just the total. Repricing the amount
   * while printing a price frozen when the schedule was created would put two figures on the
   * invoice that disagree, and since 2026-08-01 the invoice prints the unit price.
   *
   * A rate that does not RESOLVE is different from a rate of zero. An unknown service label, an
   * unknown unit, or a company with no invoicing_config row at all would price the whole line at
   * nothing, so the stored price stands instead and the failure stays visible rather than
   * drafting a tidy, internally consistent £0.00 invoice.
   */
  if (draftLines.length === 0) {
    if (scheduleLines.length === 0) return { error: "the schedule has no lines" };
    draftLines = scheduleLines.map((l) => {
      const handed = l.handed === "double" ? "double" : "single";
      const rate = l.service ? rateFor(l.service) : undefined;
      /*
       * The price this line is billed at: today's rate when we could look one up, otherwise the
       * price the schedule was created with. A rate that does not RESOLVE is not the same as a
       * rate of zero: an unknown service label, an unknown unit, or a company with no
       * invoicing_config row would otherwise price the whole line at nothing and draft a tidy,
       * internally consistent £0.00 invoice.
       */
      const resolved =
        Boolean(l.unit_label) &&
        rate !== undefined &&
        unitPricePence(rate, l.unit_label as string, handed) > 0;
      const unitPrice = resolved
        ? unitPricePence(rate, l.unit_label as string, handed)
        : l.unit_price_pence;
      return {
        description: l.description,
        service: l.service,
        unit_label: l.unit_label,
        handed: l.handed,
        quantity: Number(l.quantity),
        unit_price_pence: unitPrice,
        // Quantity times the printed price, on both branches, so a recurring invoice multiplies
        // out on the page exactly as a hand built one does.
        line_total_pence: Math.round(Number(l.quantity) * unitPrice),
        vat_rate: vatEnabled ? l.vat_rate || 20 : 0,
        period_start: null,
        period_end: null,
      };
    });
  }

  let subtotal = 0;
  let vat = 0;
  for (const l of draftLines) {
    subtotal += l.line_total_pence;
    if (vatEnabled) vat += Math.round((l.line_total_pence * (l.vat_rate || 0)) / 100);
  }
  const total = subtotal + vat;

  const issued = londonToday();
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
      issue_date: issued,
      due_date: addDaysIso(issued, terms),
      subtotal_pence: subtotal,
      vat_pence: vat,
      total_pence: total,
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
  if (!inv) return { error: "the invoice could not be created" };

  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    draftLines.map((l, i) => ({
      invoice_id: inv.id,
      company_id: sc.company_id,
      description: l.description,
      service: l.service,
      unit_label: l.unit_label,
      handed: l.handed,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      line_total_pence: l.line_total_pence,
      vat_rate: l.vat_rate,
      period_start: l.period_start,
      period_end: l.period_end,
      position: i,
    })),
  );
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", inv.id);
    return { error: "the invoice lines could not be saved" };
  }

  return {
    result: { invoiceId: inv.id, from, to, lineCount: draftLines.length, totalPence: total, source },
  };
}

export async function runRecurringInvoices(): Promise<{ drafted: number; failures: string[] }> {
  const supabase = createServiceClient();
  const today = londonToday();
  const out = { drafted: 0, failures: [] as string[] };

  const { data: due } = await supabase
    .from("invoice_schedules")
    .select(SCHEDULE_RUN_COLUMNS)
    .eq("active", true)
    .lte("next_run_date", today);
  const schedules = (due as ScheduleRunRow[] | null) ?? [];

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

      // Bill the cadence that ended the day before the date this run was due for.
      const { result, error } = await draftFromSchedule(supabase, sc, sc.next_run_date);
      if (error || !result) {
        out.failures.push(`schedule ${sc.id}: ${error ?? "no invoice drafted"}`);
        continue;
      }
      out.drafted += 1;
    } catch (e) {
      out.failures.push(`schedule ${sc.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

export async function runOverdueReminders(): Promise<{
  sent: number;
  skipped: number;
  /** Recipients who had nothing overdue in their own branches, so were not emailed at all. */
  outOfScope: number;
  failures: string[];
}> {
  const out = { sent: 0, skipped: 0, outOfScope: 0, failures: [] as string[] };
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
        .select("id, number, branch_id, due_date, total_pence, service_users(full_name)")
        .eq("company_id", c.company_id)
        .eq("status", "sent")
        .lt("due_date", today)
        .order("due_date", { ascending: true });
      const rows = (overdue as OverdueRow[] | null) ?? [];
      if (rows.length === 0) continue;

      const companyName = c.companies?.name ?? "your company";
      const recipients = (await getRecipients(c.company_id)).filter((r) => MANAGER_PLUS.has(r.role));

      for (const recipient of recipients) {
        /*
         * SCOPED PER RECIPIENT. This list names private clients and what they owe, and it used to
         * go to every Manager in the company whatever branch the invoice belonged to. A Manager of
         * Cardiff and Newport was emailed seven Caerphilly invoices, client names and amounts
         * included. The register has enforced this through RLS all along; this path uses the
         * service role, so RLS never applies and the scoping has to be done here.
         */
        const mine = overdueForRecipient(rows, recipient);
        /*
         * Nothing overdue in their branches means no email at all, not an empty table. COUNTED,
         * because otherwise a future scoping regression that silences everybody would report
         * {sent: 0, skipped: 0} and read as an all clear rather than as a fault.
         */
        if (mine.length === 0) {
          out.outOfScope += 1;
          continue;
        }

        const listHtml = mine
          .map(
            (r) =>
              `<tr><td style="padding:4px 8px;color:#0d1d4b;">${escapeHtml(r.number ?? "Draft")}</td><td style="padding:4px 8px;color:#0d1d4b;">${escapeHtml(r.service_users?.full_name ?? "")}</td><td style="padding:4px 8px;color:#0d1d4b;">due ${escapeHtml(ukDate(r.due_date))}</td><td style="padding:4px 8px;color:#0d1d4b;text-align:right;">${escapeHtml(formatMoney(r.total_pence))}</td></tr>`,
          )
          .join("");
        const subject = `${mine.length} overdue invoice${mine.length === 1 ? "" : "s"} at ${companyName}`;
        const logId = await claimNotification({
          companyId: c.company_id,
          recipientProfileId: recipient.profileId,
          channel: "email",
          kind: "invoice_overdue",
          dedupeKey: `invoice_overdue:${c.company_id}:${recipient.profileId}:${week}`,
          toAddress: recipient.email,
          subject,
          metadata: { overdue: mine.length },
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
