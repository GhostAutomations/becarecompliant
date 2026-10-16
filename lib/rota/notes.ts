/**
 * Be Care Compliant: care notes and concerns, the pure half (Rota and Visits Stage 5, Phil's
 * popups 2026-10-16; docs/decisions/rota-visits.md, Stage 5 decisions). Importless apart from
 * another pure module, so node --test runs it.
 *
 * A note is written at a visit and never edited: a correction is a new note pointing at the one it
 * corrects. A note ticked "For the next carer" is highlighted on the next visits to that service
 * user for 3 days. A carer's phone shows the notes for the service user from the last 48 hours
 * (the server decides which; this only arranges them). Notes and concerns wait on the phone and
 * are sent once, like clock taps and task outcomes.
 */

import { INCIDENT_CATEGORIES } from "../incidents/types.ts";

export const NOTE_MAX = 4000;

/** "Same options as the incidents" (Phil): the incident types, in the incident order. */
export const CONCERN_TYPES: readonly string[] = INCIDENT_CATEGORIES;

/** A note as the server sends it to the carer's phone (rota_my_visit_notes). */
export type NoteRow = {
  id: string;
  event_id: string;
  visit_id: string;
  author: string;
  mine: boolean;
  body: string;
  for_next_carer: boolean;
  corrects_note_id: string | null;
  corrected_at: string | null;
  at: string;
};
export type ConcernRow = { id: string; event_id: string; category: string; body: string; at: string; status: string };
export type VisitNotes = { visit_id: string; notes: NoteRow[]; concerns: ConcernRow[] };

/** A note or concern as it waits on the phone and is sent (rota_note_submit). */
export type NoteEvent = {
  event_id: string;
  owner: string;
  kind: "note" | "concern";
  visit_id: string;
  body: string;
  for_next_carer?: boolean;
  corrects_event_id?: string | null;
  category?: string | null;
  phone_time: string;
  device_id?: string | null;
  device_seq?: number | null;
  refused?: string | null;
};

export type ShownNote = {
  key: string;
  eventId: string;
  author: string;
  mine: boolean;
  body: string;
  at: string;
  forNextCarer: boolean;
  /** When this note is a correction: the time of the note it corrects. */
  correctsAt: string | null;
  /** When a later note corrects this one: that correction's time. */
  correctedAt: string | null;
  waiting: boolean;
};
export type ShownConcern = { key: string; category: string; body: string; at: string; status: string; waiting: boolean };

export type CardNotes = {
  /** "For the next carer" notes written at other visits: shown highlighted at the top. */
  handover: ShownNote[];
  /** Everything else from the last 48 hours written at other visits, newest first. */
  earlier: ShownNote[];
  /** This carer's own notes on this visit, oldest first, including any still waiting to send. */
  mine: ShownNote[];
  concerns: ShownConcern[];
};

/** Can this note be saved? */
export function noteProblem(body: string): string | null {
  const t = body.trim();
  if (!t) return "Write the note first.";
  if (t.length > NOTE_MAX) return "The note is too long (4,000 characters at most).";
  return null;
}

export function concernProblem(category: string | null | undefined, body: string): string | null {
  if (!category || !CONCERN_TYPES.includes(category)) return "Pick what kind of concern it is.";
  const t = body.trim();
  if (!t) return "Say what the concern is.";
  if (t.length > NOTE_MAX) return "That is too long (4,000 characters at most).";
  return null;
}

/**
 * Arranges what the phone shows on one visit card: the server's notes, and this sign in's notes
 * and concerns still waiting on the phone (refused ones and other people's are left out).
 */
export function notesForCard(server: VisitNotes | null, waiting: NoteEvent[], visitId: string, owner: string): CardNotes {
  const rows = server?.notes ?? [];
  const byId = new Map(rows.map((n) => [n.id, n]));
  const byEvent = new Map(rows.map((n) => [n.event_id, n]));
  const mineWaiting = waiting
    .filter((e) => e.owner === owner && !e.refused && e.visit_id === visitId)
    .sort((a, b) => Date.parse(a.phone_time) - Date.parse(b.phone_time) || (a.device_seq ?? 0) - (b.device_seq ?? 0));
  const waitingNotes = mineWaiting.filter((e) => e.kind === "note");
  // A correction still on the phone already marks the note it corrects.
  const waitingCorrectionOf = new Map<string, string>();
  for (const e of waitingNotes) if (e.corrects_event_id) waitingCorrectionOf.set(e.corrects_event_id, e.phone_time);

  const shown = (n: NoteRow): ShownNote => ({
    key: n.id,
    eventId: n.event_id,
    author: n.author,
    mine: n.mine,
    body: n.body,
    at: n.at,
    forNextCarer: n.for_next_carer,
    correctsAt: n.corrects_note_id ? byId.get(n.corrects_note_id)?.at ?? null : null,
    correctedAt: n.corrected_at ?? waitingCorrectionOf.get(n.event_id) ?? null,
    waiting: false,
  });

  const mine: ShownNote[] = rows.filter((n) => n.mine && n.visit_id === visitId).map(shown);
  for (const e of waitingNotes) {
    if (byEvent.has(e.event_id)) continue; // already arrived
    const corrected = e.corrects_event_id ? byEvent.get(e.corrects_event_id) ?? null : null;
    const correctedWaiting = e.corrects_event_id ? waitingNotes.find((w) => w.event_id === e.corrects_event_id) ?? null : null;
    mine.push({
      key: e.event_id,
      eventId: e.event_id,
      author: "You",
      mine: true,
      body: e.body,
      at: e.phone_time,
      forNextCarer: Boolean(e.for_next_carer),
      correctsAt: corrected?.at ?? correctedWaiting?.phone_time ?? null,
      correctedAt: waitingCorrectionOf.get(e.event_id) ?? null,
      waiting: true,
    });
  }
  mine.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const elsewhere = rows.filter((n) => !(n.mine && n.visit_id === visitId)).map(shown);
  const handover = elsewhere.filter((n) => n.forNextCarer).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const earlier = elsewhere.filter((n) => !n.forNextCarer).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const concerns: ShownConcern[] = (server?.concerns ?? []).map((c) => ({
    key: c.id, category: c.category, body: c.body, at: c.at, status: c.status, waiting: false,
  }));
  const arrived = new Set((server?.concerns ?? []).map((c) => c.event_id));
  for (const e of mineWaiting) {
    if (e.kind !== "concern" || arrived.has(e.event_id)) continue;
    concerns.push({ key: e.event_id, category: e.category ?? "", body: e.body, at: e.phone_time, status: "open", waiting: true });
  }
  concerns.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return { handover, earlier, mine, concerns };
}

/** Clock out asks for a note when this carer has written none on the visit (Phil, 2026-10-16). */
export function needsNotePrompt(card: CardNotes): boolean {
  return card.mine.length === 0;
}

export const CONCERN_STATUS_WORDS: Record<string, string> = {
  open: "Waiting for the office",
  incident: "Incident form started",
  no_incident: "No incident form needed",
};

/** Settings, Notifications (decision 12): the concern row's id on the grid, and who can be told. */
export const CONCERN_GRID_ID = "rota_concern";
export const CONCERN_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor"] as const;
