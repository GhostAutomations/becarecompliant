/**
 * The free onboarding offer on the pricing page (Phil, 2026-09-29): "Start 2027 inspection
 * ready. Free onboarding when you join by 31 December."
 *
 * The fee has to be real for the offer to be honest, so from 1 January 2027 the page stops
 * saying free on its own: every screen asks onboardingOfferActive(today) rather than trusting
 * copy that somebody has to remember to take down. "Join" means the agreement is signed and
 * the first payment made by the end date, and the page says so.
 *
 * Pure and importless so node --test runs it and client components can import it.
 */

/** One off onboarding: records imported, their own forms built, checks set up, a walkthrough. */
export const ONBOARDING_FEE = "£295";
export const ONBOARDING_FEE_PENCE = 29500;

/** Last day a new care company can join and have onboarding free (Europe/London date). */
export const ONBOARDING_OFFER_END_ISO = "2026-12-31";
/** The same date as customers read it. */
export const ONBOARDING_OFFER_END_TEXT = "31 December 2026";
/** The first day the fee applies. */
export const ONBOARDING_FEE_FROM_TEXT = "1 January 2027";

export const OFFER_HEADLINE = "Start 2027 inspection ready. Free onboarding when you join by 31 December.";

/** True up to and including the end date. todayIso is a Europe/London YYYY-MM-DD. */
export function onboardingOfferActive(todayIso: string): boolean {
  return todayIso <= ONBOARDING_OFFER_END_ISO;
}
