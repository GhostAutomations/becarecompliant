/**
 * DEMO ACCOUNTS, the pure rules (0356, Phil 2026-09-30). No imports: unit tested with node.
 *
 * A fresh "Demo Care Company Limited" per client. Logins stop at the end date; the company and
 * everything in it is deleted 14 days later. The survey is offered on screen from two days before
 * the end, and emailed once the demo has ended if it was not answered.
 */

export const DEMO_COMPANY_NAME = "Demo Care Company Limited";
/** The demo only page that shows every AI button with a short how to (Phil, 2026-10-01). */
export const DEMO_TRY_AI_PATH = "/demo/try-ai";

export const DEFAULT_DEMO_DAYS = 7;
export const MAX_DEMO_DAYS = 365;
export const DEMO_GRACE_DAYS = 14;
export const DEMO_SURVEY_DAYS_BEFORE_END = 2;
export const DEMO_AI_PER_LOGIN = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DemoPhase = "active" | "survey" | "ended" | "purge_due";

/** Where a demo is: running, in its last two days (survey offered), ended, or due for deletion. */
export function demoPhase(endsAtISO: string, now: Date = new Date()): DemoPhase {
  const end = new Date(endsAtISO).getTime();
  const t = now.getTime();
  if (Number.isNaN(end)) return "ended";
  if (t >= end + DEMO_GRACE_DAYS * DAY_MS) return "purge_due";
  if (t >= end) return "ended";
  if (t >= end - DEMO_SURVEY_DAYS_BEFORE_END * DAY_MS) return "survey";
  return "active";
}

/** When the demo company will be deleted. */
export function demoDeleteAt(endsAtISO: string): Date {
  return new Date(new Date(endsAtISO).getTime() + DEMO_GRACE_DAYS * DAY_MS);
}

/** Whole days left, rounded up, never below 0. */
export function demoDaysLeft(endsAtISO: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(endsAtISO).getTime() - now.getTime()) / DAY_MS));
}

/** The length the founder typed, in days: blank means the default, and it must be 1 to 365. */
export function parseDemoDays(raw: string | null | undefined): { ok: true; days: number } | { ok: false; error: string } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, days: DEFAULT_DEMO_DAYS };
  if (!/^\d+$/.test(s)) return { ok: false, error: "Enter the length of the demo as a whole number of days." };
  const n = Number(s);
  if (n < 1 || n > MAX_DEMO_DAYS) return { ok: false, error: `A demo runs for 1 to ${MAX_DEMO_DAYS} days.` };
  return { ok: true, days: n };
}

/** A new end date: the days counted from now, ending at 23:59 London is not needed; exact time is fine. */
export function demoEndsAt(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * THE PART OF THE APP a page belongs to, for "what did they use most". The first path segment,
 * mapped to a stable name the founder reads. Anything unknown is "other"; the founder's own pages
 * never count.
 */
const AREAS: Record<string, string> = {
  dashboard: "dashboard",
  people: "people",
  "service-users": "service_users",
  forms: "forms",
  evidence: "evidence",
  reports: "reports",
  complaints: "complaints",
  incidents: "incidents",
  whistleblowing: "whistleblowing",
  planner: "planner",
  "on-call": "on_call",
  briefings: "briefings",
  invoicing: "invoicing",
  readiness: "readiness",
  settings: "settings",
  my: "my_area",
  "demo-feedback": "feedback",
  demo: "try_ai",
};

export function demoAreaFor(pathname: string): string {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  const first = parts[0] ?? "dashboard";
  if (first === "people" && parts[1] === "training") return "training";
  if (first === "people" && (parts[1] === "absence" || parts[1] === "holidays")) return "absence_holidays";
  return AREAS[first] ?? "other";
}

export const DEMO_AREA_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  people: "People",
  service_users: "Service Users",
  training: "Training",
  absence_holidays: "Absence and Holidays",
  forms: "Forms",
  evidence: "Evidence",
  reports: "Reports",
  complaints: "Complaints",
  incidents: "Incidents",
  whistleblowing: "Whistleblowing",
  planner: "Planner",
  on_call: "On Call",
  briefings: "Briefings",
  invoicing: "Invoicing",
  readiness: "Inspection Readiness",
  settings: "Settings",
  my_area: "My area",
  feedback: "Feedback",
  try_ai: "Try the AI",
  other: "Other",
};

