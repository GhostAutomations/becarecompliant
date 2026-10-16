/**
 * Be Care Compliant: clock in and out, the pure half (Rota and Visits Stage 3, Phil 2026-10-16).
 * Importless, so node --test runs it.
 *
 * The phone decides what to show (inside, outside so ask for a reason, or unclear) with the same
 * rules the server uses to store it (rota_clock_record, 0493). The server's answer is the record;
 * the phone's is only there so a carer with no signal is asked for a reason at the door, not later.
 *
 * The outbox rules are the offline design (docs/project/rota-offline-design.md, sections 2 to 4):
 * every tap is an event with its own id; an event leaves the phone only when the server says it
 * was Accepted or it Already had it; a Refused event stays, with the reason, for the carer to see.
 */

export type Point = { lat: number; lng: number };
export type Fix = Point & { accuracy: number };
export type Place = Point & { radius: number };

export const CLOCK_OPENS_MINUTES = 30; // Phil, 2026-10-16
export const CLOCK_CLOSES_HOURS = 3; // a forgotten clock out can still be recorded for a while

/** Straight line metres (haversine, mean Earth radius), rounded, as the database does. */
export function metresBetween(a: Point, b: Point): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export type Outcome = "inside" | "outside" | "unclear";

/**
 * Inside the radius: fine. Outside: ask for a reason. No position, a position rougher than the
 * radius, or no map point for the place yet: unclear (Phil, 2026-10-16), never asked for a reason.
 */
export function clockOutcome(fix: Fix | null, place: Place | null): { outcome: Outcome; metres: number | null } {
  if (!place) return { outcome: "unclear", metres: null };
  if (!fix) return { outcome: "unclear", metres: null };
  const metres = metresBetween(fix, place);
  if (!(fix.accuracy >= 0) || fix.accuracy > place.radius) return { outcome: "unclear", metres };
  return { outcome: metres <= place.radius ? "inside" : "outside", metres };
}

/** Clock in opens 30 minutes before the start and stays open until 3 hours after the end. */
export function clockOpen(nowMs: number, startsAtMs: number, endsAtMs: number): boolean {
  return nowMs >= startsAtMs - CLOCK_OPENS_MINUTES * 60_000 && nowMs <= endsAtMs + CLOCK_CLOSES_HOURS * 3_600_000;
}

