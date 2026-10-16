/**
 * Be Care Compliant: care plan tasks per call, the pure half (Rota and Visits Stage 4, Phil's
 * popups, 2026-10-16). Importless, so node --test runs it.
 *
 * The starter list and the reasons are exactly as Phil approved them (docs/decisions/rota-visits.md,
 * Stage 4 decisions 6 and 7). Medicines and prescribed creams are not here: they belong to the MAR
 * (Stage 6). A company adds its own custom tasks beside these (rota_task_library).
 */

export const STARTER_TASKS: { category: string; tasks: string[] }[] = [
  {
    category: "Personal care",
    tasks: [
      "Full wash",
      "Strip wash",
      "Shower",
      "Bath",
      "Help with dressing",
      "Help with undressing",
      "Oral care (teeth or dentures)",
      "Hair care",
      "Shaving",
      "Nail care (filing only)",
      "Continence care (pad change)",
      "Toileting support",
      "Catheter bag check and empty",
      "Stoma bag care",
      "Check skin for pressure areas",
      "Reposition to relieve pressure",
    ],
  },
  {
    category: "Food and drink",
    tasks: [
      "Prepare breakfast",
      "Prepare lunch",
      "Prepare evening meal",
      "Prepare a snack",
      "Prepare a hot drink",
      "Prepare a cold drink",
      "Prompt or help with eating",
      "Prompt fluids",
      "Record food and fluid intake",
      "Leave drinks within reach",
      "Check food is in date",
      "Wash up and tidy the kitchen",
    ],
  },
  {
    category: "Moving around",
    tasks: [
      "Help with transfers (bed, chair, toilet)",
      "Hoist transfer (two carers)",
      "Standing aid transfer",
      "Help with walking",
      "Help into bed",
      "Help out of bed",
      "Put on or take off compression stockings",
      "Walking aids within reach",
    ],
  },
  {
    category: "Health and wellbeing",
    tasks: [
      "Check wellbeing and mood",
      "Report any change in health",
      "Hearing aids or glasses on",
      "Pendant alarm worn",
      "Companionship and conversation",
      "Encourage exercises set by a physiotherapist",
    ],
  },
  {
    category: "Home and safety",
    tasks: [
      "Tidy up",
      "Make the bed",
      "Change bed linen",
      "Laundry",
      "Empty bins",
      "Light housework",
      "Shopping",
      "Collect prescription",
      "Check heating and lighting",
      "Close curtains and blinds",
      "Lock doors and windows on leaving",
      "Check the home is safe on leaving",
      "Key safe locked",
    ],
  },
  {
    category: "Out and about",
    tasks: ["Go with them to an appointment", "Support to go out in the community", "Help with phone calls or post"],
  },
  {
    category: "Evening and night",
    tasks: ["Settle for the night", "Night checks", "Sitting service"],
  },
];

/** Phil's reasons for a task that was refused or not needed (the database checks the same codes). */
export const TASK_REASONS = [
  { code: "declined", label: "Service user declined" },
  { code: "asleep", label: "Asleep and did not want to be woken" },
  { code: "unwell", label: "Unwell" },
  { code: "not_home", label: "Not at home" },
  { code: "in_hospital", label: "In hospital" },
  { code: "away", label: "Away (respite or with family)" },
  { code: "done_earlier", label: "Already done earlier" },
  { code: "done_by_family", label: "Done by family or a friend" },
  { code: "done_by_professional", label: "Done by another professional (district nurse, GP, another agency)" },
  { code: "not_needed_today", label: "Not needed today" },
  { code: "no_supplies", label: "No supplies or food in the house" },
  { code: "equipment", label: "Equipment missing or faulty" },
  { code: "unsafe", label: "Unsafe to do (risk to the service user or carer)" },
  { code: "no_time", label: "Not enough time on the visit" },
  { code: "other", label: "Other" },
] as const;
export type TaskReasonCode = (typeof TASK_REASONS)[number]["code"];

export function taskReasonLabel(code: string | null | undefined, text?: string | null): string | null {
  if (!code) return null;
  if (code === "other") return text?.trim() || "Other";
  return TASK_REASONS.find((r) => r.code === code)?.label ?? null;
}

