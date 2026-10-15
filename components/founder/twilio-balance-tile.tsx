import { createClient } from "@/lib/supabase/server";
import { balanceTone, getTwilioBalance } from "@/lib/sms/balance";
import { TwilioRefreshButton } from "@/components/founder/twilio-refresh-button";

/**
 * The Twilio balance on the Founder console (Phil, 2026-10-15; docs/decisions/sms-one-segment.md).
 * Streamed in on its own (the console never waits for it), read on the server, kept 15 minutes.
 * Beside it, what that money has to cover: SMS segments sent this month across every company, and
 * the credits customers hold (test companies left out). Founder only: rendered on the Founder
 * console, which requires a platform admin.
 */

const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function money(amount: number, currency: string): string {
  const symbol = SYMBOL[currency];
  const n = amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${n}` : `${n} ${currency}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

export async function TwilioBalanceTile({ smsSegmentsThisMonth }: { smsSegmentsThisMonth: number }) {
  const supabase = await createClient();
  const [balance, { data: held }] = await Promise.all([
    getTwilioBalance(),
    supabase.from("company_sms_credits").select("balance, companies!inner(is_test)").eq("companies.is_test", false),
  ]);
  const creditsHeld = ((held as Array<{ balance: number }> | null) ?? []).reduce((n, r) => n + Number(r.balance ?? 0), 0);
  const tone = balance.ok ? balanceTone(balance.balance) : "red";
  const colour = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-white";

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">Twilio balance</p>
        <p className={`text-2xl font-semibold leading-none ${colour}`}>
          {balance.ok ? money(balance.balance, balance.currency) : "Unknown"}
        </p>
      </div>
      {balance.ok ? null : <p className="mt-1 text-xs text-red-300">{balance.reason}</p>}
      <p className="mt-1 text-xs text-white/50">
        {smsSegmentsThisMonth.toLocaleString("en-GB")} SMS sent this month. {creditsHeld.toLocaleString("en-GB")} credits held by customers.
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-white/40">Checked at {timeOf(balance.checkedAt)}</span>
        <TwilioRefreshButton />
      </div>
    </div>
  );
}

/** What shows for the moment the tile is still loading. */
export function TwilioBalancePlaceholder() {
  return (
    <div className="glass-card p-4" aria-busy="true">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">Twilio balance</p>
        <p className="text-2xl font-semibold leading-none text-white/30">…</p>
      </div>
      <p className="mt-1 text-xs text-white/40">Checking Twilio</p>
    </div>
  );
}
