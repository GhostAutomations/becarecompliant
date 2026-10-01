import "server-only";

/**
 * THE 10 DAY SET UP ALERT (Phil, popup 2026-10-01: "10 days after creation, once").
 *
 * Every morning: any company created ten or more days ago that has not had its check yet
 * (companies.setup_alert_at is null). If Getting set up is not finished, the founder is told ONCE,
 * in the Founder Inbox and by email, with what is still to do. Either way the company is stamped,
 * so it is never looked at again.
 *
 * SAFE TO RUN TWICE: the stamp is claimed with "where setup_alert_at is null" before anything is
 * sent, so a second fire (or two overlapping runs) finds nothing to claim. If the founder could
 * not be told at all, the claim is given back, so tomorrow tries again rather than losing it.
 *
 * Left out: deleted companies and demo companies (a demo is a sales login, not a customer).
 * Companies that existed before this went live were stamped by 0367.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { notifyFounder } from "@/lib/founder/notify";
import { getSetupCardAsService } from "./status";
import { SETUP_ALERT_DAYS, outstandingByGroup, setupAlertDue } from "./getting-set-up";

export type SetupAlertResult = { checked: number; alerted: string[]; finished: string[]; errors: string[] };

export async function runSetupOverdueAlerts(now: Date): Promise<SetupAlertResult> {
  const admin = createServiceClient();
  const result: SetupAlertResult = { checked: 0, alerted: [], finished: [], errors: [] };
  const cutoff = new Date(now.getTime() - SETUP_ALERT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: due, error }, { data: demos }] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, created_at")
      .is("setup_alert_at", null)
      .is("deleted_at", null)
      .lte("created_at", cutoff),
    admin.from("demos").select("company_id"),
  ]);
  if (error) {
    result.errors.push(`companies: ${error.message}`);
    return result;
  }
  const demoIds = new Set(((demos as Array<{ company_id: string | null }> | null) ?? []).map((d) => d.company_id));

  for (const c of (due as Array<{ id: string; name: string; created_at: string }> | null) ?? []) {
    if (demoIds.has(c.id) || !setupAlertDue(c.created_at, now)) continue;
    result.checked += 1;

    const card = await getSetupCardAsService(c.id);
    if (!card) {
      result.errors.push(`${c.name}: set up status could not be read`);
      continue;
    }

    // Claim it first: whoever claims it is the only run that may send.
    const stamp = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("companies")
      .update({ setup_alert_at: stamp })
      .eq("id", c.id)
      .is("setup_alert_at", null)
      .select("id");
    if (claimError) {
      result.errors.push(`${c.name}: ${claimError.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    if (card.finished) {
      result.finished.push(c.name);
      continue;
    }

    const { data: admins } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("company_id", c.id)
      .eq("role", "company_admin")
      .neq("status", "disabled")
      .order("created_at", { ascending: true })
      .limit(1);
    const contact = ((admins as Array<{ email: string | null; full_name: string | null }> | null) ?? [])[0] ?? null;

    const left = outstandingByGroup(card.groups);
    const created = new Date(c.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/London",
    });
    const intro = `${c.name} was created on ${created} and has not finished getting set up: ${card.settled} of ${card.total} steps are done.`;
    const listHtml = left
      .map(
        (g) =>
          `<p style="margin:12px 0 4px;font-weight:600;">${escapeHtml(g.title)}</p><ul style="margin:0;padding-left:20px;">${g.labels
            .map((l) => `<li>${escapeHtml(l)}</li>`)
            .join("")}</ul>`,
      )
      .join("");
    const contactLine = contact?.email
      ? `<p>Their Admin is ${escapeHtml(contact.full_name || contact.email)} (${escapeHtml(contact.email)}). Reply to reach them.</p>`
      : "<p>They have no Admin signed up yet.</p>";
    const bodyText = [
      intro,
      "",
      "Still to do:",
      ...left.flatMap((g) => [`${g.title}:`, ...g.labels.map((l) => `  ${l}`)]),
      "",
      contact?.email ? `Their Admin is ${contact.full_name || contact.email} (${contact.email}).` : "They have no Admin signed up yet.",
    ].join("\n");

    const told = await notifyFounder({
      subject: `Set up not finished: ${c.name}`,
      heading: `${c.name} has not finished setting up`,
      preheader: `${card.settled} of ${card.total} set up steps done after ${SETUP_ALERT_DAYS} days`,
      bodyHtml: `<p>${escapeHtml(intro)}</p><p>Still to do:</p>${listHtml}${contactLine}`,
      bodyText,
      ctaLabel: "Open the company",
      ctaUrl: `${siteUrl()}/founder/companies/${c.id}`,
      companyId: c.id,
      fromAddress: contact?.email ?? null,
      fromName: contact?.email ? `${c.name} (set up alert)` : null,
      replyTo: contact?.email ?? null,
    });

    if (!told.inbox && !told.emailed) {
      // Nobody heard: give the claim back so tomorrow tries again.
      await admin.from("companies").update({ setup_alert_at: null }).eq("id", c.id).eq("setup_alert_at", stamp);
      result.errors.push(`${c.name}: the founder could not be told (inbox and email both failed)`);
      continue;
    }
    result.alerted.push(c.name);
  }
  return result;
}
