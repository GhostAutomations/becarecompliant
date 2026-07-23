/**
 * Be Care Compliant — On Call department types (Phase 10 Additions).
 *
 * On Call is a top-level log/register department (like Complaints): a rota of who
 * is on call (on_call_shifts) and a log of each out-of-hours call (on_call_logs).
 * NOT the recurring Check/RAG engine. Datetimes are stored and displayed as
 * wall-clock (round-trip stable) to avoid rota drift across DST.
 */

export type OnCallShift = {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_name: string | null;
  on_call_profile_id: string | null;
  on_call_person_name: string | null; // resolved from profile, else on_call_name
  on_call_name: string | null;
  phone: string | null;
  starts_at: string;
  ends_at: string;
  shift_date: string | null;
  slot: "am" | "pm" | null;
  notes: string | null;
};

export type RotaScope = "branch" | "company";
export type RotaSlot = "am" | "pm";

/** One filled cell of the rota grid. */
export type RotaCell = {
  id: string;
  name: string | null;
  phone: string | null;
  profileId: string | null;
};

export type RotaWeek = { label: string; days: string[] };

export type OnCallLog = {
  id: string;
  company_id: string;
  branch_id: string;
  branch_name: string | null;
  ref_number: number;
  shift_id: string | null;
  occurred_at: string;
  handler_profile_id: string | null;
  handler_person_name: string | null;
  handler_name: string | null;
  caller_name: string | null;
  caller_relationship: string | null;
  service_user_id: string | null;
  service_user_name: string | null;
  category: string | null;
  details: string;
  action_taken: string | null;
  outcome: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  follow_up_done: boolean;
};

export type BranchOption = { id: string; name: string };
export type PersonOption = { id: string; name: string };

/** Who was calling. */
export const CALLER_RELATIONSHIPS: Array<{ value: string; label: string }> = [
  { value: "service_user", label: "Service user" },
  { value: "relative", label: "Relative or representative" },
  { value: "staff", label: "Member of staff" },
  { value: "professional", label: "Health or social care professional" },
  { value: "public", label: "Member of the public" },
  { value: "other", label: "Other" },
];

/** Common out-of-hours call categories (free text is also allowed). */
export const CALL_CATEGORIES: string[] = [
  "Staff sickness or absence",
  "Missed or late visit",
  "Care emergency",
  "Medication issue",
  "Safeguarding concern",
  "Equipment or environment",
  "Family or visitor query",
  "Other",
];

export function relationshipLabel(value: string | null): string {
  if (!value) return "Not stated";
  return CALLER_RELATIONSHIPS.find((r) => r.value === value)?.label ?? value;
}
