/**
 * Be Care Compliant: the rota's shapes, shared by the server and the screens (Stage 1). Importless.
 */

export type RotaWarning = { kind: string; text: string };

export type RotaAssignment = {
  id: string;
  personId: string;
  name: string;
  via: string;
  warnings: RotaWarning[];
};

export type RotaShift = {
  id: string;
  branchId: string;
  shiftDate: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  headcount: number;
  location: string | null;
  notes: string | null;
  status: "draft" | "published" | "cancelled";
  templateId: string | null;
  assignments: RotaAssignment[];
};

export type RotaTemplate = {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  headcount: number;
  location: string | null;
  active: boolean;
};

export type RotaRequest = {
  id: string;
  shiftId: string;
  personId: string;
  name: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  requestedAt: string;
};

/** One person in the office's picker for a shift. */
export type RotaCandidate = {
  personId: string;
  name: string;
  jobTitle: string | null;
  branchName: string;
  /** clear, risk_ok (no DBS, working under a Pending Risk Assessment), barred, red */
  dbs: string;
  /** Why they cannot go on it (the database's own words), or null when they can. */
  refusal: string | null;
  /** Training and working time warnings they would go on with. */
  warnings: RotaWarning[];
};

/** "08:00:00" or "08:00" to "08:00". */
export function hhmm(t: string | null | undefined): string {
  return (t ?? "").slice(0, 5);
}

/** A short day label for a civil date: "Mon 2 Nov". */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