export type TaskOutcomeKind = "done" | "refused" | "not_needed";
export const OUTCOME_WORDS: Record<TaskOutcomeKind, string> = { done: "Done", refused: "Refused", not_needed: "Not needed" };

export type TaskItem = { uid?: string; name: string; category: string; key: boolean };
export const MAX_TASKS = 40;

/** A list as the office edits it: names trimmed, blanks and repeats dropped, at most 40. */
export function cleanTaskList(items: TaskItem[]): TaskItem[] {
  const seen = new Set<string>();
  const out: TaskItem[] = [];
  for (const t of items) {
    const name = t.name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...(t.uid ? { uid: t.uid } : {}), name, category: (t.category || "Custom").slice(0, 40), key: Boolean(t.key) });
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}

export type RecordedOutcome = { outcome: TaskOutcomeKind; reason_code: string | null; reason_text: string | null; at: string };

/** Key tasks with no outcome yet: clock out asks for these first (Phil, 2026-10-16). */
export function keyTasksWithoutOutcome(tasks: TaskItem[], outcomes: Record<string, RecordedOutcome | undefined>): TaskItem[] {
  return tasks.filter((t) => t.key && t.uid && !outcomes[t.uid]);
}

/** Can this outcome be saved? A task not done needs a reason; Other needs it typed. */
export function outcomeProblem(outcome: TaskOutcomeKind, reason: string | null, text: string): string | null {
  if (outcome === "done") return null;
  if (!reason) return "Pick a reason.";
  if (reason === "other" && !text.trim()) return "Type the reason.";
  return null;
}

/** "4 of 6 done · 1 refused · 1 not needed" for the office; key tasks left unmarked are counted too. */
export function taskSummary(tasks: TaskItem[], outcomes: Record<string, RecordedOutcome | undefined>): { text: string; keyMissing: number } {
  const done = tasks.filter((t) => t.uid && outcomes[t.uid]?.outcome === "done").length;
  const refused = tasks.filter((t) => t.uid && outcomes[t.uid]?.outcome === "refused").length;
  const notNeeded = tasks.filter((t) => t.uid && outcomes[t.uid]?.outcome === "not_needed").length;
  const keyMissing = keyTasksWithoutOutcome(tasks, outcomes).length;
  const parts = [`${done} of ${tasks.length} done`];
  if (refused) parts.push(`${refused} refused`);
  if (notNeeded) parts.push(`${notNeeded} not needed`);
  if (keyMissing) parts.push(`${keyMissing} key task${keyMissing === 1 ? "" : "s"} not marked`);
  return { text: parts.join(" · "), keyMissing };
}

/** One task outcome as it waits on the phone and is sent (offline design, as clock events). */
export type TaskEvent = {
  event_id: string;
  owner: string;
  visit_id: string;
  list_id: string;
  task_uid: string;
  outcome: TaskOutcomeKind;
  reason_code: TaskReasonCode | null;
  reason_text: string | null;
  phone_time: string;
  device_id?: string | null;
  device_seq?: number | null;
  refused?: string | null;
};

/**
 * The outcome to show for each task of a visit: the server's latest, unless this sign in has a
 * newer one still waiting on the phone. Refused taps and other people's taps are left out.
 */
export function mergeOutcomes(
  server: Record<string, RecordedOutcome | undefined>,
  waiting: TaskEvent[],
  visitId: string,
  owner: string,
): Record<string, RecordedOutcome & { waiting?: boolean }> {
  const out: Record<string, RecordedOutcome & { waiting?: boolean }> = {};
  for (const [uid, o] of Object.entries(server)) if (o) out[uid] = o;
  const mine = waiting
    .filter((e) => e.visit_id === visitId && e.owner === owner && !e.refused)
    .sort((a, b) => a.phone_time.localeCompare(b.phone_time) || (a.device_seq ?? 0) - (b.device_seq ?? 0));
  for (const e of mine) {
    const cur = out[e.task_uid];
    // Compared as times: the server writes +00:00, the phone writes Z.
    if (!cur || Date.parse(cur.at) <= Date.parse(e.phone_time)) {
      out[e.task_uid] = { outcome: e.outcome, reason_code: e.reason_code, reason_text: e.reason_text, at: e.phone_time, waiting: true };
    }
  }
  return out;
}