/** Minutes until clock in opens (0 when it is open or has closed). */
export function minutesUntilOpen(nowMs: number, startsAtMs: number): number {
  const ms = startsAtMs - CLOCK_OPENS_MINUTES * 60_000 - nowMs;
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/** Phil's four reasons for clocking in outside the radius (2026-10-16). */
export const OUTSIDE_REASONS = [
  { code: "gps_wrong", label: "GPS is wrong, I am at the home" },
  { code: "met_elsewhere", label: "Met the service user elsewhere (appointment or outing)" },
  { code: "poor_signal", label: "Poor signal" },
  { code: "other", label: "Other" },
] as const;
export type ReasonCode = (typeof OUTSIDE_REASONS)[number]["code"];

export function reasonLabel(code: string | null | undefined): string | null {
  return OUTSIDE_REASONS.find((r) => r.code === code)?.label ?? null;
}

/** One tap, as it waits on the phone and as it is sent. */
export type ClockEvent = {
  event_id: string;
  owner: string; // the profile signed in when it was made; only that sign in may send it
  kind: "in" | "out";
  target_kind: "visit" | "shift";
  target_id: string;
  method: "gps" | "qr" | "nfc";
  phone_time: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  qr_token?: string | null;
  reason_code?: ReasonCode | null;
  reason_text?: string | null;
  device_id?: string | null;
  device_seq?: number | null;
  refused?: string | null; // set when the server refused it; it then stays on the phone
};

export type SubmitResult = { event_id: string; result: "accepted" | "duplicate" | "refused"; reason: string | null };

/** The next batch to send: this sign in's own waiting events (not refused ones), oldest first. */
export function nextBatch(queue: ClockEvent[], owner: string, max = 50): ClockEvent[] {
  return queue
    .filter((e) => e.owner === owner && !e.refused)
    .sort((a, b) => a.phone_time.localeCompare(b.phone_time) || (a.device_seq ?? 0) - (b.device_seq ?? 0))
    .slice(0, max);
}

/**
 * After a send: which events can leave the phone (Accepted or Already had it) and which were
 * refused (kept, with the reason). An event the server did not answer about stays as it was, to
 * go again next time.
 */
export function applyResults(results: SubmitResult[]): { remove: string[]; refuse: { event_id: string; reason: string }[] } {
  const remove: string[] = [];
  const refuse: { event_id: string; reason: string }[] = [];
  for (const r of results) {
    if (r.result === "accepted" || r.result === "duplicate") remove.push(r.event_id);
    else if (r.result === "refused") refuse.push({ event_id: r.event_id, reason: r.reason || "Refused by the server." });
  }
  return { remove, refuse };
}

/** What a carer has recorded for one visit or shift, from the server's day and the phone's outbox. */
export function clockState(
  target: { target_id: string; clocked_in_at: string | null; clocked_out_at: string | null },
  queue: ClockEvent[],
  owner: string,
): { inAt: string | null; outAt: string | null; inWaiting: boolean; outWaiting: boolean } {
  const mine = queue.filter((e) => e.owner === owner && e.target_id === target.target_id && !e.refused);
  const inWait = mine.find((e) => e.kind === "in");
  const outWait = mine.find((e) => e.kind === "out");
  return {
    inAt: target.clocked_in_at ?? inWait?.phone_time ?? null,
    outAt: target.clocked_out_at ?? outWait?.phone_time ?? null,
    inWaiting: !target.clocked_in_at && Boolean(inWait),
    outWaiting: !target.clocked_out_at && Boolean(outWait),
  };
}

/** The office's words for a stored clock record's flags. */
const FLAG_WORDS: Record<string, string> = {
  moved: "Not on this visit any more",
  cancelled: "Visit was cancelled",
  not_published: "Not published",
  early: "More than 30 minutes early",
  no_clock_in: "Clock out with no clock in",
  repeat: "Recorded more than once",
  wrong_code: "QR code did not match",
  no_map_point: "No map point for the place yet",
  no_reason: "Outside with no reason",
  phone_clock: "Phone clock was wrong (corrected)",
  offline: "Recorded offline, sent later",
};
export function flagWords(flag: string): string {
  return FLAG_WORDS[flag] ?? flag;
}

/** "Inside", "640 m away: Poor signal", "Location unclear", "QR code", "By text", "Added by the office". */
export function locationWords(e: {
  location: string;
  distance_m: number | null;
  reason_code: string | null;
  reason_text: string | null;
  method: string;
}): string {
  switch (e.location) {
    case "inside":
      return "At the home";
    case "outside": {
      const away = e.distance_m != null ? `${e.distance_m.toLocaleString("en-GB")} m away` : "Outside the radius";
      const why = e.reason_code === "other" ? e.reason_text || "Other" : reasonLabel(e.reason_code);
      return why ? `${away}: ${why}` : away;
    }
    case "proved":
      return e.method === "nfc" ? "NFC sticker" : "QR code";
    case "text":
      return "By text";
    case "office":
      return "Added by the office";
    default:
      return "Location unclear";
  }
}

/** The QR or NFC code in a scanned link: /c/<token> (the sticker adds ?via=nfc). */
export function codeFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([0-9a-f]{36})\/?$/);
  return m ? m[1] : null;
}

/** IN or OUT and the code, from a text such as "in ab3cd" or "OUT  AB3CD." */
export function parseClockText(body: string): { kind: "in" | "out"; code: string } | null {
  const m = body.trim().replace(/[.!]+$/, "").match(/^(in|out)\s+([A-Za-z0-9]{5})$/i);
  return m ? { kind: m[1].toLowerCase() as "in" | "out", code: m[2].toUpperCase() } : null;
}

