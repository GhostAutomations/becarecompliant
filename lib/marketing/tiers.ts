/**
 * Public pricing tiers shown on the marketing site. Prices and the feature split
 * mirror the billing ladder in lib/billing/tier.ts (agreed with Phil): Business is
 * core compliance, Pro adds SMS + reporting/exports + the form builder, Enterprise
 * adds AI + integrations + priority support. Base price includes 4 users, then £5
 * per extra user per month. No em dashes in any customer-facing copy.
 */

export type PricingTier = {
  key: "business" | "pro" | "enterprise";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  featured?: boolean;
  /** "Everything in X, plus:" lead-in for stacked tiers. */
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
      "Built in forms stored as inspection evidence",
      "Email reminders and the daily compliance digest",
      "One branch included, four users included",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "£99",
    cadence: "per month",
    tagline: "For growing providers who want reporting and reminders.",
    featured: true,
    inherits: "Everything in Business, plus:",
    features: [
      "SMS reminders",
      "Reporting and inspector ready exports in PDF and CSV",
      "The form builder to create and version your own forms",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "£199",
    cadence: "per month",
    tagline: "For multi service groups and more complex needs.",
    inherits: "Everything in Pro, plus:",
    features: [
      "AI assistance, including policy parsing",
      "The integration layer for your other systems",
      "Priority support",
    ],
  },
];

export const PRICING_FOOTNOTE =
  "Every plan includes four users. Extra users are £5 each per month. Additional branches are available as an add on. Prices exclude VAT.";
