/**
 * Who Be Care Compliant is, for the contract (Phil, 2026-09-29, by popup: "One settings file,
 * gate stays off").
 *
 * WHILE ANY OF THESE IS NULL THE CONTRACT IS A DRAFT. The public pages say so, and no Company
 * Admin is asked to accept (except a company the founder has switched on to test it, see
 * companies.agreement_required, 0346). Fill every value in, set PUBLICATION_DATE, push, and every
 * Company Admin is asked to accept on their next page.
 *
 * LIABILITY_FLOOR is clause 14.4's minimum cap ("the greater of £X and the fees paid in the
 * twelve months before"). Phil chose to set it with the supplier details, after checking it
 * against his professional indemnity and cyber insurance.
 *
 * Pure and importless so node --test can read it.
 */

export type Supplier = {
  /** Registered company name, e.g. "Be Care Compliant Ltd". */
  name: string | null;
  /** Companies House number. */
  number: string | null;
  /** Registered office, on one line. */
  address: string | null;
  /** ICO data protection registration number. */
  ico: string | null;
  /** Clause 14.4 minimum, as written in the contract, e.g. "£10,000". */
  liabilityFloor: string | null;
  /** The date the final text is published, as customers read it, e.g. "1 November 2026". */
  publicationDate: string | null;
};

export const SUPPLIER: Supplier = {
  name: null,
  number: null,
  address: null,
  ico: null,
  liabilityFloor: null,
  publicationDate: null,
};
