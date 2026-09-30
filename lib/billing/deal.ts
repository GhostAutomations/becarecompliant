/**
 * THE DEAL (Phil, 2026-09-30, by popup): what a founder agrees with a company before it signs.
 *
 * PURE, NO RUNTIME IMPORTS, so the agreement screen, the server that records the acceptance, the
 * Stripe side and the billing screens all price a deal the same way, and it can be unit tested.
 *
 * A deal fixes the Order (extra users, extra branches, Monthly or Annual, how Annual extras are
 * paid) and may carry special prices: the plan, the extra user, and the extra branch, flat or
 * two-step (the first N extra branches at one price, the rest at another). A null price means the
 * list price. Annual stays ten months' price for twelve on whatever price is set.
 */

export type DealRow = {
  billing_option: string | null;
  extras_billing: string | null;
  extra_users: number | null;
  extra_branches: number | null;
  plan_price_pence: number | null;
  seat_price_pence: number | null;
  branch_price_pence: number | null;
  branch_step_after: number | null;
  branch_step_price_pence: number | null;
  onboarding_fee_pence: number | null;
};

export type BranchStep = { after: number; pricePence: number };

export type DealPrices = {
  /** Plan price per month, before Annual's ten for twelve. */
  planPence: number;
  seatPence: number;
  /** The extra branch price; with a step, the price of the first `step.after` extra branches. */
  branchPence: number;
  step: BranchStep | null;
  /** True when anything differs from the list price, so screens can say "agreed price". */
  special: boolean;
};

export type ListPrices = { planPence: number; seatPence: number; branchPence: number };

function whole(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** The prices a company pays: its deal's where set, the list price otherwise. */
export function dealPrices(deal: DealRow | null | undefined, list: ListPrices): DealPrices {
  const plan = whole(deal?.plan_price_pence);
  const seat = whole(deal?.seat_price_pence);
  const branch = whole(deal?.branch_price_pence);
  const after = whole(deal?.branch_step_after);
  const stepPrice = whole(deal?.branch_step_price_pence);
  const step = after !== null && after >= 1 && stepPrice !== null ? { after, pricePence: stepPrice } : null;
  return {
    planPence: plan ?? list.planPence,
    seatPence: seat ?? list.seatPence,
    branchPence: branch ?? list.branchPence,
    step,
    special:
      (plan !== null && plan !== list.planPence) ||
      (seat !== null && seat !== list.seatPence) ||
      (branch !== null && branch !== list.branchPence) ||
      step !== null,
  };
}

/** How many extra branches fall in each band: [at the first price, at the step price]. */
export function branchBands(extraBranches: number, step: BranchStep | null): [number, number] {
  const n = Math.max(0, Math.trunc(extraBranches) || 0);
  if (!step) return [n, 0];
  const first = Math.min(n, step.after);
  return [first, n - first];
}

/** Monthly pence for the extra branches, honouring a two-step price. */
export function branchExtrasPence(extraBranches: number, prices: Pick<DealPrices, "branchPence" | "step">): number {
  const [first, rest] = branchBands(extraBranches, prices.step);
  return first * prices.branchPence + rest * (prices.step?.pricePence ?? prices.branchPence);
}

/** The company's own word for a branch, e.g. House / Houses. Null or blank means Branch. */
export type BranchWord = { one: string; many: string };

/**
 * The plural of a branch word by the usual English rules (Phil, 2026-09-30: a smarter guess, shown
 * so it can be changed): Branch to Branches, Property to Properties, House to Houses, Day to Days.
 */
export function pluralOf(word: string): string {
  const w = word.trim();
  if (!w) return w;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}${/[A-Z]$/.test(w) ? "ES" : "es"}`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}${/[A-Z]$/.test(w) ? "IES" : "ies"}`;
  return `${w}${/[A-Z]$/.test(w) && w.length > 1 && w === w.toUpperCase() ? "S" : "s"}`;
}

export function branchWord(row: { branch_word?: string | null; branch_word_plural?: string | null } | null | undefined): BranchWord {
  const one = (row?.branch_word ?? "").trim();
  const many = (row?.branch_word_plural ?? "").trim();
  if (!one) return { one: "Branch", many: "Branches" };
  return { one, many: many || pluralOf(one) };
}

