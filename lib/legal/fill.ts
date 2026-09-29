/**
 * The contract's moving parts, as pure functions (Phase 13, "The contract in the app").
 *
 *   fillLegalText      puts the supplier details into the {{tokens}}; a missing one reads as the
 *                      bracketed placeholder it replaces, so a draft never prints "null".
 *   missingSupplier    which details are still to be filled in (the contract is a draft until none).
 *   onboardingFeeLabel what the Order says about the onboarding fee.
 *   checkOrder         the accept form's own checks; the database checks the same limits.
 *
 * Pure and importless (types only) so node --test runs it.
 */

import type { Supplier } from "./supplier";

const TOKENS: Array<{ token: string; key: keyof Supplier; placeholder: string; label: string }> = [
  { token: "{{supplier_name}}", key: "name", placeholder: "[Company name]", label: "Company name" },
  { token: "{{supplier_number}}", key: "number", placeholder: "[Company number]", label: "Company number" },
  { token: "{{supplier_address}}", key: "address", placeholder: "[Registered address]", label: "Registered address" },
  { token: "{{supplier_ico}}", key: "ico", placeholder: "[ICO registration number]", label: "ICO registration number" },
  { token: "{{liability_floor}}", key: "liabilityFloor", placeholder: "£[ ]", label: "Minimum liability amount (clause 14.4)" },
  { token: "{{publication_date}}", key: "publicationDate", placeholder: "Draft", label: "Publication date" },
];

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/** The supplier details still to be filled in, in the words Phil would use. */
export function missingSupplier(s: Supplier): string[] {
  return TOKENS.filter((t) => blank(s[t.key])).map((t) => t.label);
}

/** The text with every token replaced. */
export function fillLegalText(text: string, s: Supplier): string {
  let out = text;
  for (const t of TOKENS) {
    const v = s[t.key];
    out = out.split(t.token).join(blank(v) ? t.placeholder : (v as string).trim());
  }
  return out;
}

export const ORGANISATION_TYPES = [
  { value: "limited_company", label: "Limited company" },
  { value: "charity", label: "Charity" },
  { value: "partnership", label: "Partnership" },
  { value: "sole_trader", label: "Sole trader" },
  { value: "other", label: "Other" },
] as const;

export type OrganisationType = (typeof ORGANISATION_TYPES)[number]["value"];

export function organisationLabel(v: string): string {
  return ORGANISATION_TYPES.find((o) => o.value === v)?.label ?? v;
}

export type BillingOption = "monthly" | "annual";

export function planLabel(tier: string | null | undefined): string {
  if (tier === "pro") return "Pro";
  if (tier === "black") return "Black";
  return "Business";
}

/**
 * The Order's onboarding line. Black accounts are granted by us and have no onboarding fee. For
 * everybody else it is waived while the offer runs (lib/marketing/offer.ts decides that and passes
 * the answer in), and otherwise it is the fee from the Price List.
 */
export function onboardingFeeLabel(input: {
  tier: string | null | undefined;
  offerActive: boolean;
  fee: string;
  offerEnd: string;
}): string {
  if (input.tier === "black") return "Not applicable (Black account)";
  if (input.offerActive) return `Waived (joined by ${input.offerEnd})`;
  return `${input.fee} plus VAT`;
}

export type OrderInput = {
  legalName: string;
  organisationType: string;
  companyNumber: string;
  address: string;
  billingOption: string;
  accepted: boolean;
};

/** The accept form's checks, one message per field. Empty object means it can be accepted. */
export function checkOrder(o: OrderInput): Partial<Record<keyof OrderInput, string>> {
  const e: Partial<Record<keyof OrderInput, string>> = {};
  const name = o.legalName.trim();
  if (name.length < 2) e.legalName = "Enter your company's legal name.";
  else if (name.length > 200) e.legalName = "That name is too long.";
  if (!ORGANISATION_TYPES.some((t) => t.value === o.organisationType)) e.organisationType = "Choose the type of organisation.";
  const num = o.companyNumber.trim();
  if ((o.organisationType === "limited_company" || o.organisationType === "charity") && num === "") {
    e.companyNumber = o.organisationType === "charity" ? "Enter your charity number." : "Enter your company number.";
  } else if (num.length > 40) e.companyNumber = "That number is too long.";
  const addr = o.address.trim();
  if (addr.length < 5) e.address = "Enter your registered or main address.";
  else if (addr.length > 500) e.address = "That address is too long.";
  if (o.billingOption !== "monthly" && o.billingOption !== "annual") e.billingOption = "Choose Monthly or Annual.";
  if (!o.accepted) e.accepted = "Tick the box to confirm you accept both agreements.";
  return e;
}

export type AcceptanceLite = { agreement_version: string; dpa_version: string; is_draft: boolean };

/**
 * Has this company accepted what is in force now? The versions must both match. Once the text is
 * published a DRAFT acceptance (made while the founder was testing the gate) no longer counts, so
 * a test company is asked again for the real thing.
 */
export function acceptanceCurrent(
  rows: AcceptanceLite[],
  versions: { agreement: string; dpa: string },
  published: boolean,
): boolean {
  return rows.some(
    (r) => r.agreement_version === versions.agreement && r.dpa_version === versions.dpa && (!published || !r.is_draft),
  );
}

/** Is a Company Admin asked at all? Everyone once published; before that, only a test company. */
export function agreementGateOn(published: boolean, agreementRequired: boolean): boolean {
  return published || agreementRequired;
}
