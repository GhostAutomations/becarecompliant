/** Be Care Compliant — assignments and policies (isomorphic types). */

export type AssignmentKind = "form" | "policy";
export type AssignmentStatus = "assigned" | "completed" | "cancelled";

export type CompanyPolicy = {
  id: string;
  title: string;
  summary: string | null;
  file_name: string;
  version: number;
  status: "active" | "archived";
  created_at: string;
};

/** Every version of a policy is kept, so the exact wording signed can be produced. */
export type PolicyVersion = {
  id: string;
  policy_id: string;
  version: number;
  file_name: string;
  created_at: string;
};

/** The company's own signing rules (migration 0135). */
export type PolicyConfig = {
  signature_mode: "draw" | "type" | "either";
  reassign_on_new_version: "always" | "ask" | "never";
};

export type AssignmentRow = {
  id: string;
  /** For a policy, the version this assignment is for. */
  policy_version: number | null;
  kind: AssignmentKind;
  status: AssignmentStatus;
  due_date: string | null;
  assigned_at: string;
  completed_at: string | null;
  evidence_id: string | null;
  person_id: string;
  person_name: string | null;
  /** The form or the policy, whichever this is. */
  title: string;
  form_id: string | null;
  policy_id: string | null;
};

/**
 * Somebody a briefing can be sent to. Carries the branch so the panel can offer
 * "everyone in a branch", which Phil needs because a local authority can require
 * different documents per branch (2026-07-26).
 */
export type BriefingPerson = {
  id: string;
  full_name: string;
  branch_id: string | null;
  branch_name: string | null;
};

/** How a Manager chose the audience. Resolved on the server, never trusted from the browser. */
export type BriefingScope = "company" | "branch" | "people";

/** The form key whose completion records a policy acknowledgement. */
export const POLICY_ACK_FORM_KEY = "policy_acknowledgement";
