/** The Twilio balance colour on the Founder console (Phil's popup, 2026-10-15): amber below 20,
 *  red below 10, in the account's own currency. Pure and importless, so node --test runs it. */
export const TWILIO_AMBER_BELOW = 20;
export const TWILIO_RED_BELOW = 10;

export function balanceTone(balance: number): "red" | "amber" | "green" {
  if (balance < TWILIO_RED_BELOW) return "red";
  if (balance < TWILIO_AMBER_BELOW) return "amber";
  return "green";
}
