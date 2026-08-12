/**
 * Be Care Compliant — Whistleblowing disclosures shared types (THE LIST item 21,
 * increment 2). Isomorphic: no side effects, safe in a client component.
 *
 * SEPARATE FROM INCIDENTS ON PURPOSE. An incident is written up by the branch and read
 * by the branch. A disclosure is commonly ABOUT the branch, or about the person running
 * it, so it is visible to the Company Admin and the Responsible Individual only —
 * enforced in RLS (migrations 0174 and 0175), never by hiding a nav item.
 */

export type DisclosureStatus = "open" | "under_review" | "closed";

export const DISCLOSURE_STATUS_LABELS: Record<DisclosureStatus, string> = {
  open: "Open",
  under_review: "Under review",
  closed: "Closed",
};

export const DISCLOSURE_STATUSES: DisclosureStatus[] = ["open", "under_review", "closed"];

/**
 * The categories offered when logging a disclosure.
 *
 * These are written in the language a care provider uses, not the language of the Public
 * Interest Disclosure Act 1998. PIDA's six heads (criminal offence, breach of a legal
 * obligation, miscarriage of justice, danger to health and safety, environmental damage,
 * and concealment of any of those) are the legal test for whether a disclosure qualifies
 * for protection — they are a poor picking list for someone typing up a phone call at
 * half past six. Every entry below falls under at least one PIDA head.
 *
 * Stored as free text so the list can change later without orphaning old records.
 */
export const DISCLOSURE_CATEGORIES = [
  "Abuse or neglect of a service user",
  "Unsafe care or poor practice",
  "Staffing levels or missed calls",
  "Medication practice",
  "Falsification of records",
  "Financial impropriety or theft",
  "Bullying, harassment or discrimination",
  "Breach of confidentiality",
  "Health and safety",
  "Recruitment or right to work",
  "Concealment of any of the above",
  "Other",
] as const;

export type DisclosureRecord = {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_name?: string | null;

  received_on: string;
  anonymous: boolean;
  /** Null whenever anonymous is true. There is no hidden name to leak later. */
  discloser_name: string | null;

  category: string;
  disclosure: string;
  action_taken: string | null;
  outcome: string | null;

  status: DisclosureStatus;
  closed_on: string | null;

  created_at: string;
};
