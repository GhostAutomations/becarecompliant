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

/** A company's own word for a branch (0354), e.g. House / Houses. Defaults to Branch. */
export type OrderBranchWord = { one: string; many: string };
/** A two-step extra branch price: the first `after` extra branches at the normal price, the rest at `pricePence`. */
export type OrderBranchStep = { after: number; pricePence: number } | null;
const BRANCH: OrderBranchWord = { one: "Branch", many: "Branches" };
const low = (w: string) => w.charAt(0).toLowerCase() + w.slice(1);

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

/**
 * The text with every token replaced. {{version_line}} reads "Draft, subject to legal review"
 * until the text is published (Phil, 2026-09-30: drafts are unnumbered; the first published text
 * is 1.0 and every later change 1.1, 1.2 and so on), then "Version 1.0 · <publication date>".
 */
export function fillLegalText(text: string, s: Supplier, version = "1.0"): string {
  let out = text;
  for (const t of TOKENS) {
    const v = s[t.key];
    out = out.split(t.token).join(blank(v) ? t.placeholder : (v as string).trim());
  }
  const versionLine =
    missingSupplier(s).length > 0
      ? `Version ${version}, draft, subject to legal review`
      : `Version ${version} · ${(s.publicationDate as string).trim()}`;
  return out.split("{{version_line}}").join(versionLine);
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

/** "none" is a Black account: granted by us, never billed, so it is not asked (Phil, 2026-09-30). */
export type BillingOption = "monthly" | "annual" | "none";

/** Does this plan have a billing option at all? Black has no charge, so no. */
export function billingApplies(tier: string | null | undefined): boolean {
  return tier !== "black";
}

export function billingOptionLabel(v: string): string {
  if (v === "annual") return "Annual";
  if (v === "none") return "Not applicable (Black account)";
  return "Monthly";
}

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
  /** Extra users and extra branches on top of the plan (Phil, 2026-09-30). Only asked on a billed plan. */
  extraUsers?: string;
  extraBranches?: string;
  /** On Annual only: are the extras paid yearly with the plan, or monthly by card. */
  extrasBilling?: string;
};

/** The most extras one Order can ask for on screen; more is a conversation, not a form. */
export const MAX_EXTRA_USERS = 500;
export const MAX_EXTRA_BRANCHES = 50;

