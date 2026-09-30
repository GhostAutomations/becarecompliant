/**
 * THE COMPANY'S OWN WORD FOR A BRANCH (migration 0354), e.g. House / Houses.
 *
 * Phil, 2026-09-30: a customer who calls their branches houses sees "house" everywhere,
 * in menus, registers, filters, reports, the Order, Billing and invoices. Pure: safe in
 * client components, server components and exports alike. Null or blank means Branch.
 */
import { branchWord, lower, type BranchWord } from "@/lib/billing/deal";

export { branchWord, lower, type BranchWord };

export const DEFAULT_BRANCH_WORD: BranchWord = { one: "Branch", many: "Branches" };

/** Every form a screen needs: "House", "Houses", "house", "houses", "All houses". */
export type BranchTerms = {
  one: string;
  many: string;
  oneLower: string;
  manyLower: string;
  all: string;
  /** "1 house", "3 houses". */
  count: (n: number) => string;
};

export function branchTerms(word: BranchWord | null | undefined): BranchTerms {
  const w = word ?? DEFAULT_BRANCH_WORD;
  const oneLower = lower(w.one);
  const manyLower = lower(w.many);
  return {
    one: w.one,
    many: w.many,
    oneLower,
    manyLower,
    all: `All ${manyLower}`,
    count: (n: number) => `${n} ${n === 1 ? oneLower : manyLower}`,
  };
}
