/**
 * Tickets (Phil, 2026-10-08): the fixed choices and wording, pure so node --test can load it.
 */

export type TicketKind = "problem" | "feature";
export type TicketRag = "red" | "amber" | "green";
export type TicketStatus = "open" | "in_progress" | "resolved";

export const TICKET_KINDS: ReadonlyArray<{ value: TicketKind; label: string }> = [
  { value: "problem", label: "Report a problem" },
  { value: "feature", label: "Request a new feature" },
];

export const TICKET_RAGS: ReadonlyArray<{ value: TicketRag; label: string; meaning: string; pill: string }> = [
  { value: "red", label: "Red", meaning: "Needs an urgent response.", pill: "pill-red" },
  { value: "amber", label: "Amber", meaning: "Can wait over 24 hours.", pill: "pill-amber" },
  { value: "green", label: "Green", meaning: "Can take up to five days.", pill: "pill-green" },
];

export const TICKET_STATUSES: ReadonlyArray<{ value: TicketStatus; label: string; pill: string }> = [
  { value: "open", label: "Open", pill: "pill-amber" },
  { value: "in_progress", label: "In progress", pill: "pill-neutral" },
  { value: "resolved", label: "Resolved", pill: "pill-green" },
];

export const FEATURE_ACK =
  "I understand that adding this feature may be chargeable. If so, we will come back to you with a quote.";

export const MAX_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** The roles that raise tickets (Supervisor and up, Recruiter and On Call). Mirrors raise_support_ticket. */
export const TICKET_RAISER_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
  "on_call",
];

/** The roles that see every ticket from their company. Mirrors can_see_support_ticket. */
export const TICKET_SEE_ALL_ROLES: readonly string[] = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

export function ticketRef(n: number | string): string {
  return `Ticket ${n}`;
}

export function ragOf(v: string | null | undefined) {
  return TICKET_RAGS.find((r) => r.value === v) ?? TICKET_RAGS[2];
}

export function statusOf(v: string | null | undefined) {
  return TICKET_STATUSES.find((s) => s.value === v) ?? TICKET_STATUSES[0];
}

export function kindLabel(v: string | null | undefined): string {
  return TICKET_KINDS.find((k) => k.value === v)?.label ?? "Ticket";
}

/** Where a problem is, as one line: "People, Absence". */
export function whereLabel(department: string | null | undefined, area: string | null | undefined): string {
  return [department, area].filter((x) => x && String(x).trim()).join(", ");
}

/** The founder's text when a ticket is raised. No dashes (customer copy rule applies to texts). */
export function ticketSmsText(t: {
  number: number | string;
  company: string;
  raisedBy: string;
  kind: string;
  rag: string;
  subject: string;
  department?: string | null;
  area?: string | null;
  url: string;
}): string {
  const rag = ragOf(t.rag);
  const where = whereLabel(t.department, t.area);
  return [
    `New ticket raised by ${t.company} (${t.raisedBy}).`,
    `Rating: ${rag.label}. ${rag.meaning}`,
    `${kindLabel(t.kind)}${where ? ` in ${where}` : ""}: ${t.subject.slice(0, 120)}`,
    t.url,
  ].join("\n");
}

/** Problems the form refuses before it is sent. null when it is fine. */
export function ticketProblem(input: {
  kind: string;
  department?: string | null;
  subject: string;
  description: string;
  rag: string;
  ack?: boolean;
}): string | null {
  if (input.kind !== "problem" && input.kind !== "feature") return "Choose what the ticket is for.";
  if (input.kind === "problem" && !(input.department ?? "").trim()) return "Choose where the problem is.";
  if (!input.subject.trim()) return input.kind === "feature" ? "Say what the feature should be called." : "Give the ticket a subject.";
  if (input.subject.trim().length > 200) return "Keep the subject under 200 characters.";
  if (!input.description.trim()) return "Describe it, with as much information as possible.";
  if (input.description.length > 10000) return "The description is too long. Keep it under 10,000 characters.";
  if (!TICKET_RAGS.some((r) => r.value === input.rag)) return "Choose a rating: red, amber or green.";
  if (input.kind === "feature" && !input.ack) return "Tick to say you understand a new feature may be chargeable.";
  return null;
}

/** "08/10/2026, 14:23" in UK time. */
export function ticketWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
