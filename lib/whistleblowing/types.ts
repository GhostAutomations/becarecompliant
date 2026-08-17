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
 *
 * PROVISIONAL FOR THE THISTLE SOFT LAUNCH (Phil, 2026-08-17). Left whole for now rather than cut,
 * so that a real provider using it is what decides what comes out.
 */
export const DISCLOSURE_CATEGORIES = [
  /*
   * The letter is the head of section 43B(1) each one falls under, so the list can be checked
   * against the Act rather than taken on trust:
   *   (a) a criminal offence      (b) failure to comply with a legal obligation
   *   (c) a miscarriage of justice (d) health or safety endangered
   *   (da) sexual harassment      (e) damage to the environment
   *   (f) deliberate concealment of any of the above
   */
  "Abuse or neglect of a service user",       // (d)
  "Unsafe care or poor practice",             // (d)
  "Staffing levels or missed calls",          // (d)(b)
  "Medication practice",                      // (d)(b)
  "Falsification of records",                 // (a)(b)(f)
  "Financial impropriety or theft",           // (a)
  // (da) is its OWN head now, added to the Act. It used to be folded into the line below, which
  // is no longer where the law puts it.
  "Sexual harassment",                        // (da)
  "Bullying, harassment or discrimination",   // (b)
  "Breach of confidentiality",                // (b)
  "Health and safety",                        // (d)
  "Recruitment or right to work",             // (a)(b)
  "Concealment of any of the above",          // (f)
  "Other",
  /*
   * (c) miscarriage of justice and (e) damage to the environment have no entry. That is a
   * decision, not an oversight: in domiciliary care both are close to unreachable, and anybody
   * who does have one has "Other" and a free text box. Revisit if Thistle ever files one there.
   */
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
