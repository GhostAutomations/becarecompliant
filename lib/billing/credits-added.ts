/**
 * Be Care Compliant — the "Credits added" list on Billing (Phil, 2026-10-14, popup "A short
 * Credits added list on Billing"; docs/decisions/goodwill-credits.md).
 *
 * Pure and import free so node --test can load it. The last credits ADDED to the company's SMS and
 * AI balances, newest first: the monthly allowance, top ups and goodwill from the Founder. Spends,
 * refunds of a failed AI request and adjustments are not additions and are left out. Only the
 * ledger's own amount, reason and date are used, so the Founder's reason and private note (on
 * goodwill_grants, which the company cannot read) can never appear here.
 */

export type LedgerRow = { delta: number; reason: string; created_at: string };
export type CreditAdded = { key: string; text: string; date: string };

const ADDED: Record<string, string> = {
  goodwill: "goodwill from Be Care Compliant",
  monthly_grant: "monthly allowance",
  topup: "top up",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Oct 2026", the day in London. */
function londonDay(iso: string): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
  return `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}

export function creditsAdded(sms: LedgerRow[], ai: LedgerRow[], limit = 12): CreditAdded[] {
  const rows = [
    ...sms.map((r) => ({ ...r, kind: "SMS" })),
    ...ai.map((r) => ({ ...r, kind: "AI" })),
  ].filter((r) => r.delta > 0 && r.reason in ADDED);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return rows.slice(0, limit).map((r, i) => ({
    key: `${r.kind}-${r.created_at}-${i}`,
    text: `+${r.delta.toLocaleString("en-GB")} ${r.kind} ${r.delta === 1 ? "credit" : "credits"}, ${ADDED[r.reason]}`,
    date: londonDay(r.created_at),
  }));
}
