/**
 * Be Care Compliant — turning a Setup Visit's funding answer into someone to invoice.
 *
 * WHY (Phil, 2026-09-09, of the Setup Visit's funding question): "if private, they need to be
 * added to the private invoicing" — then, the same day, that WHICH funding types we invoice
 * ourselves is the company's call, not the product's: a second tick box beside each accepted
 * funding option, reachable only once the option itself is ticked.
 *
 * He was right, and the first version of this file was wrong. It hard-coded private and
 * nhs_chc, and neither is universal: some agencies bill the health board direct for Continuing
 * Healthcare and some are paid through a framework; a direct payment is invoiced to the
 * individual by one agency and handled by a broker for another. The rule now lives in
 * company_funding_options.bills_privately, and this module only decides what to DO with it.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** A funding type as this company has configured it. */
export type CompanyFunding = {
  key: string;
  label: string;
  /** person for a self-funder or a direct payment, organisation for a council or health board. */
  payerType: "person" | "organisation";
  /** Ticked: we invoice this ourselves, so a Setup Visit answering it owes a Private Client. */
  billsPrivately: boolean;
};

/**
 * The funding type this Setup Visit answered with, IF this company invoices it itself.
 *
 * Returns null for everything else — an answer the company does not bill, an unanswered
 * question, or an answer that is not in their list at all. Null means do nothing, which is the
 * right outcome for a council-commissioned package: it is billed through the council's own
 * arrangements and never appears in Invoicing.
 */
export function billedFunding(
  funding: unknown,
  options: ReadonlyArray<CompanyFunding>,
): CompanyFunding | null {
  if (typeof funding !== "string" || !funding) return null;
  const match = options.find((o) => o.key === funding);
  return match && match.billsPrivately ? match : null;
}

/**
 * What to call the client record when it is created.
 *
 * A person payer is the service user or their family, so their name is the right starting
 * point and usually the finished answer. An organisation payer is a council, health board or
 * charity we have NOT been told the name of — inventing one would be a screen stating a fact
 * it does not have — so the record is named for the person the care is for, tagged with the
 * funding type, and the office corrects it.
 */
export function payerNameFor(funding: CompanyFunding, serviceUserName: string): string {
  const name = serviceUserName.trim() || "Unnamed service user";
  return funding.payerType === "organisation" ? `${name} (${funding.label})` : name;
}

/** The note left on a freshly created record, saying where it came from and what is missing. */
export function payerNoteFor(funding: CompanyFunding, todayIso: string): string {
  return `Created from the Setup Visit on ${todayIso}. Funding: ${funding.label}. Billing contact, address and payment terms still to be filled in.`;
}
