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

export type AssignmentRow = {
  id: string;
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

/** The form key whose completion records a policy acknowledgement. */
export const POLICY_ACK_FORM_KEY = "policy_acknowledgement";
