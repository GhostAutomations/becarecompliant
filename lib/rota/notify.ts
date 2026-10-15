import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/twilio";
import { createSmsLink } from "@/lib/sms/links";
import { rotaChangedText, rotaOfferText, rotaPublishedText } from "@/lib/sms/texts";
import { ukMobileToE164 } from "@/lib/absence/rtw-questions";

/**
 * Be Care Compliant: the rota's texts to carers (Stage 1, Phil 2026-10-15).
 *
 *   published  once per carer when a week is published
 *   changed    once per carer when a published shift of theirs changes
 *   offer      to the carers the office picks, for an open shift
 *
 * Everything goes through the shared sender (lib/sms/twilio.ts): one SMS, one credit, opt outs
 * honoured, a demo sends nothing and a test company (Bevan) texts nobody but the Founder. Every
 * attempt is written to rota_texts with what happened, so a text that did not go is visible.
 * Called only after the caller has passed the rota guard; the service client is used only to read
 * names and numbers and to write the log.
 */

type Kind = "published" | "changed" | "offer";

export type TextOutcome = { sent: number; notSent: { name: string; why: string }[] };

export async function textCarers(opts: {
  companyId: string;
  branchId: string;
  personIds: string[];
  kind: Kind;
  sentBy: string;
  shiftId?: string | null;
  /** published: the week, e.g. "2 Nov". offer: when, e.g. "Mon 2 Nov, 08:00 to 14:00". */
  label?: string;
}): Promise<TextOutcome> {
  const outcome: TextOutcome = { sent: 0, notSent: [] };
  const ids = [...new Set(opts.personIds)];
  if (ids.length === 0) return outcome;
  const service = createServiceClient();
  const [{ data: people }, { data: company }] = await Promise.all([
    service.from("people").select("id, full_name, mobile, company_id").in("id", ids).eq("company_id", opts.companyId),
    service.from("companies").select("name").eq("id", opts.companyId).maybeSingle(),
  ]);
  const companyName = (company as { name: string | null } | null)?.name ?? "Your employer";
  const link = await createSmsLink({
    companyId: opts.companyId,
    targetPath: "/my",
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  for (const p of (people as { id: string; full_name: string | null; mobile: string | null }[] | null) ?? []) {
    const name = p.full_name ?? "A carer";
    const first = name.split(/\s+/)[0] ?? "";
    let result: string;
    const to = p.mobile ? ukMobileToE164(p.mobile) : null;
    if (!link) {
      result = "not sent: the link could not be made";
    } else if (!to) {
      result = "not sent: no mobile number on their record";
    } else {
      const fitted =
        opts.kind === "published"
          ? rotaPublishedText({ firstName: first, companyName, weekLabel: opts.label ?? "", link })
          : opts.kind === "offer"
            ? rotaOfferText({ firstName: first, companyName, when: opts.label ?? "", link })
            : rotaChangedText({ firstName: first, companyName, link });
      if (!fitted.ok) {
        result = `not sent: ${fitted.error}`;
      } else {
        const r = await sendSms({ to, body: fitted.text, companyId: opts.companyId, metadata: { kind: `rota_${opts.kind}`, person_id: p.id } });
        result = r.sent ? "sent" : `not sent: ${r.skippedReason ?? r.error ?? "unknown"}`;
      }
    }
    if (result === "sent") outcome.sent += 1;
    else outcome.notSent.push({ name, why: result.replace(/^not sent: /, "") });
    await service.from("rota_texts").insert({
      company_id: opts.companyId,
      branch_id: opts.branchId,
      person_id: p.id,
      shift_id: opts.shiftId ?? null,
      kind: opts.kind,
      result,
      sent_by: opts.sentBy,
    });
  }
  return outcome;
}

/** "3 sent", or "1 sent; not sent to Sam (no mobile number on their record)". */
export function textSummary(o: TextOutcome): string {
  const parts = [`${o.sent} text${o.sent === 1 ? "" : "s"} sent`];
  if (o.notSent.length) parts.push(`not sent to ${o.notSent.map((n) => `${n.name} (${n.why})`).join(", ")}`);
  return parts.join("; ");
}
