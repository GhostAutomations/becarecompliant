/**
 * Public pricing tiers shown on the marketing site (two plans, agreed with Phil; prices
 * raised 2026-09-29 to £79 and £129, branch £25, annual at ten months).
 * Business is core compliance with 25 AI credits a month; Pro adds Complaints, all
 * reports, SMS, the form builder and priority support, with more included branches,
 * users and AI credits. Marketing only: the billing backend keeps its own tiers.
 * No em dashes in any customer-facing copy.
 */

export type PricingTier = {
  key: "business" | "pro";
  name: string;
  price: string;
  /** Ten months of the monthly price, paid yearly (Phil, 2026-09-29). Set up by the founder
   *  until annual card billing is built. */
  annualPrice: string;
  /** Two months of the monthly price: what paying yearly saves. */
  annualSaving: string;
  cadence: string;
  tagline: string;
  featured?: boolean;
  /** "Everything in Business, plus:" lead-in for the stacked Pro tier. */
  inherits?: string;
  features: string[];
};

export const PRICING_TIERS: PricingTier[] = [
  {
    key: "business",
    name: "Business",
    price: "£79",
    annualPrice: "£790",
    annualSaving: "£158",
    cadence: "per month",
    tagline: "One care service, one branch, the compliance you cannot afford to miss.",
    features: [
      "People and Service User registers",
      "Recurring compliance checks with red, amber, green status",
      "Holiday and absence tracking",
      "Training records",
      "Company dashboard",
      "Role based access",
      "Bulk import to take on an existing service",
      "Built in forms stored as inspection evidence",
      "Email reminders and the daily compliance digest",
      "Basic reporting: the compliance register",
      "AI access, 25 credits a month",
      "One branch and four users included, plus free carer logins",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "£129",
    annualPrice: "£1,290",
    annualSaving: "£258",
    cadence: "per month",
    tagline: "Every report, Complaints and a second branch, for providers with more to prove.",
    featured: true,
    inherits: "Everything in Business, plus:",
    features: [
      "Complaints management",
      "Personal outcomes and satisfaction tracking for the PQS",
      "All reports: PQS return, evidence packs, audit trail and training",
      "SMS reminders, 100 texts a month",
      "The form builder to create and version your own forms",
      "Priority support",
      "AI access, 50 credits a month",
      "Two branches and six users included, plus free carer logins",
    ],
  },
];

export const PRICING_FOOTNOTE =
  "All prices exclude VAT. Carer logins are free and never count towards your included users. A user is someone who signs in to run compliance, and extra users are £5 each per month. Extra branches are £25 each per month. AI credits carry over until used, and 100 more cost £10. Annual plans are paid yearly in advance.";