/** "1 hr 5 min", "12 min", "40 sec", "0 min". */
export function formatActiveTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return "0 min";
  if (s < 60) return `${s} sec`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export type DemoUsage = {
  logins: number;
  totalSeconds: number;
  averageSeconds: number;
  lastSeen: string | null;
  /** Most used first; ties by name. */
  areas: Array<{ area: string; label: string; seconds: number; share: number }>;
};

/** The founder's figures for one login (or a whole demo, by passing every row). */
export function summariseDemoUsage(
  visits: Array<{ active_seconds: number; last_seen_at: string }>,
  areaRows: Array<{ area: string; seconds: number }>,
): DemoUsage {
  const logins = visits.length;
  const totalSeconds = visits.reduce((a, v) => a + Math.max(0, v.active_seconds || 0), 0);
  const lastSeen = visits.reduce<string | null>((a, v) => (!a || v.last_seen_at > a ? v.last_seen_at : a), null);
  const merged = new Map<string, number>();
  for (const r of areaRows) merged.set(r.area, (merged.get(r.area) ?? 0) + Math.max(0, r.seconds || 0));
  const areaTotal = [...merged.values()].reduce((a, b) => a + b, 0);
  const areas = [...merged.entries()]
    .filter(([, s]) => s > 0)
    .map(([area, seconds]) => ({
      area,
      label: DEMO_AREA_LABELS[area] ?? "Other",
      seconds,
      share: areaTotal > 0 ? Math.round((seconds / areaTotal) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
  return { logins, totalSeconds, averageSeconds: logins > 0 ? Math.round(totalSeconds / logins) : 0, lastSeen, areas };
}

/** The survey's rated questions, in order. Keys match the demo_feedback columns. */
export const DEMO_SURVEY_RATINGS = [
  { key: "ease_of_use", label: "How easy it was to use" },
  { key: "looks", label: "How it looks" },
  { key: "registers_checks", label: "Registers and checks" },
  { key: "forms_evidence", label: "Forms and evidence" },
  { key: "reports", label: "Reports" },
  { key: "overall", label: "Overall" },
  { key: "likely_to_sign_up", label: "How likely you are to sign up" },
] as const;

export type DemoRatingKey = (typeof DEMO_SURVEY_RATINGS)[number]["key"];

/** Read the seven ratings from a submitted form. Every one must be 1 to 5. */
export function parseDemoRatings(get: (key: string) => string | null): { ok: true; ratings: Record<DemoRatingKey, number> } | { ok: false; error: string } {
  const out = {} as Record<DemoRatingKey, number>;
  for (const q of DEMO_SURVEY_RATINGS) {
    const v = Number((get(q.key) ?? "").trim());
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return { ok: false, error: `Give "${q.label}" a score from 1 to 5.` };
    }
    out[q.key] = v;
  }
  return { ok: true, ratings: out };
}

/** The average of the ratings given, to one decimal place, or null when none. */
export function averageRating(values: Array<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** "Friday 9 October", in London. */
export function formatDemoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
}

/**
 * Turn a sign-in service refusal into plain English for the founder. The password itself is never
 * part of the message.
 */
export function friendlyLoginError(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (/weak|easy to guess|pwned|leaked|breach/i.test(m)) {
    return "That password has turned up in lists of passwords leaked online, so it is not allowed. Choose a different one.";
  }
  if (/already (been )?registered|already exists|email_exists/i.test(m)) {
    return "That email already has a Be Care Compliant login. Use another address, for example name+demo@their-company.co.uk.";
  }
  if (/password/i.test(m) && /(at least|characters|should contain|too short)/i.test(m)) {
    return "That password is too simple. Use at least 8 characters with a mix of letters and numbers.";
  }
  return m ? `The login could not be created: ${m}` : "The login could not be created. Try again.";
}
