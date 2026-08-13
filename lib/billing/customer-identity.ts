/**
 * Be Care Compliant — what, if anything, to change on a Stripe customer record.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the rule is unit testable without Stripe.
 *
 * WHY THIS EXISTS. The Stripe customer is written once, at the first checkout, and Stripe is
 * what prints on the invoice, the receipt and the card statement. Nothing ever updated it, so
 * a company that renamed kept its old name on every future invoice for ever. Acme is the live
 * example: set up as "Thistle Care Wales", renamed in BCC, still Thistle Care Wales in Stripe
 * a month later. For a care agency that rebrands or is bought, the invoice has to carry the
 * name it files accounts under.
 *
 * The rule is deliberately conservative: only overwrite what we actually know, and only when
 * it differs. An empty name in BCC must never blank a name somebody typed into Stripe.
 */

export type CustomerIdentity = {
  name?: string | null;
  email?: string | null;
};

/**
 * The fields to send to stripe.customers.update, or null when there is nothing to do.
 *
 * Returning null rather than an empty object is the point: the caller skips the API write
 * entirely, so the ordinary case (nothing changed) costs one read and no write.
 */
export function customerIdentityPatch(
  current: CustomerIdentity | null | undefined,
  wanted: CustomerIdentity | null | undefined,
): { name?: string; email?: string } | null {
  const name = clean(wanted?.name);
  const email = clean(wanted?.email);
  const patch: { name?: string; email?: string } = {};

  // Blank is "we do not know", never "set it to blank". Wiping a name Stripe already holds
  // because our own record happens to be empty would make the invoice worse, not better.
  if (name && clean(current?.name) !== name) patch.name = name;
  if (email && lower(clean(current?.email)) !== lower(email)) patch.email = email;

  return Object.keys(patch).length > 0 ? patch : null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Email case is not significant, and Stripe stores whatever was sent. Comparing case
 *  sensitively would rewrite the same address every single checkout. */
function lower(value: string): string {
  return value.toLowerCase();
}