/** The accept form's checks, one message per field. Empty object means it can be accepted. */
export function checkOrder(o: OrderInput, opts: { billingApplies?: boolean } = {}): Partial<Record<keyof OrderInput, string>> {
  const billing = opts.billingApplies ?? true;
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
  if (billing && o.billingOption !== "monthly" && o.billingOption !== "annual") e.billingOption = "Choose Monthly or Annual.";
  if (!billing && o.billingOption !== "none") e.billingOption = "This plan has no billing option.";
  if (billing && o.extraUsers !== undefined) {
    const n = Number(o.extraUsers);
    if (o.extraUsers.trim() === "" || !Number.isInteger(n) || n < 0) e.extraUsers = "Enter how many extra users you need, 0 or more.";
    else if (n > MAX_EXTRA_USERS) e.extraUsers = `For more than ${MAX_EXTRA_USERS} extra users, please contact us.`;
  }
  if (billing && o.extraBranches !== undefined) {
    const n = Number(o.extraBranches);
    if (o.extraBranches.trim() === "" || !Number.isInteger(n) || n < 0) e.extraBranches = "Enter how many extra branches you need, 0 or more.";
    else if (n > MAX_EXTRA_BRANCHES) e.extraBranches = `For more than ${MAX_EXTRA_BRANCHES} extra branches, please contact us.`;
  }
  if (billing && o.billingOption === "annual" && o.extrasBilling !== undefined && o.extrasBilling !== "yearly" && o.extrasBilling !== "monthly") {
    e.extrasBilling = "Choose how to pay for the extras.";
  }
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

const pounds = (pence: number) =>
  `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * The Order's price line. Black has no charge. Monthly is the plan's monthly price; Annual is the
 * yearly price (ten months of the monthly price). Extra users and branches are on the Price List.
 */
export function orderPriceText(input: {
  tier: string | null | undefined;
  billingOption: string;
  monthlyPence: number | null;
  annualMonths: number;
}): string {
  if (input.tier === "black" || input.monthlyPence === null) return "No charge (Black account)";
  if (input.billingOption === "annual") {
    return `${pounds(input.monthlyPence * input.annualMonths)} a year plus VAT, paid yearly in advance`;
  }
  return `${pounds(input.monthlyPence)} a month plus VAT`;
}

/** The Order's "what is included" line. A very large number (Black) reads as unlimited. */
export function orderIncludedList(input: {
  users: number;
  branches: number;
  ai: number;
  sms: number;
  word?: OrderBranchWord;
}): string[] {
  const n = (v: number, one: string, many: string) => (v >= 9999 ? `unlimited ${many}` : `${v} ${v === 1 ? one : many}`);
  const w = input.word ?? BRANCH;
  return [
    n(input.users, "user", "users"),
    `office team and ${n(input.branches, low(w.one), low(w.many))}`,
    `${input.ai} AI credits a month`,
    input.sms > 0 ? `${input.sms} text messages a month` : "no text messages",
    "free carer logins",
  ];
}

/** The same, as one line for the agreement's Order and the stored record. Shown as bullets on screen. */
export function orderIncludedText(input: { users: number; branches: number; ai: number; sms: number; word?: OrderBranchWord }): string {
  return orderIncludedList(input).join(", ");
}

/**
 * THE ORDER TABLE, FILLED IN (Phil, 2026-09-30, testing the Pro Order on his phone: "shouldnt the
 * order tile be above the agreements so it populates the agreements"). The Subscription
 * Agreement ends with the Order as a blank template ("[ ]", "[Monthly / Annual]"). On the accept
 * screen the Admin now fills the Order in first and this puts their answers into that table, live,
 * so the agreement they read is the agreement they accept; "Your agreement" shows it filled from
 * the stored Order afterwards.
 *
 * Only the rows of the "## The Order" table change, and only the right hand cell. The fingerprint
 * stored with an acceptance is still of the standard wording (every customer accepts the same
 * terms); the Order itself is stored beside it, field by field.
 */
export const ORDER_ROWS = [
  "Customer legal name",
  "Type of organisation",
  "Company or charity number, if any",
  "Registered or main address",
  "Plan",
  "Price",
  "Included",
  "Extra users",
  "Extra branches",
  "Billing option",
  "Extras paid",
  "Total",
  "Price List",
  "Onboarding fee",
  "Start date",
  "Accepted by",
  "Accepted on",
  "Versions accepted",
] as const;

export type OrderRowLabel = (typeof ORDER_ROWS)[number];

/** A typed value made safe for one table cell: one line, no column breaks, no bold markers. */
function orderCell(v: string): string {
  return v
    .replace(/\r?\n+/g, ", ")
    .replace(/\|/g, "/")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
}

export function fillOrderTable(
  text: string,
  values: Partial<Record<OrderRowLabel, string>>,
  opts: { word?: OrderBranchWord } = {},
): string {
  const start = text.indexOf("\n## The Order");
  if (start < 0) return text;
  /* THEIR WORD FOR A BRANCH (0354, Phil 2026-09-30: "when they see their first contract, instead
     of branch, they would see the word house"). The Order says it their way, and one extra row
     ties their word to the agreement's defined term, so the standard wording above still binds. */
  const w = opts.word && opts.word.one.toLowerCase() !== "branch" ? opts.word : null;
  const tail = text
    .slice(start)
    .split("\n")
    .flatMap((line) => {
      const m = /^\| ([^|]+?) \| .* \|$/.exec(line);
      if (!m) return [line];
      const label = m[1] as OrderRowLabel;
      if (!(ORDER_ROWS as readonly string[]).includes(label)) return [line];
      const v = values[label];
      if (v === undefined) return [line];
      const c = orderCell(v);
      const shown = w && label === "Extra branches" ? `Extra ${low(w.many)}` : label;
      const row = `| ${shown} | ${c === "" ? "Not filled in yet" : c} |`;
      if (w && label === "Extra branches") {
        return [row, `| Your word for a branch | ${orderCell(`${w.one}. In this agreement, "Branch" means a ${low(w.one)}`)} |`];
      }
      return [row];
    })
    .join("\n");
  return text.slice(0, start) + tail;
}

/** Every row of the Order table from one set of answers, for the accept screen and the record. */
export function orderTableValues(o: {
  legalName: string;
  organisationType: string;
  companyNumber: string;
  address: string;
  plan: string;
  price: string;
  included: string;
  extraUsers: string;
  extraBranches: string;
  extrasPaid: string;
  total: string;
  billingOption: string;
  priceList: string;
  onboardingFee: string;
  startDate: string;
  acceptedBy: string;
  acceptedOn: string;
  agreementVersion: string;
  dpaVersion: string;
}): Record<OrderRowLabel, string> {
  return {
    "Customer legal name": o.legalName,
    "Type of organisation": organisationLabel(o.organisationType),
    "Company or charity number, if any": o.companyNumber.trim() === "" ? "None given" : o.companyNumber,
    "Registered or main address": o.address,
    Plan: o.plan,
    Price: o.price,
    Included: o.included,
    "Extra users": o.extraUsers,
    "Extra branches": o.extraBranches,
    "Extras paid": o.extrasPaid,
    Total: o.total,
    "Billing option": billingOptionLabel(o.billingOption),
    "Price List": o.priceList,
    "Onboarding fee": o.onboardingFee,
    "Start date": o.startDate,
    "Accepted by": `${o.acceptedBy}, Company Admin`,
    "Accepted on": o.acceptedOn,
    "Versions accepted": `Subscription Agreement ${o.agreementVersion}, Data Processing Agreement ${o.dpaVersion}`,
  };
}

/**
 * EXTRAS, NOT A BARE DATE (Phil, 2026-09-30: "Price List with the date 29/9 will confuse people").
 * The agreement charges extra users and branches at the Price List in force, so the Order still
 * pins its date, but says what it means: the extras prices, then "(prices from <date>)". This
 * whole line is what is stored with an acceptance, so the record keeps the prices of the day.
 */
export function orderExtrasText(input: {
  tier: string | null | undefined;
  seatPence: number;
  branchPence: number;
  step?: OrderBranchStep;
  word?: OrderBranchWord;
}): string {
  if (input.tier === "black") return "None, everything is included (Black account)";
  const w = input.word ?? BRANCH;
  const branch = input.step
    ? `${pounds(input.branchPence)} a month for each of the first ${input.step.after} extra ${input.step.after === 1 ? low(w.one) : low(w.many)} and ${pounds(input.step.pricePence)} a month for each extra ${low(w.one)} after that`
    : `${pounds(input.branchPence)} a month for each extra ${low(w.one)}`;
  return `${pounds(input.seatPence)} a month for each extra user, ${branch}, plus VAT`;
}

export function orderPriceListText(extras: string, priceListDate: string): string {
  return `${extras} (prices from ${priceListDate})`;
}

/**
 * WHERE ACCEPT GOES NEXT (Phil, 2026-09-30, by popup: "the very next screen should be the payment
 * screen"). A company that has to pay and is not paying yet goes to the payment step; a Black
 * account, or one whose subscription is already live, goes to its dashboard.
 */
export function afterAcceptPath(input: { tier: string | null | undefined; liveSubscription: boolean }): string {
  if (input.tier === "black" || input.liveSubscription) return "/dashboard";
  return "/agreement/payment";
}

/** A Stripe subscription status that means the company is already paying (or about to be). */
export function isLiveSubscription(status: string | null | undefined, subscriptionId: string | null | undefined): boolean {
  return !!subscriptionId && ["active", "trialing", "past_due"].includes(status ?? "");
}

/**
 * EXTRAS AND WHAT IT COSTS (Phil, 2026-09-30, testing on his phone, agreed by popup). The Order asks
 * how many extra users and extra branches on top of the plan, says in plain words what each adds,
 * and ends with a breakdown like an invoice, so the Admin knows exactly what they will pay.
 *
 * Annual: the Admin chooses how the extras are paid. Yearly with the plan gets the same ten
 * months' price for twelve as the plan; monthly by card pays the full monthly price every month
 * ("so it's not such a shock"). Prices are shown plus VAT. The onboarding fee is one-off, outside
 * the totals. Billing still follows the users and branches actually set up; this is the Order.
 */
export type ExtrasBilling = "monthly" | "yearly" | "none";

export type CostLine = { label: string; amount: string };
export type CostGroup = { heading: string; lines: CostLine[]; total: CostLine };
export type OrderCosts = {
  groups: CostGroup[];
  oneOff: CostLine | null;
  /** One line for the Order table and the record, e.g. "£154 a month plus VAT". */
  totalText: string;
  extrasBilling: ExtrasBilling;
};

/** Money as it reads on an invoice: always pence, "£1,290.00". */
export function money(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function orderCosts(i: {
  tier: string | null | undefined;
  plan: string;
  billingOption: string;
  /** Only read on Annual: "yearly" or "monthly". */
  extrasBilling: string;
  monthlyPence: number | null;
  annualMonths: number;
  extraUsers: number;
  extraBranches: number;
  seatPence: number;
  branchPence: number;
  onboardingFee: string;
  /** A deal's two-step extra branch price (0354); null or absent for one price. */
  branchStep?: OrderBranchStep;
  /** The company's word for a branch (0354). */
  word?: OrderBranchWord;
}): OrderCosts {
  if (i.tier === "black" || i.monthlyPence === null) {
    return { groups: [], oneOff: null, totalText: "No charge (Black account)", extrasBilling: "none" };
  }
  const users = Math.max(0, Math.trunc(i.extraUsers) || 0);
  const branches = Math.max(0, Math.trunc(i.extraBranches) || 0);
  const hasExtras = users + branches > 0;
  const oneOff: CostLine = { label: "Onboarding fee, one-off", amount: i.onboardingFee };

  const extraLines = (months: number | null): { lines: CostLine[]; pence: number } => {
    const lines: CostLine[] = [];
    let pence = 0;
    const per = months === null ? "" : ` x ${months} months`;
    if (users > 0) {
      const p = users * i.seatPence * (months ?? 1);
      lines.push({ label: `${plural(users, "extra user", "extra users")} x ${money(i.seatPence)}${per}`, amount: money(p) });
      pence += p;
    }
    if (branches > 0) {
      const w = i.word ?? BRANCH;
      const one = `extra ${low(w.one)}`;
      const many = `extra ${low(w.many)}`;
      const step = i.branchStep ?? null;
      const first = step ? Math.min(branches, step.after) : branches;
      const rest = branches - first;
      const p1 = first * i.branchPence * (months ?? 1);
      lines.push({ label: `${plural(first, one, many)} x ${money(i.branchPence)}${per}`, amount: money(p1) });
      pence += p1;
      if (step && rest > 0) {
        const p2 = rest * step.pricePence * (months ?? 1);
        lines.push({ label: `${plural(rest, one, many)} x ${money(step.pricePence)}${per}`, amount: money(p2) });
        pence += p2;
      }
    }
    return { lines, pence };
  };

  if (i.billingOption !== "annual") {
    const ex = extraLines(null);
    const total = i.monthlyPence + ex.pence;
    return {
      groups: [
        {
          heading: "Your monthly cost",
          lines: [{ label: `${i.plan} plan`, amount: money(i.monthlyPence) }, ...ex.lines],
          total: { label: "Total each month, plus VAT", amount: money(total) },
        },
      ],
      oneOff,
      totalText: `${money(total)} a month plus VAT`,
      extrasBilling: hasExtras ? "monthly" : "none",
    };
  }

  const planYear = i.monthlyPence * i.annualMonths;
  const planLine: CostLine = { label: `${i.plan} plan, a year`, amount: money(planYear) };
  if (!hasExtras || i.extrasBilling !== "monthly") {
    const ex = extraLines(hasExtras ? i.annualMonths : null);
    const total = planYear + ex.pence;
    return {
      groups: [{ heading: "Your yearly cost", lines: [planLine, ...ex.lines], total: { label: "Total each year, plus VAT", amount: money(total) } }],
      oneOff,
      totalText: `${money(total)} a year plus VAT`,
      extrasBilling: hasExtras ? "yearly" : "none",
    };
  }
  const ex = extraLines(null);
  return {
    groups: [
      { heading: "Your yearly cost", lines: [planLine], total: { label: "Total each year, plus VAT", amount: money(planYear) } },
      { heading: "Your monthly cost, by card", lines: ex.lines, total: { label: "Total each month, plus VAT", amount: money(ex.pence) } },
    ],
    oneOff,
    totalText: `${money(planYear)} a year and ${money(ex.pence)} a month, plus VAT`,
    extrasBilling: "monthly",
  };
}

/** "None" or "2, at £5.00 a month each", for the Order table and the record. */
export function extrasLineText(count: number, unitPence: number, tier: string | null | undefined): string {
  if (tier === "black") return "Not applicable (Black account)";
  const n = Math.max(0, Math.trunc(count) || 0);
  return n === 0 ? "None" : `${n}, at ${money(unitPence)} a month each`;
}

/** The Order's extra branches line, honouring a two-step price and the company's word (0354). */
export function branchesLineText(
  count: number,
  branchPence: number,
  tier: string | null | undefined,
  step: OrderBranchStep = null,
): string {
  if (tier === "black") return "Not applicable (Black account)";
  const n = Math.max(0, Math.trunc(count) || 0);
  if (n === 0) return "None";
  if (step && n > step.after) {
    return `${n}: the first ${step.after} at ${money(branchPence)} a month each and ${n - step.after} at ${money(step.pricePence)} a month each`;
  }
  return `${n}, at ${money(branchPence)} a month each`;
}

export function extrasPaidText(c: OrderCosts, billingOption: string, tier: string | null | undefined): string {
  if (tier === "black") return "Not applicable (Black account)";
  if (c.extrasBilling === "none") return "No extras";
  if (billingOption !== "annual") return "Monthly, with the plan";
  return c.extrasBilling === "yearly" ? "Yearly with the plan, ten months' price for twelve" : "Monthly, by card";
}
