/**
 * Public pricing tiers shown on the marketing site (two plans, agreed with Phil).
 * Business is core compliance with 25 AI credits a month; Pro adds Complaints, all
 * reports, SMS, the form builder and priority support, with more included branches,
 * users and AI credits. Marketing only: the billing backend keeps its own tiers.
 * No em dashes in any customer-facing copy.
 */

export type PricingTier = {
  key: "business" | "pro";
  name: string;
  price: string;
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
    price: "£49",
    cadence: "per month",
    tagline: "For a single care service getting inspection ready.",
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
      "One branch and four users included",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "£69",
    cadence: "per month",
    tagline: "For growing providers who want every report and more room.",
    featured: true,
    inherits: "Everything in Business, plus:",
    features: [
      "Complaints management",
      "Personal outcomes and satisfaction tracking for the PQS",
      "All reports: PQS return, evidence packs, audit trail and training",
      "SMS reminders",
      "The form builder to create and version your own forms",
      "Priority support",
      "AI access, 50 credits a month",
      "Two branches and six users included",
    ],
  },
];

export const PRICING_FOOTNOTE =
  "Extra users are £5 each per month and extra branches £7.50 each per month. AI credits carry over until used; top up 100 credits for £10. All prices exclude VAT.";
