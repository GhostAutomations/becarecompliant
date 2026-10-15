import { createClient } from "@/lib/supabase/server";
import { balanceTone, getTwilioBalance } from "@/lib/sms/balance";

/**
 * The Twilio balance on the Founder console (Phil, 2026-10-15; docs/decisions/sms-one-segment.md).
 * Streamed in on its own (the console never waits for it), read on the server, kept 15 minutes and
 * then read again on the next visit. Shaped like the other headline tiles so the five sit on one
 * line at the same height (Phil, 2026-10-15): the balance, and beneath it the credits customers
 * hold (test companies left out); SMS sent this month is on the Usage tile beside it. Founder
 * only: rendered on the Founder console, which requires a platform admin.
 */

const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function money(amount: number, currency: string): string {
  const symbol = SYMBOL[currency];
  const n = amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${n}` : `${n} ${currency}`;
}

export async function TwilioBalanceTile() {
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
      {balance.ok ? (
        <p className="mt-1 text-xs text-white/50">{creditsHeld.toLocaleString("en-GB")} credits held by customers</p>
      ) : (
        <p className="mt-1 text-xs text-red-300">{balance.reason}</p>
      )}
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
