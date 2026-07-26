/** Be Care Compliant — public form shared types (isomorphic, no side effects). */

import type { FieldError } from "@/lib/form-validate";

/** Result of a public submission. Field errors render under the right questions. */
export type PublicSubmitState = {
  ok?: string;
  error?: string;
  errors?: FieldError[];
};

export type PublicSubmissionStatus = "matched" | "unmatched" | "linked" | "discarded";

export type PublicFormLink = {
  id: string;
  form_key: string;
  enabled: boolean;
  created_at: string;
};

export type PublicSubmission = {
  id: string;
  form_key: string;
  submitted_name: string | null;
  submitted_email: string;
  status: PublicSubmissionStatus;
  person_id: string | null;
  person_name: string | null;
  branch_name: string | null;
  evidence_id: string | null;
  holiday_request_id: string | null;
  start_date: string | null;
  end_date: string | null;
  handled_at: string | null;
  created_at: string;
};