/** Lower case, for use in a sentence: "extra house", "houses". */
export function lower(word: string): string {
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/**
 * Validate a founder's deal form. Returns the row to save or an error in plain English.
 * Money is typed in pounds ("15" or "15.50") and stored in pence; blank means list price.
 */
export function parseDealForm(f: {
  billingOption: string;
  extrasBilling: string;
  extraUsers: string;
  extraBranches: string;
  planPrice: string;
  seatPrice: string;
  branchPrice: string;
  stepAfter: string;
  stepPrice: string;
  onboarding: string;
  onboardingAmount: string;
}): { ok: true; row: DealRow } | { ok: false; error: string } {
  const pounds = (s: string, label: string): number | null | string => {
    const t = s.trim().replace(/^£/, "");
    if (t === "") return null;
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return `Enter ${label} in pounds, for example 15 or 15.50.`;
    return Math.round(Number(t) * 100);
  };
  const count = (s: string, max: number, label: string): number | string => {
    const t = s.trim();
    if (t === "") return 0;
    if (!/^\d{1,3}$/.test(t) || Number(t) > max) return `Enter ${label} as a whole number from 0 to ${max}.`;
    return Number(t);
  };

  const billing = f.billingOption === "monthly" || f.billingOption === "annual" ? f.billingOption : null;
  let extras: string | null = f.extrasBilling === "monthly" || f.extrasBilling === "yearly" ? f.extrasBilling : null;
  if (billing !== "annual") extras = billing === "monthly" ? "monthly" : null;

  const users = count(f.extraUsers, 500, "extra users");
  if (typeof users === "string") return { ok: false, error: users };
  const branches = count(f.extraBranches, 50, "extra branches");
  if (typeof branches === "string") return { ok: false, error: branches };

  const plan = pounds(f.planPrice, "the plan price");
  if (typeof plan === "string") return { ok: false, error: plan };
  const seat = pounds(f.seatPrice, "the extra user price");
  if (typeof seat === "string") return { ok: false, error: seat };
  const branch = pounds(f.branchPrice, "the extra branch price");
  if (typeof branch === "string") return { ok: false, error: branch };
  const stepPrice = pounds(f.stepPrice, "the price after the first branches");
  if (typeof stepPrice === "string") return { ok: false, error: stepPrice };

  let stepAfter: number | null = null;
  if (f.stepAfter.trim() !== "" || stepPrice !== null) {
    const a = count(f.stepAfter, 49, "how many branches are at the first price");
    if (typeof a === "string") return { ok: false, error: a };
    if (a < 1) return { ok: false, error: "Say how many extra branches are at the first price (1 or more)." };
    if (stepPrice === null) return { ok: false, error: "Enter the price for the extra branches after the first ones." };
    if (branch === null) return { ok: false, error: "Enter the first extra branch price as well, so the two steps are clear." };
    stepAfter = a;
  }

  let onboarding: number | null = null;
  if (f.onboarding === "waived") onboarding = 0;
  else if (f.onboarding === "standard") onboarding = null;
  else if (f.onboarding === "custom") {
    const o = pounds(f.onboardingAmount, "the onboarding fee");
    if (typeof o === "string") return { ok: false, error: o };
    if (o === null) return { ok: false, error: "Enter the onboarding fee, or choose waived or standard." };
    onboarding = o;
  }

  return {
    ok: true,
    row: {
      billing_option: billing,
      extras_billing: extras,
      extra_users: users,
      extra_branches: branches,
      plan_price_pence: plan,
      seat_price_pence: seat,
      branch_price_pence: branch,
      branch_step_after: stepAfter,
      branch_step_price_pence: stepAfter === null ? null : stepPrice,
      onboarding_fee_pence: onboarding,
    },
  };
}

/**
 * A company's monthly charges at its deal's prices (0354), split the way the totals need them.
 * branchesPence already honours a two-step price, so callers add it as one amount.
 */
export function dealMonthlyParts(
  deal: DealRow | null | undefined,
  list: ListPrices,
  extraSeats: number,
  extraBranches: number,
): { basePence: number; seatsPence: number; branchesPence: number; prices: DealPrices } {
  const prices = dealPrices(deal, list);
  return {
    basePence: prices.planPence,
    seatsPence: Math.max(0, Math.trunc(extraSeats) || 0) * prices.seatPence,
    branchesPence: branchExtrasPence(extraBranches, prices),
    prices,
  };
}

/**
 * The intervals a deal will be billed on, for screens shown before the subscription exists (the
 * billing row has no interval until then). Null when there is no deal or it leaves billing open.
 */
export function dealIntervals(deal: Pick<DealRow, "billing_option" | "extras_billing"> | null | undefined): { plan: "year" | "month"; extras: "year" | "month" } | null {
  if (!deal || (deal.billing_option !== "annual" && deal.billing_option !== "monthly")) return null;
  if (deal.billing_option === "monthly") return { plan: "month", extras: "month" };
  return { plan: "year", extras: deal.extras_billing === "monthly" ? "month" : "year" };
}
