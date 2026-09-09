/**
 * Be Care Compliant — which Setup Visits produce someone to invoice.
 *
 * WHY (Phil, 2026-09-09, of the Setup Visit's new funding question): "if private, they need
 * to be added to the private invoicing."
 *
 * A package the council commissions is billed through the council's own arrangements and
 * never appears in Invoicing. Two of the ten funding types are billed by us, directly, and
 * they are the two Phil picked:
 *
 *   private   — the person or their family pays. A person to invoice.
 *   nhs_chc   — the health board funds the package and the provider invoices the board.
 *               An organisation to invoice, for care given to one named person.
 *
 * Deliberately NOT included, though a case could be made and Phil was offered both: a Local
 * Authority direct payment (the council's money, invoiced to the individual) and a
 * compensation or Court of Protection package. Add them here if that changes — this list is
 * the only place the rule is written down.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** The funding answers that mean somebody gets an invoice from us. */
export const DIRECT_BILLED_FUNDING = ["private", "nhs_chc"] as const;

export type DirectBilledFunding = (typeof DIRECT_BILLED_FUNDING)[number];

/** Does this Setup Visit answer mean a Private Client record is owed? */
export function billsDirectly(funding: unknown): funding is DirectBilledFunding {
  return (
    typeof funding === "string" &&
    (DIRECT_BILLED_FUNDING as readonly string[]).includes(funding)
  );
}

/**
 * Whether the payer is a person or an organisation.
 *
 * A private client is the person or their family. Continuing Healthcare is invoiced to the
 * health board, so the payer is an organisation even though the care is one person's — which
 * is exactly why private_clients carries BOTH a client_type and a service_user_id.
 */
export function payerTypeFor(funding: DirectBilledFunding): "person" | "organisation" {
  return funding === "nhs_chc" ? "organisation" : "person";
}

/**
 * What to call the client record when it is created.
 *
 * For a private client the payer is almost always the service user or their family, so their
 * name is the right starting point and usually the finished answer. For Continuing Healthcare
 * we do NOT know which health board, and inventing one would be a screen stating a fact it
 * does not have — so it is named for the person the care is for and the office corrects it.
 */
export function payerNameFor(funding: DirectBilledFunding, serviceUserName: string): string {
  const name = serviceUserName.trim() || "Unnamed service user";
  return funding === "nhs_chc" ? `${name} (Continuing Healthcare)` : name;
}

/** The note left on a freshly created record, saying where it came from and what is missing. */
export function payerNoteFor(funding: DirectBilledFunding, todayIso: string): string {
  const source =
    funding === "nhs_chc"
      ? "NHS Continuing Healthcare — invoice the health board"
      : "Private / self funded";
  return `Created from the Setup Visit on ${todayIso}. Funding: ${source}. Billing contact, address and payment terms still to be filled in.`;
}
