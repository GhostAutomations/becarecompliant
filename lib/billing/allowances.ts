/**
 * What each plan includes each month, in one place (was written out inside the Billing page).
 * The Billing page and the contract's Order both read these, so the Order a Company Admin
 * accepts always says what Billing shows.
 *
 * SMS mirrors tier_monthly_sms_credits in migration 0159. Business gets no texts: SMS escalation
 * is a Pro feature.
 *
 * PRICE_LIST_DATE is the date the current prices took effect (Phil, 2026-09-29: Business £79,
 * Pro £129, extra user £5, extra branch £25). Change it whenever a price changes, so every Order
 * accepted after that names the right Price List.
 *
 * Pure and importless so node --test and client components can use it.
 */

export const AI_MONTHLY_CREDITS: Record<string, number> = { business: 25, pro: 50, black: 1000 };
export const SMS_MONTHLY_CREDITS: Record<string, number> = { business: 0, pro: 100, black: 2000 };

export function aiMonthlyCredits(tier: string | null | undefined): number {
  return AI_MONTHLY_CREDITS[tier ?? ""] ?? AI_MONTHLY_CREDITS.business;
}

export function smsMonthlyCredits(tier: string | null | undefined): number {
  return SMS_MONTHLY_CREDITS[tier ?? ""] ?? 0;
}

export const PRICE_LIST_DATE = "29 September 2026";

/** Annual is ten months of the monthly price, paid yearly (Phil, 2026-09-29). */
export const ANNUAL_MONTHS_CHARGED = 10;
