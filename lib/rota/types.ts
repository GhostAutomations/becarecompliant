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

/** One clock in or out as the office sees it (Stage 3). */
export type ClockRecord = {
  id: string;
  personId: string;
  kind: "in" | "out";
  at: string; // ISO, the corrected time it happened
  method: string;
  location: string;
  words: string; // "At the home", "640 m away: Poor signal", "Added by the office"...
  flags: string[];
  addedReason: string | null;
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
  /** Clock ins and outs on this shift (Stage 3). */
  clocks?: ClockRecord[];
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

/* ------------------------------- Visits (Stage 2) ------------------------------- */

export type RotaVisit = {
  id: string;
  branchId: string;
  serviceUserId: string;
  serviceUserName: string;
  postcode: string | null;
  visitDate: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  service: string | null;
  carersNeeded: number;
  status: "draft" | "published" | "cancelled";
  /** In hospital or respite on that date: shown greyed, not sent. */
  paused: boolean;
  scheduleChanged: boolean;
  assignments: RotaAssignment[];
  /** Clock ins and outs on this visit (Stage 3). */
  clocks?: ClockRecord[];
  /** The call's current tasks and each carer's latest outcome per task (Stage 4). */
  tasks?: { list: { uid: string; name: string; category: string; key: boolean }[]; byPerson: Record<string, Record<string, { outcome: "done" | "refused" | "not_needed"; reason_code: string | null; reason_text: string | null; at: string }>> } | null;
  /** Care notes and concerns written at this visit (Stage 5). */
  notes?: VisitNoteLine[];
  concerns?: VisitConcernLine[];
};

/** A care note as the office reads it (Stage 5): never edited; a correction points at the note it corrects. */
export type VisitNoteLine = {
  id: string;
  personId: string;
  author: string;
  body: string;
  at: string;
  forNextCarer: boolean;
  correctsNoteId: string | null;
  flags: string[];
};
export type VisitConcernLine = { id: string; personId: string; author: string; category: string; body: string; at: string; status: string };

export type VisitCandidate = RotaCandidate & {
  miles: number | null;
  preferred: boolean;
  continuity: number;
};

/** One call of a service user's Care Schedule, with its start time on the rota. */
export type CallRow = {
  dayOfWeek: number;
  service: string;
  slotKey: string;
  occurrence: number;
  minutes: number | null;
  carers: number;
  startTime: string | null;
  lengthMinutes: number | null;
};

export type CallServiceUser = {
  id: string;
  name: string;
  postcode: string | null;
  away: boolean;
  calls: CallRow[];
  preferred: { personId: string; name: string }[];
  notToSend: { personId: string; name: string }[];
};
